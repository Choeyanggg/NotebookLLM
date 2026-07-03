import re

GREETING_PATTERNS = re.compile(
    r"^\s*(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|"
    r"how are you|what can you do|who are you|help)\s*[!.?]*\s*$",
    re.IGNORECASE
)

class AdvancedRagPipeline:
    def __init__(self, retriever, llm, db=None):
        self.retriever = retriever
        self.llm = llm
        self.db = db

    def _get_history(self, session_id, limit=6):
        if not self.db or not session_id:
            return []
        resp = (
            self.db.table("messages")
            .select("role, content")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return resp.data or []

    def _save_turn(self, session_id, role, content):
        if not self.db or not session_id:
            return
        self.db.table("messages").insert({
            "session_id": session_id,
            "role": role,
            "content": content
        }).execute()

    def query(self, question: str, session_id: str = None, top_k: int = 5, min_score: float = 0.35, summarize: bool = False):
        if GREETING_PATTERNS.match(question.strip()):
            answer = "Hi! I'm your document assistant — upload a file and ask me anything about it."
            self._save_turn(session_id, "user", question)
            self._save_turn(session_id, "assistant", answer)
            return {
                'question': question, 'answer': answer, 'sources': [],
                'summary': None, 'session_id': session_id
            }

        result = self.retriever.retrieve(question, top_k=top_k, threshold=min_score, session_id=session_id)

        if not result:
            answer = "I don't have enough information in the uploaded documents to answer that."
            self._save_turn(session_id, "user", question)
            self._save_turn(session_id, "assistant", answer)
            return {
                'question': question, 'answer': answer, 'sources': [],
                'summary': None, 'session_id': session_id
            }

        history = self._get_history(session_id)
        history_text = "\n".join(f"{h['role']}: {h['content']}" for h in history)

        labeled_chunks = []
        for i, doc in enumerate(result):
            src = doc['metadata'].get('source_file', 'unknown')
            page = doc['metadata'].get('page', 'unknown')
            labeled_chunks.append(f"[{i+1}] (source: {src}, page: {page})\n{doc['content']}")
        context = "\n\n".join(labeled_chunks)

        sources = [{
            'source': doc['metadata'].get('source_file', 'unknown'),
            'page': doc['metadata'].get('page', 'unknown'),
            'score': doc['similarity_score'],
            'preview': doc['content'][:120] + '...'
        } for doc in result]

        system_prompt = """You are a document assistant. You answer ONLY using the numbered context chunks provided below — never your own general knowledge, even if you're confident about the answer.

Rules:
1. Every factual claim in your answer must be traceable to a specific chunk. Cite it inline using its number, like [1] or [2][3].
2. If the context chunks only partially answer the question, answer the part you can and explicitly say what's missing.
3. If none of the chunks are actually relevant to the question, say: "I don't have enough information in the uploaded documents to answer that." Do not guess.
4. Do not blend in outside knowledge to fill gaps, even for well-known facts.
5. Keep the answer grounded and concise — don't pad with generic explanation not present in the context."""

        prompt = f"""{system_prompt}

Conversation so far:
{history_text if history_text else '(no previous messages)'}

Context chunks:
{context}

Question: {question}

Answer (cite chunk numbers inline):"""

        response = self.llm.invoke([prompt])
        answer = response.content

        cited_indices = set(int(n) for n in re.findall(r'\[(\d+)\]', answer))
        used_sources = [sources[i - 1] for i in sorted(cited_indices) if 0 < i <= len(sources)]

        self._save_turn(session_id, "user", question)
        self._save_turn(session_id, "assistant", answer)

        return {
            'question': question,
            'answer': answer,
            'sources': used_sources if used_sources else sources,
            'summary': None,
            'session_id': session_id
        }