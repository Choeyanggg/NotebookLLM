from typing import List, Dict, Any, Tuple
import numpy as np
import uuid
import os
import chromadb

class VectorStore:
    def __init__(self, collection_name: str = "pdf_documents", persist_directory: str = "./vector_store"):
        self.collection_name = collection_name
        self.persist_directory = persist_directory
        self.client = None
        self.collection = None
        self._initialize_store()

    def _initialize_store(self):
        os.makedirs(self.persist_directory, exist_ok=True)
        self.client = chromadb.PersistentClient(path=self.persist_directory)        
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"description": "PDF document embeddings for RAG"}
        )

    def add_documents(self, documents: List[Any], embeddings: np.ndarray):
        if(len(documents)!=len(embeddings)):
            raise ValueError("Number of documents must match number of embeddings")

        ids=[]
        metadatas=[]
        documents_text=[]
        embedding_list=[]

        for i,(doc,embedding) in enumerate(zip(documents,embeddings)):
            doc_id=f"doc_{uuid.uuid4().hex[:8]}_{i}"
            ids.append(doc_id)

            metadata=dict(doc.metadata)
            metadata['doc_index']=i
            metadata["page_length"]=len(doc.page_content)
            metadatas.append(metadata)

            documents_text.append(doc.page_content)

            embedding_list.append(embedding.tolist())

        self.collection.add(
            ids=ids,
            metadatas=metadatas,
            documents=documents_text,
            embeddings=embedding_list
        )

