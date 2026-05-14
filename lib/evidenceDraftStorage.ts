export interface EvidenceLoggingDraft {
  template: string;
  questions: string[];
  source: 'chat_fallback' | 'manual';
}

const DRAFT_STORAGE_KEY = 'ylm:evidence_logging_draft';

export function saveEvidenceLoggingDraft(draft: EvidenceLoggingDraft): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function consumeEvidenceLoggingDraft(): EvidenceLoggingDraft | null {
  if (typeof window === 'undefined') return null;

  const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<EvidenceLoggingDraft>;
    if (
      typeof parsed.template === 'string' &&
      Array.isArray(parsed.questions) &&
      parsed.questions.every((question) => typeof question === 'string') &&
      (parsed.source === 'chat_fallback' || parsed.source === 'manual')
    ) {
      return {
        template: parsed.template,
        questions: parsed.questions,
        source: parsed.source,
      };
    }
  } catch {
    // ignore malformed drafts
  } finally {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  }

  return null;
}
