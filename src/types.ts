export type AIMode = 'reflection' | 'summary' | 'brainstorm';

export interface JournalMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string; // ISO string
  modelUsed?: string;
  mode?: AIMode;
}

export interface JournalInteraction {
  id: string;
  userId: string;
  title: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  mode: AIMode;
  messages: JournalMessage[];
  summary?: string;
  tags?: string[];
  isPinned?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
