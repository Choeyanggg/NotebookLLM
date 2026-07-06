from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from rag.loader import save_upload, process_documents, process_url, process_topic
from rag.embedding import text_splitter, EmbeddingManager
from rag.vectorstore import VectorStore
from rag.retriever import RAGRetriever
from rag.llm import AdvancedRagPipeline
from fastapi.middleware.cors import CORSMiddleware
from langchain_groq import ChatGroq
from pydantic import BaseModel
from dotenv import load_dotenv
from db import supabase
import os

load_dotenv()

embedding_manager = EmbeddingManager()
vector_store = VectorStore()
rag_retriever = RAGRetriever(vector_store, embedding_manager)
groq_api_key = os.getenv("Groq_API_Key")
llm = ChatGroq(groq_api_key=groq_api_key, model_name="llama-3.1-8b-instant", temperature=0.1, max_tokens=1024)
adv_rag = AdvancedRagPipeline(rag_retriever, llm, db=supabase)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload/document")
async def upload_document(file: UploadFile = File(...), session_id: str = Form(...)):
    saved_path = await save_upload(file)

    try:
        documents = process_documents(saved_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to process {file.filename}: {e}")

    if not documents:
        raise HTTPException(status_code=422, detail=f"No content could be extracted from {file.filename}")

    chunks = text_splitter.split_documents(documents)

    preview = [
        {
            "chunk": i + 1,
            "page": (
                chunk.metadata.get("page", "Unknown") + 1
                if isinstance(chunk.metadata.get("page"), int)
                else "Unknown"
            ),
            "content": chunk.page_content,
        }
        for i, chunk in enumerate(chunks)
    ]

    texts = [chunk.page_content for chunk in chunks]
    embeddings = embedding_manager.generate_embeddings(texts)

    vector_store.add_documents(chunks, embeddings, session_id=session_id)

    return {
        "filename": file.filename,
        "file_type": documents[0].metadata.get("file_type", "unknown"),
        "pages_loaded": len(documents),
        "chunks_created": len(chunks),
        "embedding_shape": list(embeddings.shape),
        "preview": preview,
    }


class SourceProcessRequest(BaseModel):
    title: str
    type: str  # 'url' | 'topic'
    session_id: str | None = None


@app.post("/sources/process")
async def process_source(request: SourceProcessRequest):
    session_id = request.session_id
    if not session_id:
        resp = supabase.table("sessions").insert({
            "visitor_id": None,
            "title": request.title[:60]
        }).execute()
        session_id = resp.data[0]["id"]

    try:
        if request.type == "url":
            documents = process_url(request.title)
        elif request.type == "topic":
            documents = process_topic(request.title)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported source type: {request.type}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to process source: {e}")

    if not documents:
        raise HTTPException(status_code=422, detail="No content could be extracted from this source")

    chunks = text_splitter.split_documents(documents)
    texts = [chunk.page_content for chunk in chunks]
    embeddings = embedding_manager.generate_embeddings(texts)

    vector_store.add_documents(chunks, embeddings, session_id=session_id)

    content = "\n\n".join(doc.page_content for doc in documents)

    return {
        "title": request.title,
        "type": request.type,
        "session_id": session_id,
        "documents_loaded": len(documents),
        "chunks_created": len(chunks),
        "content": content,
    }

class QueryRequest(BaseModel):
    question: str
    session_id: str | None = None
    visitor_id: str | None = None

@app.post("/session/new")
async def new_session(visitor_id: str | None = None):
    resp = supabase.table("sessions").insert({
        "visitor_id": visitor_id,
        "title": "New conversation"
    }).execute()
    return {"session_id": resp.data[0]["id"]}

@app.post("/query")
async def ask(request: QueryRequest):
    session_id = request.session_id
    if not session_id:
        resp = supabase.table("sessions").insert({
            "visitor_id": request.visitor_id,
            "title": request.question[:60]
        }).execute()
        session_id = resp.data[0]["id"]

    answer = adv_rag.query(
        question=request.question,
        session_id=session_id,
        top_k=5,
        min_score=0.35,
        summarize=True
    )
    return answer

@app.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    resp = (
        supabase.table("messages")
        .select("role, content, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .execute()
    )
    return resp.data

@app.get("/sessions")
async def list_sessions(visitor_id: str):
    sessions_resp=(
        supabase.table("sessions")
        .select("id,title,created_at")
        .eq("visitor_id",visitor_id)
        .order("created_at",desc=True)
        .execute()
    )
    sessions=sessions_resp.data or []
    result=[]
    for s in sessions:
        count_resp=(
            supabase.table("messages")
            .select("id")
            .eq("session_id",s["id"])
            .execute()
        )
        result.append({
            "id":s["id"],
            "title":s.get("title"),
            "created_at": s["created_at"],
            "message_count":len(count_resp.data or [])
        })
    return result