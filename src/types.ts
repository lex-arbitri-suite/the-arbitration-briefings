export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  timestamp?: number;
}

export interface RelatedDevelopment {
  title: string;
  query: string;
  summary: string;
  sourceUrl?: string;
  date: string;
  category: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  isArchived: boolean;
  isShowcase?: boolean;
  status: 'ephemeral' | 'approved' | 'authorised';
  category?: string;
  ownerUid?: string;
  commentary?: string;
  internalRef?: string;
  visibility?: 'public' | 'private';
  authorisedAt?: number;
  previewText?: string;
  parentChatIds?: string[];
  generatedBriefingIds?: string[];
  sourceDevelopmentId?: string;
  sourceDevelopmentTitle?: string;
  sourceDevelopmentCategory?: string;
  relatedDevelopments?: RelatedDevelopment[];
  relatedDevelopmentsLoaded?: boolean;
}

export interface TailoredItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  query: string;
  date: string;
  isChatDerived: true;
}

export interface DeletedChatSession extends ChatSession {
  deletedAt: number;
}

export interface Development {
  id: string;
  category: string;
  title: string;
  date: string;
  summary: string;
  query: string;
  sourceUrl: string;
  urlVerified?: boolean;
  hash?: string;
  createdAt?: any;
  lastRefreshedAt?: any;
  updates?: string[];
  isPlaceholder?: boolean;
}
