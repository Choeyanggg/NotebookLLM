from fastapi import FastAPI, UploadFile, File
from rag.loader import save_upload, process_pdf
from rag.embedding import text_splitter, EmbeddingManager
from rag.vectorstore import VectorStore
from fastapi.middleware.cors import CORSMiddleware

embedding_manager=EmbeddingManager()
vector_store=VectorStore()

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