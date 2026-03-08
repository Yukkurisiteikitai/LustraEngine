import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IPersonaRepository } from '@/core/domains/persona/IPersonaRepository';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import { buildChatSystemPrompt } from '@/application/llm/chatSystemPrompt';
import type { ChatMessage } from '@/types';

export class ChatUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly personaRepo: IPersonaRepository,
    private readonly llm: ILLMPort,
  ) {}

  async execute(
    userId: string,
    message: string,
    history: ChatMessage[],
  ): Promise<{ response: string; personaMissing?: boolean }> {
    const persona = await this.personaRepo.getLatest(userId);

    if (!persona) {
      return {
        response: '',
        personaMissing: true,
      };
    }

    const experiences = await this.expRepo.findRecent(userId, 5);
    const systemPrompt = buildChatSystemPrompt(persona.personaJson, experiences);

    // Build message history with user message appended
    const messages = [...history, { role: 'user' as const, content: message }];
    const historyText = messages
      .slice(0, -1)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    const fullUserMessage = historyText ? `${historyText}\nuser: ${message}` : message;

    const response = await this.llm.generate(systemPrompt, fullUserMessage, 1024);
    return { response };
  }
}
