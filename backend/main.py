from fastapi import FastAPI, UploadFile, File, Form
from rag.loader import save_upload, process_pdf
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

@app.post("/upload/pdf")
async def upload_pdf(file: UploadFile = File(...), session_id: str = Form(...)):
    saved_path = await save_upload(file)
    documents = process_pdf(saved_path)
    chunks = text_splitter.split_documents(documents)
    texts = [chunk.page_content for chunk in chunks]
    embeddings = embedding_manager.generate_embeddings(texts)
    vector_store.add_documents(chunks, embeddings, session_id=session_id)

    return {
        "filename": file.filename,
        "pages_loaded": len(documents),
        "chunks_created": len(chunks),
        "embedding_shape": list(embeddings.shape)
    }

class QueryRequest(BaseModel):
    question: str
    session_id: str | None = None

@app.post("/session/new")
async def new_session():
    resp = supabase.table("sessions").insert({}).execute()
    return {"session_id": resp.data[0]["id"]}

@app.post("/query")
async def ask(request: QueryRequest):
    session_id = request.session_id
    if not session_id:
        resp = supabase.table("sessions").insert({}).execute()
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