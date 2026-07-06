from langchain_community.document_loaders import PyMuPDFLoader,TextLoader,Docx2txtLoader,CSVLoader,WebBaseLoader
from langchain_community.tools.tavily_search import TavilySearchResults
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

def process_txt(file_path: str) ->List[Document]:
    all_document=[]
    try:
        loader = TextLoader(file_path, encoding="utf-8")
        documents = loader.load()
    except UnicodeDecodeError:
        print(f"UTF-8 failed for {file_path}, retrying with utf-8-sig/latin-1")
        try:
            loader = TextLoader(file_path, encoding="utf-8-sig")
            documents = loader.load()
        except UnicodeDecodeError:
            loader = TextLoader(file_path, encoding="latin-1")
            documents = loader.load()

    for doc in documents:
        doc.metadata['source_file']=Path(file_path).name
        doc.metadata['file_type']='txt'

    all_document.extend(documents)
    print(f"Loaded TXT: {Path(file_path).name}")
    return all_document

def process_csv(file_path: str) ->List[Document]:
    all_document=[]
    loader=CSVLoader(file_path)
    documents=loader.load()

    for doc in documents:
        doc.metadata['source_file']=Path(file_path).name
        doc.metadata['file_type']='csv'

    all_document.extend(documents)
    return all_document

def process_url(url: str) ->List[Document]:
    all_documents=[]
    loader=WebBaseLoader(url)
    documents=loader.load()

    for doc in documents:
        doc.metadata["source_file"]=url
        doc.metadata["file_type"]="url"

    all_documents.extend(documents)
    return all_documents

def process_docs(file_path: str):
    all_documents=[]
    loader=Docx2txtLoader(file_path)
    documents=loader.load()

    for doc in documents:
        doc.metadata['source_file']=Path(file_path).name
        doc.metadata['file_type']='docx'

    all_documents.extend(documents)
    return all_documents

def process_topic(topic: str, max_results: int=5):
    all_documents=[]
    search_tool=TavilySearchResults(max_results=max_results)
    results=search_tool.invoke(topic)

    urls=[r['url'] for r in results]

    for url in urls:
        try:
            documents=process_url(url)
        except Exception as e:
            print(f"Failed to load {url}: {e}")
            continue
        for doc in documents:
            doc.metadata['topic']=topic
        all_documents.extend(documents)
    return all_documents

LOADER_MAP={
    '.pdf': process_pdf,
    '.csv': process_csv,
    '.docx': process_docs,
    '.txt': process_txt
}

def process_documents(file_path: str):
    extension=Path(file_path).suffix.lower()
    process_fun=LOADER_MAP.get(extension)

    if process_fun is None:
        raise ValueError(f"Unsupported file type: {extension}")
    print(f"Routing {Path(file_path).name} -> {process_fun.__name__}")
    return process_fun(file_path)