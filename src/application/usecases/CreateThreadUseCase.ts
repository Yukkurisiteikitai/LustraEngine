import type { IThreadRepository } from '@/core/domains/chat/IThreadRepository';
import type { ThreadData } from '@/core/domains/chat/Thread';

export class CreateThreadUseCase {
  constructor(private threadRepo: IThreadRepository) {}

  async execute(userId: string, title = '新しいチャット'): Promise<ThreadData> {
    return this.threadRepo.save(userId, title);
  }
}
