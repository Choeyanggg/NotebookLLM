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

    def query(self, question: str, session_id: str = None, top_k: int = 5, min_score: float = 0.45, summarize: bool = False):
        if GREETING_PATTERNS.match(question.strip()):
            answer = "Hi! I'm your document assistant — upload a file and ask me anything about it."
            self._save_turn(session_id, "user", question)
            self._save_turn(session_id, "assistant", answer)
            return {
                'question': question,
                'answer': answer,
                'sources': [],
                'summary': None,
                'session_id': session_id
            }

        result = self.retriever.retrieve(question, top_k=top_k, threshold=min_score)

        if not result:
            answer = (
                "I couldn't find anything about that in your uploaded documents. "
                "Try asking something related to the content you've uploaded."
            )
            self._save_turn(session_id, "user", question)
            self._save_turn(session_id, "assistant", answer)
            return {
                'question': question,
                'answer': answer,
                'sources': [],
                'summary': None,
                'session_id': session_id
            }

        history = self._get_history(session_id)
        history_text = "\n".join(f"{h['role']}: {h['content']}" for h in history)

        context = "\n\n".join(doc['content'] for doc in result)
        sources = [{
            'source': doc['metadata'].get('source_file', doc['metadata'].get('source', 'unknown')),
            'page':   doc['metadata'].get('page', 'unknown'),
            'score':  doc['similarity_score'],
            'preview': doc['content'][:120] + '...'
        } for doc in result]

        prompt = f"""Conversation so far:
{history_text if history_text else '(no previous messages)'}

You must answer using ONLY the information in the context below. Do not use any
outside knowledge, even if you know the answer. If the context does not fully
answer the question, say so explicitly rather than filling in gaps from your
own knowledge.

Context:
{context}

Question: {question}

Answer (grounded strictly in the context above):"""

        response = self.llm.invoke([prompt])
        answer = response.content

        citations = [f"[{i+1}] {src['source']} (page {src['page']})" for i, src in enumerate(sources)]
        answer_with_citations = answer + "\n\nCitations:\n" + "\n".join(citations) if citations else answer

        self._save_turn(session_id, "user", question)
        self._save_turn(session_id, "assistant", answer)

        return {
            'question': question,
            'answer': answer_with_citations,
            'sources': sources,
            'summary': None,
            'session_id': session_id
        }