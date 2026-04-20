import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IPersonaRepository } from '@/core/domains/persona/IPersonaRepository';
import type { IPsychologyRepository } from '@/core/ports/IPsychologyRepository';
import type { ILLMPort, TokenUsage } from '@/application/ports/ILLMPort';
import { buildChatSystemPrompt } from '@/application/llm/chatSystemPrompt';
import type { ChatMessage } from '@/types';

export class ChatUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly personaRepo: IPersonaRepository,
    private readonly llm: ILLMPort,
    private readonly psychologyRepo: IPsychologyRepository | null = null,
  ) {}

  async execute(
    userId: string,
    message: string,
    history: ChatMessage[],
  ): Promise<{ response: string; tokenUsage?: TokenUsage; modelName?: string; personaMissing?: boolean }> {
    const persona = await this.personaRepo.getLatest(userId);

    if (!persona) {
      return {
        response: '',
        personaMissing: true,
      };
    }

    const [experiences, bigFive, attachment, identityStatus] = await Promise.all([
      this.expRepo.findRecent(userId, 5),
      this.psychologyRepo?.getBigFiveScore(userId) ?? Promise.resolve(null),
      this.psychologyRepo?.getAttachmentProfile(userId) ?? Promise.resolve(null),
      this.psychologyRepo?.getIdentityStatus(userId) ?? Promise.resolve([]),
    ]);

    const systemPrompt = buildChatSystemPrompt(
      persona.personaJson,
      experiences,
      bigFive,
      attachment,
      identityStatus,
    );

    // Build message history with user message appended
    const messages = [...history, { role: 'user' as const, content: message }];
    const historyText = messages
      .slice(0, -1)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    const fullUserMessage = historyText ? `${historyText}\nuser: ${message}` : message;

    const { text, tokenUsage, modelName } = await this.llm.generate(systemPrompt, fullUserMessage, 1024);
    return { response: text, tokenUsage, modelName };
  }
}
