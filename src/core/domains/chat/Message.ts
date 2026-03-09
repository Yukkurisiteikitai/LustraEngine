export interface MessageData {
  id: string;
  threadId: string;
  userId: string;
  role: 'user' | 'assistant';
  contexts: string[];
  contextIdSet: number;
  createdAt: string;
}

export class Message {
  constructor(private data: MessageData) {}

  activeContext(): string {
    return this.data.contexts[this.data.contextIdSet] ?? '';
  }

  toData(): MessageData {
    return { ...this.data };
  }
}
