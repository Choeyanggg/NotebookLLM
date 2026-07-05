import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Plus,
  Trash2,
  Link2,
  FileText,
  Check,
  Send,
  ThumbsUp,
  ThumbsDown,
  Copy,
  RefreshCw,
  X,
  Sparkles,
  Info,
  Sun,
  Moon,
  NotebookPen,
  History,
  MessageSquarePlus
} from 'lucide-react';
import { Source, Message, Citation } from './types';

function getOrCreateVisitorId(): string {
  let id = localStorage.getItem('rag_visitor_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('rag_visitor_id', id);
  }
  return id;
}

// Cleans up raw PDF-extracted text for readable display only.
// Does NOT touch what's actually stored/embedded — purely cosmetic.
function formatExtractedText(raw: string): string {
  return raw
    // rejoin words split across a line-wrap hyphen: "ma-\nchine" -> "machine"
    .replace(/(\w)-\n(\w)/g, '$1$2')
    // collapse single newlines (mid-sentence wraps) into spaces,
    // but keep intentional paragraph breaks (double newlines)
    .replace(/([^\n])\n(?!\n)([^\n])/g, '$1 $2')
    // collapse 3+ blank lines down to a normal paragraph gap
    .replace(/\n{3,}/g, '\n\n')
    // tidy leftover double spaces from the join above
    .replace(/ {2,}/g, ' ')
    .trim();
}

interface SessionSummary {
  id: string;
  title: string | null;
  created_at: string;
  message_count: number;
}

