import { TRAIT_SYSTEM_PROMPT } from '@/application/llm/traitInferencePrompt';

describe('trait inference prompt wording', () => {
  it('describes hypothesis generation and avoids personality-diagnosis framing', () => {
    expect(TRAIT_SYSTEM_PROMPT).toContain('UserModelSnapshot');
    expect(TRAIT_SYSTEM_PROMPT).toContain('TraitHypothesis');
    expect(TRAIT_SYSTEM_PROMPT).toContain('仮説要約');
    expect(TRAIT_SYSTEM_PROMPT).not.toContain('Big Five性格特性を推定する専門家');
    expect(TRAIT_SYSTEM_PROMPT).not.toContain('性格診断');
    expect(TRAIT_SYSTEM_PROMPT).not.toContain('人格');
    expect(TRAIT_SYSTEM_PROMPT).not.toContain('ペルソナ');
  });
});
