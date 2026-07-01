export interface Citation {
  citationNumber: number;
  sourceTitle: string;
  sourceType: string;
  location: string;
  snippet: string;
}

export interface Source {
  id: string;
  title: string;
  type: 'file' | 'url' | 'topic';
  fileType?: 'pdf' | 'txt' | 'docx';
  status: 'ready' | 'processing' | 'error';
  content: string;
  selected: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  citations?: Citation[];
  timestamp?: string;
}
