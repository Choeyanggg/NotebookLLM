from .vectorstore import VectorStore
from .embedding import EmbeddingManager
from typing import List, Dict, Any

class RAGRetriever:
    def __init__(self, vector_store: VectorStore, embedding_manager: EmbeddingManager):
        self.vector_store = vector_store
        self.embedding_manager = embedding_manager

    def retrieve(self, query: str, top_k: int = 5, threshold: float = 0.35, session_id: str = None) -> List[Dict[str, Any]]:
        query_embedding = self.embedding_manager.generate_embeddings([query])[0]
        where = {"session_id": session_id} if session_id else None

        result = self.vector_store.collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=top_k,
            where=where
        )
        retrieved_docs = []

        if result['documents'] and result['documents'][0]:
            documents = result['documents'][0]
            metadatas = result['metadatas'][0]
            distances = result['distances'][0]
            ids = result['ids'][0]

            for i, (id, doc, metadata, distance) in enumerate(zip(ids, documents, metadatas, distances)):
                similarity_score = 1 - distance

                if similarity_score >= threshold:
                    retrieved_docs.append({
                        'id': id,
                        'content': doc,
                        'metadata': metadata,
                        'similarity_score': similarity_score,
                        'distance': distance,
                        'rank': i + 1
                    })
            print(f"Retrieved {len(retrieved_docs)} documents (after filtering, session={session_id})")
        return retrieved_docs