from langchain_community.document_loaders import PyMuPDFLoader,TextLoader,Docx2txtLoader,CSVLoader,WebBaseLoader
from pathlib import Path
from typing import List
from langchain_core.documents import Document
import os
import shutil

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True) 

async def save_upload(file) -> str:
    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    print(f"Saved: {file.filename}")
    return save_path

def process_pdf(file_path: str) -> List[Document]:
    all_documents = []
    loader = PyMuPDFLoader(file_path)
    documents = loader.load()

    for doc in documents:
        doc.metadata['source_file'] = Path(file_path).name
        doc.metadata['file_type'] = 'pdf'

    all_documents.extend(documents)
    print(f"Loaded PDF: {Path(file_path).name} — {len(documents)} pages")
    return all_documents
'''
def process_txt(file_path: str) ->List[Document]:
    all_document=[]
    loader=TextLoader(file_path)
    documents=loader.load()

    for doc in documents:
        doc.metadata['source_file']=Path(file_path).name
        doc.metadata['file_type']='txt'

    all_document.extend(documents)
    print(f"Loaded TXT: {Path(file_path).name}")
    return all_document
'''
