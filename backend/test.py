from rag.vectorstore import VectorStore
vs = VectorStore()
print(vs.client.heartbeat())
print(vs.collection.count())