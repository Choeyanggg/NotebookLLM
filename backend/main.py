from fastapi import FastAPI, UploadFile, File
from rag.loader import save_upload, process_pdf
from rag.embedding import text_splitter, EmbeddingManager
from rag.vectorstore import VectorStore
from rag.retriever import RAGRetriever
from rag.llm import AdvancedRagPipeline
from fastapi.middleware.cors import CORSMiddleware
from langchain_groq import ChatGroq
from pydantic import BaseModel
from dotenv import load_dotenv
import os

load_dotenv()

embedding_manager=EmbeddingManager()
vector_store=VectorStore()
rag_retriever=RAGRetriever(vector_store,embedding_manager)
groq_api_key=os.getenv("Groq_API_Key")
llm=ChatGroq( groq_api_key=groq_api_key, model_name="llama-3.1-8b-instant",temperature=0.1,max_tokens=1024)
adv_rag=AdvancedRagPipeline(rag_retriever,llm)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tells browser — ALL origins are welcome
    allow_methods=["*"],   # allows GET, POST, DELETE etc
    allow_headers=["*"],   # allows all headers
)

@app.post("/upload/pdf")
async def upload_pdf(file: UploadFile = File(...)):
    saved_path = await save_upload(file)
    documents = process_pdf(saved_path)
    chunks=text_splitter.split_documents(documents)
    texts=[chunk.page_content for chunk in chunks]
    embeddings=embedding_manager.generate_embeddings(texts)
    vector_store.add_documents(chunks,embeddings)

    return {
        "filename":       file.filename,
        "pages_loaded":   len(documents),
        "chunks_created": len(chunks),
        "embedding_shape": list(embeddings.shape)
    }

class QueryRequest(BaseModel):
    question: str

@app.post("/query")
async def ask(request: QueryRequest):
    answer = adv_rag.query(
        question=request.question,
        top_k=5,
        min_score=0.1,
        summarize=True
    )

    return answer