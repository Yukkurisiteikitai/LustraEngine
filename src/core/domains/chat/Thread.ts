export interface ThreadData {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
}

export class Thread {
  constructor(private data: ThreadData) {}

  toData(): ThreadData {
    return { ...this.data };
  }
}