export default function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'topic'>('upload');

  // Real light/dark mode — browser-style: system preference on first load, then persisted
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const stored = localStorage.getItem('notebookllm-theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // ---- Visitor / session identity for chat history ----
  const [visitorId] = useState<string>(() => getOrCreateVisitorId());
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem('rag_session_id');
  });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('notebookllm-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Input fields
  const [urlInput, setUrlInput] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [chatInput, setChatInput] = useState('');

  // Modals & Panels
  const [selectedSourceForView, setSelectedSourceForView] = useState<Source | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<{ [key: string]: 'like' | 'dislike' | null }>({});

  // Loading/Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [isGeneratingChat, setIsGeneratingChat] = useState(false);

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);

  // References
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGeneratingChat]);

  // ---- Session history: load list for sidebar/dropdown ----
  const loadSessions = async () => {
    try {
      const res = await fetch(`/api/sessions?visitor_id=${visitorId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
  };

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Hydrate current session's messages on page load/refresh ----
  useEffect(() => {
    if (!sessionId) return;

    const hydrate = async () => {
      setIsHydrating(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/messages`);
        if (!res.ok) return;
        const data = await res.json();

        const hydrated: Message[] = data.map((m: any, i: number) => ({
          id: `msg-hydrated-${i}`,
          role: m.role === 'user' ? 'user' : 'model',
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));

        setMessages(hydrated);
      } catch (err) {
        console.error('Failed to hydrate session', err);
      } finally {
        setIsHydrating(false);
      }
    };

    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only — subsequent session switches are handled by resumeSession directly

  // ---- Resume a past session from the history panel ----
  const resumeSession = async (id: string) => {
    setIsHydrating(true);
    try {
      const res = await fetch(`/api/sessions/${id}/messages`);
      if (!res.ok) return;
      const data = await res.json();

      const hydrated: Message[] = data.map((m: any, i: number) => ({
        id: `msg-${id}-${i}`,
        role: m.role === 'user' ? 'user' : 'model',
        content: m.content,
        timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));

      setMessages(hydrated);
      setSessionId(id);
      localStorage.setItem('rag_session_id', id);
      setShowHistoryPanel(false);
    } catch (err) {
      console.error('Failed to resume session', err);
    } finally {
      setIsHydrating(false);
    }
  };

  // ---- Start a brand new chat (new session, same visitor) ----
  const startNewChat = () => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem('rag_session_id');
    setShowHistoryPanel(false);
  };

  const ensureSessionId = async (): Promise<string> => {
  if (sessionId) return sessionId;
  const res = await fetch('/api/session/new', { method: 'POST' });
  const data = await res.json();
  setSessionId(data.session_id);
  localStorage.setItem('rag_session_id', data.session_id);
  return data.session_id;
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const toggleSourceSelection = (id: string) => {
    setSources(prev =>
      prev.map(src => (src.id === id ? { ...src, selected: !src.selected } : src))
    );
  };

  const selectedSourcesCount = sources.filter(s => s.selected && s.status === 'ready').length;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processUploadedFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processUploadedFile(file);
    }
  };

  const processUploadedFile = async (file: File) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const isTxt = fileExtension === 'txt';
    const isPdf = fileExtension === 'pdf';

    if (!isTxt && !isPdf) {
      alert("Only PDF and TXT are supported right now. DOCX support is coming soon.");
      return;
    }

    const newSourceId = `src-${Date.now()}`;
    const newSource: Source = {
      id: newSourceId,
      title: file.name,
      type: 'file',
      fileType: fileExtension as 'pdf' | 'txt',
      status: 'processing',
      selected: true,
      content: ''
    };

    setSources(prev => [...prev, newSource]);
    setIsProcessing(true);
    setProcessingMsg(`Uploading and parsing ${file.name}...`);

    try {
      if (isTxt) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const text = event.target?.result as string;
          setSources(prev =>
            prev.map(src =>
              src.id === newSourceId
                ? { ...src, status: 'ready', content: text || 'Empty document.' }
                : src
            )
          );
          setIsProcessing(false);
        };
        reader.readAsText(file);
      } else {
        const activeSessionId = await ensureSessionId();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('session_id', activeSessionId);

        const response = await fetch('/api/upload/pdf', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        if (response.ok) {
          const allChunks = data.preview || [];
          const MAX_CHUNKS_SHOWN = 20;
          const MAX_CHARS_PER_CHUNK = 250;

          const chunkPreview = allChunks
            .slice(0, MAX_CHUNKS_SHOWN)
            .map((c: any) => {
              const cleaned = formatExtractedText(c.content);
              const truncated = cleaned.length > MAX_CHARS_PER_CHUNK
                ? cleaned.slice(0, MAX_CHARS_PER_CHUNK) + '...'
                : cleaned;
              return `--- Chunk ${c.chunk} (page ${c.page}) ---\n${truncated}`;
            })
            .join('\n\n');

          const remaining = allChunks.length - MAX_CHUNKS_SHOWN;
          const remainingNote = remaining > 0
            ? `\n\n... and ${remaining} more chunk${remaining === 1 ? '' : 's'} indexed (not shown here).`
            : '';

          setSources(prev =>
            prev.map(src =>
              src.id === newSourceId
                ? {
                    ...src,
                    status: 'ready',
                    content: `Indexed successfully. Pages loaded: ${data.pages_loaded} | Chunks created: ${data.chunks_created}\n\n${chunkPreview}${remainingNote}`
                  }
                : src
            )
          );
        } else {
          throw new Error(data.detail || data.error || "Failed to process document");
        }
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error(err);
      setSources(prev =>
        prev.map(src =>
          src.id === newSourceId
            ? { ...src, status: 'error', content: `Error parsing document: ${err.message}` }
            : src
        )
      );
      setIsProcessing(false);
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;

    let title = urlInput.trim();
    if (!title.startsWith('http://') && !title.startsWith('https://')) {
      title = 'https://' + title;
    }

    const cleanTitle = title.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    const newSourceId = `src-${Date.now()}`;
    const newSource: Source = {
      id: newSourceId,
      title: cleanTitle,
      type: 'url',
      status: 'processing',
      selected: true,
      content: ''
    };

    setSources(prev => [...prev, newSource]);
    setUrlInput('');
    setIsProcessing(true);
    setProcessingMsg(`Analyzing page content for ${cleanTitle}...`);

    try {
      const response = await fetch('/api/sources/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type: 'url' })
      });

      const data = await response.json();
      if (response.ok) {
        setSources(prev =>
          prev.map(src =>
            src.id === newSourceId ? { ...src, status: 'ready', content: data.content } : src
          )
        );
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error(err);
      setSources(prev =>
        prev.map(src =>
          src.id === newSourceId
            ? { ...src, status: 'error', content: `Failed to scrape URL: ${err.message}` }
            : src
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddTopic = async () => {
    if (!topicInput.trim()) return;

    const topicName = topicInput.trim();
    const newSourceId = `src-${Date.now()}`;
    const newSource: Source = {
      id: newSourceId,
      title: `Topic: ${topicName}`,
      type: 'topic',
      status: 'processing',
      selected: true,
      content: ''
    };

    setSources(prev => [...prev, newSource]);
    setTopicInput('');
    setIsProcessing(true);
    setProcessingMsg(`Synthesizing structured notes on "${topicName}"...`);

    try {
      const response = await fetch('/api/sources/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: topicName, type: 'topic' })
      });

      const data = await response.json();
      if (response.ok) {
        setSources(prev =>
          prev.map(src =>
            src.id === newSourceId ? { ...src, status: 'ready', content: data.content } : src
          )
        );
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error(err);
      setSources(prev =>
        prev.map(src =>
          src.id === newSourceId
            ? { ...src, status: 'error', content: `Failed to generate topic: ${err.message}` }
            : src
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSource = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSources(prev => prev.filter(s => s.id !== id));
    if (selectedSourceForView?.id === id) {
      setSelectedSourceForView(null);
    }
  };

  const handleUpdateSourceContent = (id: string, newContent: string) => {
    setSources(prev =>
      prev.map(src => (src.id === id ? { ...src, content: newContent } : src))
    );
    if (selectedSourceForView && selectedSourceForView.id === id) {
      setSelectedSourceForView(prev => (prev ? { ...prev, content: newContent } : null));
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isGeneratingChat) return;

    const userMsgText = chatInput.trim();
    setChatInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userMsgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setIsGeneratingChat(true);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsgText,
          session_id: sessionId,
          visitor_id: visitorId
        })
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();
      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id);
        localStorage.setItem('rag_session_id', data.session_id);
        loadSessions();
      }
      const cleanContent = data.answer.split(/\n\nCitations:\n/)[0];

      const citations: Citation[] = (data.sources || []).map((src: any, idx: number) => ({
        citationNumber: idx + 1,
        sourceTitle: src.source,
        sourceType: src.source?.split('.').pop() || 'txt',
        location: `P. ${src.page} — SCORE ${src.score?.toFixed(2) ?? 'n/a'}`,
        snippet: src.preview
      }));

      const modelMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'model',
        content: cleanContent,
        citations,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, modelMessage]);
      loadSessions();
    } catch (err: any) {
      console.error(err);
      const errorMessage: Message = {
        id: `msg-${Date.now() + 2}`,
        role: 'model',
        content: `⚠️ **Error generating response:** ${err.message}\n\nMake sure your FastAPI backend is running on port 8000.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGeneratingChat(false);
    }
  };

  const handleCitationClick = (citationNum: number, citations: Citation[]) => {
    const citation = citations.find(c => c.citationNumber === citationNum);
    if (!citation) return;

    setSelectedSourceForView({
      id: `citation-${citation.citationNumber}-${Date.now()}`,
      title: `${citation.sourceTitle} — ${citation.location}`,
      type: 'file',
      fileType: (citation.sourceType as 'pdf' | 'txt' | 'docx') || 'pdf',
      status: 'ready',
      content: formatExtractedText(citation.snippet),
      selected: true
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Message copied to clipboard!");
  };

  const handleFeedback = (msgId: string, status: 'like' | 'dislike') => {
    setFeedbackStatus(prev => ({
      ...prev,
      [msgId]: prev[msgId] === status ? null : status
    }));
  };

  const renderFormattedMessage = (text: string, citationsList?: Citation[]) => {
    const paragraphs = text.split('\n\n');
    return paragraphs.map((paragraph, pIdx) => {
      const parts = paragraph.split(/(\[\d+\])/g);
      return (
        <p key={pIdx} className="mb-4 last:mb-0 leading-relaxed font-sans text-neutral-900 dark:text-neutral-100">
          {parts.map((part, index) => {
            const citationMatch = part.match(/^\[(\d+)\]$/);
            if (citationMatch && citationsList) {
              const num = parseInt(citationMatch[1], 10);
              return (
                <button
                  key={index}
                  onClick={() => handleCitationClick(num, citationsList)}
                  className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded cursor-pointer hover:scale-110 transition-transform mx-1 align-middle bg-neutral-200 hover:bg-neutral-300 text-neutral-800 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-neutral-100"
                  title={`View citation [${num}]`}
                >
                  {num}
                </button>
              );
            }

            const boldParts = part.split(/(\*\*.*?\*\*)/g);
            return (
              <span key={index}>
                {boldParts.map((bPart, bIndex) => {
                  if (bPart.startsWith('**') && bPart.endsWith('**')) {
                    return (
                      <strong key={bIndex} className="font-semibold text-black dark:text-white">
                        {bPart.slice(2, -2)}
                      </strong>
                    );
                  }
                  return bPart;
                })}
              </span>
            );
          })}
        </p>
      );
    });
  };

  const filteredSources = sources;

  const formatSessionDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-screen w-full flex flex-col font-sans overflow-hidden transition-colors duration-300 bg-[#fafafa] text-[#18181b] dark:bg-neutral-950 dark:text-neutral-100">

      {/* Top Header */}
      <header className="border-b flex justify-between items-center w-full px-6 h-16 shrink-0 z-10 shadow-xs transition-colors duration-300 bg-white border-[#e4e4e7] dark:bg-neutral-900 dark:border-neutral-800">
        <div className="flex items-center gap-2.5 select-none">
          <NotebookPen className="w-6 h-6 text-[#18181b] dark:text-white shrink-0" strokeWidth={2} />
          <span className="text-[19px] font-bold tracking-tight text-[#18181b] dark:text-white">
            Notebook<span className="font-black">LLM</span>
          </span>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-3">

          {/* New Chat */}
          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-[#f4f4f5] text-[#71717a] dark:hover:bg-neutral-800 dark:text-neutral-400 text-xs font-semibold"
            title="Start a new chat"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span className="hidden sm:inline">New chat</span>
          </button>

          {/* History dropdown toggle */}
          <div className="relative">
            <button
              onClick={() => setShowHistoryPanel(prev => !prev)}
              className={`p-2 rounded-full cursor-pointer transition-colors hover:bg-[#f4f4f5] dark:hover:bg-neutral-800 ${
                showHistoryPanel ? 'bg-[#f4f4f5] text-[#18181b] dark:bg-neutral-800 dark:text-white' : 'text-[#71717a] dark:text-neutral-400'
              }`}
              title="Chat history"
            >
              <History className="w-5 h-5" />
            </button>

            {showHistoryPanel && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowHistoryPanel(false)} />
                <div className="absolute right-0 top-11 w-80 max-h-[420px] overflow-y-auto rounded-xl border shadow-lg z-40 bg-white border-[#e4e4e7] dark:bg-neutral-900 dark:border-neutral-800">
                  <div className="p-3 border-b border-[#e4e4e7] dark:border-neutral-800 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Past conversations
                    </span>
                    <button
                      onClick={startNewChat}
                      className="text-[10px] font-semibold px-2 py-1 rounded-md hover:bg-[#f4f4f5] dark:hover:bg-neutral-800 text-[#18181b] dark:text-neutral-100"
                    >
                      + New
                    </button>
                  </div>

                  {sessions.length === 0 ? (
                    <div className="p-6 text-center">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">No past conversations yet.</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {sessions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => resumeSession(s.id)}
                          className={`w-full text-left p-2.5 rounded-lg transition-colors cursor-pointer ${
                            s.id === sessionId
                              ? 'bg-[#f4f4f5] dark:bg-neutral-800'
                              : 'hover:bg-[#f4f4f5] dark:hover:bg-neutral-800'
                          }`}
                        >
                          <p className="text-xs font-semibold truncate text-[#18181b] dark:text-neutral-100">
                            {s.title || 'New conversation'}
                          </p>
                          <p className="text-[10px] mt-0.5 text-neutral-500 dark:text-neutral-500">
                            {formatSessionDate(s.created_at)} · {s.message_count} messages
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Real light/dark toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full cursor-pointer transition-colors duration-200 active:scale-95 flex items-center justify-center hover:bg-[#f4f4f5] text-[#71717a] dark:hover:bg-neutral-800 dark:text-neutral-400"
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-neutral-700" />
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex overflow-hidden w-full relative">

        {/* Left Sidebar: Sources Panel */}
        <aside className="w-full md:w-[380px] shrink-0 border-r h-full flex flex-col overflow-hidden transition-colors duration-300 border-[#e4e4e7] bg-[#f4f4f5] dark:border-neutral-800 dark:bg-neutral-900">

          <div className="p-5 pb-3 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold tracking-tight text-[#18181b] dark:text-neutral-100">Sources</h2>

              <button
                onClick={() => {
                  if (activeTab === 'upload') fileInputRef.current?.click();
                  else if (activeTab === 'url') handleAddUrl();
                  else if (activeTab === 'topic') handleAddTopic();
                }}
                disabled={isProcessing}
                className="flex items-center gap-1.5 disabled:bg-gray-400 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer active:scale-95 transition-all shadow-sm bg-[#18181b] hover:bg-[#27272a] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </div>

            {/* Segmented Tab Control */}
            <div className="relative flex border-b text-xs font-semibold mb-4 border-[#e4e4e7] dark:border-neutral-800">
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex-1 py-2 text-center border-b-2 transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'border-[#18181b] text-[#18181b] dark:border-white dark:text-white'
                    : 'border-transparent text-[#71717a] hover:text-[#18181b] dark:text-neutral-500 dark:hover:text-neutral-200'
                }`}
              >
                Upload File
              </button>
              <button
                onClick={() => setActiveTab('url')}
                className={`flex-1 py-2 text-center border-b-2 transition-all cursor-pointer ${
                  activeTab === 'url'
                    ? 'border-[#18181b] text-[#18181b] dark:border-white dark:text-white'
                    : 'border-transparent text-[#71717a] hover:text-[#18181b] dark:text-neutral-500 dark:hover:text-neutral-200'
                }`}
              >
                Add URL
              </button>
              <button
                onClick={() => setActiveTab('topic')}
                className={`flex-1 py-2 text-center border-b-2 transition-all cursor-pointer ${
                  activeTab === 'topic'
                    ? 'border-[#18181b] text-[#18181b] dark:border-white dark:text-white'
                    : 'border-transparent text-[#71717a] hover:text-[#18181b] dark:text-neutral-500 dark:hover:text-neutral-200'
                }`}
              >
                Topic
              </button>
            </div>

            {/* Tab Panels */}
            <div className="mb-2">
              {activeTab === 'upload' && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-white dark:bg-neutral-800 group ${
                    isDragging
                      ? 'border-[#18181b] bg-[#f4f4f5] dark:border-white dark:bg-neutral-700'
                      : 'border-[#e4e4e7] hover:bg-[#fafafa] dark:border-neutral-700 dark:hover:bg-neutral-750'
                  }`}
                >
                  <UploadCloud
                    className={`w-8 h-8 transition-colors ${
                      isDragging
                        ? 'text-[#18181b] dark:text-white'
                        : 'text-[#71717a] group-hover:text-[#18181b] dark:text-neutral-500 dark:group-hover:text-neutral-200'
                    }`}
                  />
                  <p className="text-xs font-medium text-center text-[#71717a] dark:text-neutral-400">
                    Drag files here or <span className="underline text-[#18181b] dark:text-white">browse</span>
                  </p>
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-[#71717a] dark:text-neutral-500">
                    PDF, TXT UP TO 50MB
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".txt,.pdf"
                  />
                </div>
              )}

              {activeTab === 'url' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste web article link..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                    className="flex-1 bg-white dark:bg-neutral-800 border rounded-lg py-2 px-3 text-xs focus:ring-1 focus:outline-none border-[#e4e4e7] focus:ring-[#18181b] dark:border-neutral-700 dark:focus:ring-white dark:text-neutral-100"
                  />
                  <button
                    onClick={handleAddUrl}
                    className="text-white p-2.5 rounded-lg cursor-pointer transition-colors flex items-center justify-center bg-[#18181b] hover:bg-[#27272a] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    title="Add URL source"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}

              {activeTab === 'topic' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter research topic..."
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                    className="flex-1 bg-white dark:bg-neutral-800 border rounded-lg py-2 px-3 text-xs focus:ring-1 focus:outline-none border-[#e4e4e7] focus:ring-[#18181b] dark:border-neutral-700 dark:focus:ring-white dark:text-neutral-100"
                  />
                  <button
                    onClick={handleAddTopic}
                    className="text-white p-2.5 rounded-lg cursor-pointer transition-colors flex items-center justify-center bg-[#18181b] hover:bg-[#27272a] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    title="Add Topic source"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sources List */}
          <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
            {isProcessing && (
              <div className="bg-white dark:bg-neutral-800 border rounded-xl p-4 flex items-center gap-3 shadow-xs border-neutral-200 dark:border-neutral-700">
                <div className="relative flex items-center justify-center shrink-0">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent border-[#18181b] dark:border-white"></div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate text-[#18181b] dark:text-neutral-100">Analyzing Source</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 dark:bg-neutral-400 animate-pulse"></span>
                    {processingMsg || 'Processing...'}
                  </p>
                </div>
              </div>
            )}

            {filteredSources.map((source) => {
              const isPdf = source.fileType === 'pdf';
              const isUrl = source.type === 'url';

              return (
                <div
                  key={source.id}
                  onClick={() => setSelectedSourceForView(source)}
                  className={`group flex items-center gap-3 p-3.5 bg-white dark:bg-neutral-800 border rounded-xl transition-all cursor-pointer relative shadow-xs ${
                    source.selected
                      ? 'border-[#18181b]/50 bg-neutral-50 dark:border-white/40 dark:bg-neutral-800 hover:border-[#18181b] dark:hover:border-white'
                      : 'border-[#e4e4e7] dark:border-neutral-700 hover:border-[#18181b] dark:hover:border-white'
                  }`}
                >
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSourceSelection(source.id);
                    }}
                    className="flex items-center justify-center shrink-0"
                  >
                    {source.selected ? (
                      <div className="w-5 h-5 rounded-md text-white flex items-center justify-center transition-colors border bg-[#18181b] border-[#18181b] hover:bg-[#27272a] dark:bg-white dark:text-neutral-900 dark:border-white dark:hover:bg-neutral-200">
                        <Check className="w-3.5 h-3.5 stroke-3" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-md border-2 bg-transparent transition-colors border-[#d4d4d8] hover:border-[#18181b] dark:border-neutral-600 dark:hover:border-white" />
                    )}
                  </div>

                  <div className="shrink-0 p-1.5 rounded-lg bg-neutral-100 text-[#18181b] dark:bg-neutral-700 dark:text-neutral-100">
                    {isPdf ? (
                      <FileText className="w-4 h-4" />
                    ) : isUrl ? (
                      <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-xs font-semibold truncate transition-colors text-[#18181b] dark:text-neutral-100">
                      {source.title}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {source.status === 'ready' ? (
                        <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">Ready</p>
                      ) : source.status === 'processing' ? (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#18181b] dark:bg-white animate-pulse"></span>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[#18181b] dark:text-neutral-100">Processing</p>
                        </span>
                      ) : (
                        <p className="text-[9px] text-red-600 dark:text-red-400 font-bold uppercase tracking-wider">Error</p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteSource(source.id, e)}
                    className="absolute right-3 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Remove source"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {filteredSources.length === 0 && !isProcessing && (
              <div className="text-center py-10 px-4">
                <Info className="w-8 h-8 text-neutral-400 dark:text-neutral-600 mx-auto mb-2" />
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">No sources match your criteria</p>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-600 mt-1">Upload files, URL, or topic queries to populate your workspace.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Right Chat Panel */}
        <section className="flex-1 h-full flex flex-col overflow-hidden transition-colors duration-300 bg-white dark:bg-neutral-950">

          <div className="flex-1 overflow-y-auto px-6 py-6" id="chat-scroller">

            {isHydrating ? (
              <div className="h-full flex flex-col items-center justify-center text-center select-none py-16">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent border-[#18181b] dark:border-white mb-3"></div>
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Loading conversation...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center select-none py-16">
                <div className="w-24 h-24 mb-6 relative flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full animate-pulse bg-neutral-200/50 dark:bg-neutral-800/50"></div>
                  <Sparkles className="w-10 h-10 z-10 text-neutral-800 dark:text-neutral-200" />
                </div>
                <h3 className="text-lg font-bold mb-1 text-[#18181b] dark:text-neutral-100">Add a source to get started</h3>
                <p className="text-xs max-w-sm text-[#71717a] dark:text-neutral-400">
                  Connect papers, articles, or research topic prompts to unlock your highly focused AI academic companion.
                </p>
              </div>
            ) : (
              <div className="max-w-[800px] mx-auto space-y-8 pb-4">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';

                  return (
                    <div key={msg.id} className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>

                      {!isUser && (
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm bg-[#18181b] dark:bg-white dark:text-neutral-900">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}

                      <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`p-4 rounded-2xl text-[14px] leading-relaxed ${
                            isUser
                              ? 'bg-[#e4e4e7] text-[#18181b] rounded-br-none dark:bg-neutral-800 dark:text-neutral-100'
                              : 'bg-transparent'
                          }`}
                        >
                          {isUser ? (
                            <p className="font-sans font-medium">{msg.content}</p>
                          ) : (
                            <div className="prose prose-sm max-w-none text-[#18181b] dark:text-neutral-100">
                              {renderFormattedMessage(msg.content, msg.citations)}
                            </div>
                          )}
                        </div>

                        {!isUser && msg.citations && msg.citations.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-4 w-full">
                            {msg.citations.map((cit) => (
                              <div
                                key={cit.citationNumber}
                                onClick={() => handleCitationClick(cit.citationNumber, msg.citations || [])}
                                className="p-3.5 rounded-xl border transition-all cursor-pointer group shadow-2xs border-[#e4e4e7] bg-white hover:bg-[#f4f4f5] hover:border-[#18181b]/40 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:hover:border-white/40"
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100">
                                    {cit.citationNumber}
                                  </span>
                                  <span className="text-[9px] font-bold uppercase tracking-wider truncate text-[#71717a] dark:text-neutral-500">
                                    {cit.location}
                                  </span>
                                </div>
                                <p className="text-xs line-clamp-2 leading-relaxed italic transition-colors text-[#71717a] group-hover:text-[#18181b] dark:text-neutral-400 dark:group-hover:text-neutral-100">
                                  {cit.snippet}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {!isUser && (
                          <div className="flex items-center gap-3 mt-3 pt-2 pl-1 text-[#71717a] dark:text-neutral-500">
                            <button
                              onClick={() => handleFeedback(msg.id, 'like')}
                              className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-[#18181b] dark:hover:text-white cursor-pointer transition-colors ${
                                feedbackStatus[msg.id] === 'like' ? 'text-[#18181b] bg-neutral-200 dark:text-white dark:bg-neutral-800' : ''
                              }`}
                              title="Helpful response"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleFeedback(msg.id, 'dislike')}
                              className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-[#18181b] dark:hover:text-white cursor-pointer transition-colors ${
                                feedbackStatus[msg.id] === 'dislike' ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950' : ''
                              }`}
                              title="Unhelpful response"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => copyToClipboard(msg.content)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-[#18181b] dark:hover:text-white cursor-pointer transition-colors"
                              title="Copy response"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setChatInput(messages[messages.length - 2]?.content || '');
                                handleSendMessage();
                              }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-[#18181b] dark:hover:text-white cursor-pointer transition-colors"
                              title="Regenerate"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                      </div>
                    </div>
                  );
                })}

                {isGeneratingChat && (
                  <div className="flex gap-4 justify-start animate-pulse">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 bg-[#18181b] dark:bg-white dark:text-neutral-900">
                      <Sparkles className="w-4 h-4 animate-spin-slow" />
                    </div>
                    <div className="flex flex-col max-w-[85%] items-start">
                      <div className="p-4 rounded-2xl text-[14px] bg-[#f4f4f5] text-[#18181b] dark:bg-neutral-800 dark:text-neutral-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full animate-bounce bg-[#18181b] dark:bg-white" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 rounded-full animate-bounce bg-[#18181b] dark:bg-white" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 rounded-full animate-bounce bg-[#18181b] dark:bg-white" style={{ animationDelay: '300ms' }} />
                          <span className="text-xs font-semibold uppercase tracking-wider ml-1 text-[#71717a] dark:text-neutral-400">Analyzing sources and formulating response...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Bottom Chat Input Form */}
          <div className="p-5 border-t sticky bottom-0 transition-colors duration-300 border-[#e4e4e7] bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <div className="max-w-[800px] mx-auto flex flex-col gap-2">

              <div className="flex items-center gap-1.5 px-1.5 select-none">
                <span className={`w-2 h-2 rounded-full ${selectedSourcesCount > 0 ? 'bg-emerald-500' : 'bg-[#ba1a1a]'}`} />
                <span className="text-xs font-semibold text-[#71717a] dark:text-neutral-400">
                  {selectedSourcesCount === 0
                    ? 'No sources selected (GenAI general reasoning)'
                    : `${selectedSourcesCount} ${selectedSourcesCount === 1 ? 'source' : 'sources'} selected`}
                </span>
              </div>

              <form onSubmit={handleSendMessage} className="relative flex items-center w-full">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={chatInput}
                  onChange={handleTextareaInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask about your sources..."
                  className="w-full border-none focus:outline-none focus:ring-2 rounded-xl py-3.5 pl-5 pr-14 text-sm resize-none shadow-sm overflow-hidden min-h-[48px] max-h-[160px] bg-[#f4f4f5] text-[#18181b] placeholder-[#71717a] focus:ring-[#18181b] dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:ring-white"
                />

                <button
                  type="submit"
                  disabled={!chatInput.trim() || isGeneratingChat}
                  className="absolute right-3.5 w-9 h-9 text-white rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-md disabled:bg-gray-300 dark:disabled:bg-neutral-700 disabled:shadow-none active:scale-95 bg-[#18181b] hover:bg-[#27272a] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              <p className="text-[10px] text-center font-medium tracking-wide text-[#71717a] dark:text-neutral-500">
                NotebookLLM may display inaccurate info, so double-check its responses.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Slide-over document viewer/editor modal */}
      {selectedSourceForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in">
          <div className="w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden animate-slide-left border-l transition-colors duration-300 bg-[#fafafa] border-[#e4e4e7] dark:bg-neutral-950 dark:border-neutral-800">

            <div className="bg-white dark:bg-neutral-900 px-6 h-16 border-b flex justify-between items-center shrink-0 border-[#e4e4e7] dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
                  {selectedSourceForView.fileType === 'pdf' ? (
                    <FileText className="w-4 h-4" />
                  ) : selectedSourceForView.type === 'url' ? (
                    <Link2 className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm truncate max-w-md text-[#18181b] dark:text-neutral-100">
                    {selectedSourceForView.title}
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                    Source Document {selectedSourceForView.fileType ? `(${selectedSourceForView.fileType})` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSourceForView(null)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full text-gray-500 dark:text-neutral-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto space-y-6">
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border p-6 shadow-sm min-h-[400px] flex flex-col border-[#e4e4e7] dark:border-neutral-800">
                <div className="pb-3 border-b mb-4 flex justify-between items-center border-[#e4e4e7] dark:border-neutral-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 bg-neutral-100 text-[#18181b] dark:bg-neutral-800 dark:text-neutral-100">
                    <Info className="w-3 h-3" />
                    Interactive Notebook Page
                  </span>
                  <span className="text-xs font-medium font-mono text-[#71717a] dark:text-neutral-500">
                    {selectedSourceForView.content.split(/\s+/).length} words
                  </span>
                </div>

                <textarea
                  value={selectedSourceForView.content}
                  onChange={(e) => handleUpdateSourceContent(selectedSourceForView.id, e.target.value)}
                  className="flex-1 text-sm leading-relaxed font-sans placeholder-gray-400 focus:outline-none resize-none border-none focus:ring-0 w-full text-[#18181b] dark:text-neutral-100 bg-transparent"
                  placeholder="Paste or write your raw content here..."
                />
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-4 border border-amber-200/50 dark:border-amber-900/50 flex gap-3 text-amber-900 dark:text-amber-200">
                <Info className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs font-medium leading-relaxed">
                  <p className="font-bold">Pro-Tip: Live Document Editing</p>
                  <p className="mt-0.5">You can edit the content of this document directly above! The AI uses your modified content immediately when answering subsequent questions.</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border-t p-4 shrink-0 flex justify-end gap-3 border-[#e4e4e7] dark:border-neutral-800">
              <button
                onClick={() => setSelectedSourceForView(null)}
                className="px-4 py-2 rounded-lg font-semibold text-xs cursor-pointer active:scale-95 transition-all bg-[#e4e4e7] hover:bg-neutral-200 text-[#18181b] dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-100"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}