from typing import List, Dict, Any
import numpy as np
import uuid
import os
import chromadb
from dotenv import load_dotenv

load_dotenv()

class VectorStore:
    def __init__(self, collection_name: str = "pdf_documents"):
        self.collection_name = collection_name
        self.client = None
        self.collection = None
        self._initialize_store()

    def _initialize_store(self):
        self.client = chromadb.CloudClient(
            tenant=os.getenv("CHROMA_TENANT"),
            database=os.getenv("CHROMA_DATABASE"),
            api_key=os.getenv("CHROMA_API_KEY"),
        )
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            configuration={"spann": {"space": "cosine"}}
        )

    def add_documents(self, documents: List[Any], embeddings: np.ndarray, session_id: str):
        if len(documents) != len(embeddings):
            raise ValueError("Number of documents must match number of embeddings")

        ids, metadatas, documents_text, embedding_list = [], [], [], []

        for i, (doc, embedding) in enumerate(zip(documents, embeddings)):
            doc_id = f"doc_{uuid.uuid4().hex[:8]}_{i}"
            ids.append(doc_id)

            metadata = dict(doc.metadata)
            metadata['doc_index'] = i
            metadata['page_length'] = len(doc.page_content)
            metadata['session_id'] = session_id
            metadatas.append(metadata)

            documents_text.append(doc.page_content)
            embedding_list.append(embedding.tolist())

        self.collection.add(
            ids=ids,
            metadatas=metadatas,
            documents=documents_text,
            embeddings=embedding_list
        )