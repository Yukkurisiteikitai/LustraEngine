import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IPsychologyRepository } from '@/core/ports/IPsychologyRepository';
import type { ILLMPort, TokenUsage } from '@/application/ports/ILLMPort';
import { buildChatSystemPrompt } from '@/application/llm/chatSystemPrompt';
import type { ChatMessage } from '@/types';
import type { ITraitHypothesisRepository } from '@/core/domains/trait/ITraitHypothesisRepository';
import {
  buildEvidenceLoggingFallback,
  type EvidenceLoggingFallback,
} from '@/application/llm/evidenceLoggingFallback';
import type { IUserSettingsRepository } from '@/core/domains/user-settings/IUserSettingsRepository';

export class ChatUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly traitHypothesisRepo: ITraitHypothesisRepository,
    private readonly llm: ILLMPort,
    private readonly psychologyRepo: IPsychologyRepository | null = null,
    private readonly userSettingsRepo: IUserSettingsRepository | null = null,
  ) {}

  async execute(
    userId: string,
    message: string,
    history: ChatMessage[],
  ): Promise<{ response: string; tokenUsage?: TokenUsage; modelName?: string; fallback?: EvidenceLoggingFallback }> {
    const activeHypotheses = await this.traitHypothesisRepo.findActiveByUser(userId);
    if (activeHypotheses.length === 0) {
      const userSettings = this.userSettingsRepo
        ? await this.userSettingsRepo.ensureDefaultByUser(userId)
        : null;
      return {
        response: '',
        fallback: buildEvidenceLoggingFallback({
          allowChatFallbackDraft: userSettings?.allowChatFallbackDraft ?? true,
        }),
      };
    }

    const [experiences, bigFive, attachment, identityStatus] = await Promise.all([
      this.expRepo.findRecent(userId, 5, { visibility: 'analysis_allowed' }),
      this.psychologyRepo?.getBigFiveScore(userId) ?? Promise.resolve(null),
      this.psychologyRepo?.getAttachmentProfile(userId) ?? Promise.resolve(null),
      this.psychologyRepo?.getIdentityStatus(userId) ?? Promise.resolve([]),
    ]);

    const systemPrompt = buildChatSystemPrompt(
      experiences,
      activeHypotheses,
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
