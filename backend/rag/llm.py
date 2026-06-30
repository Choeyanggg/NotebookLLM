import time

class AdvancedRagPipeline:
    def __init__(self,retriever,llm):
        self.retriever=retriever
        self.llm=llm 
        self.history=[]

    def query(self,question: str,top_k:int=5, min_score: float=0.2, stream: bool = False, summarize: bool = False):
        result=self.retriever.retrieve(question,top_k=top_k,threshold=min_score)
        context="/n/n".join(doc['content'] for doc in result)
        sources = [{
                'source': doc['metadata'].get('source_file', doc['metadata'].get('source', 'unknown')),
                'page': doc['metadata'].get('page', 'unknown'),
                'score': doc['similarity_score'],
                'preview': doc['content'][:120] + '...'
        } for doc in result]
        prompt = f"""Use the following context to answer the question concisely.\nContext:\n{context}\n\nQuestion: {question}\n\nAnswer:"""
        if stream:
            print("Streaming answer:")
            for i in range(0, len(prompt), 80):
                print(prompt[i:i+80], end='', flush=True)
                time.sleep(0.05)
            print()
        response = self.llm.invoke([prompt.format(context=context, question=question)])
        answer = response.content

        # Add citations to answer
        citations = [f"[{i+1}] {src['source']} (page {src['page']})" for i, src in enumerate(sources)]
        answer_with_citations = answer + "\n\nCitations:\n" + "\n".join(citations) if citations else answer

        summary = None
        if summarize and answer:
            summary_prompt = f"Summarize the following answer in 2 sentences:\n{answer}"
            summary_resp = self.llm.invoke([summary_prompt])
            summary = summary_resp.content

        # Store query history
        self.history.append({
            'question': question,
            'answer': answer,
            'sources': sources,
            'summary': summary
        })

        return {
            'question': question,
            'answer': answer_with_citations,
            'sources': sources,
            'summary': summary,
            'history': self.history
        }