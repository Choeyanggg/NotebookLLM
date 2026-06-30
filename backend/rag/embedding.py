from langchain_text_splitters import RecursiveCharacterTextSplitter
import numpy as np
from sentence_transformers import SentenceTransformer

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", " ", ""]
)

class EmbeddingManager:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self):
        self.model = SentenceTransformer(self.model_name)
        print(f"Loaded embedding model: {self.model_name}")

    def generate_embeddings(self, texts: list[str]) -> np.ndarray:
        if self.model is None:
            raise ValueError("Model not loaded")
        embeddings = self.model.encode(texts, show_progress_bar=True)
        return embeddings


