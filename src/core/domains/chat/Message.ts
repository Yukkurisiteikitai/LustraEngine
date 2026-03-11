export interface MessageData {
  id: string;
  pairNodeId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  tokenCount?: number;
  modelId?: string;
  unitPrice?: number;
}
