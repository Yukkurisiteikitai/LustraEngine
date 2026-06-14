import { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';

const validator = new LLMResponseValidator();

const VALID = {
  description: 'スタバでレポートを完了',
  context: 'スタバ',
  time_of_day: 'afternoon',
  duration_minutes: 120,
  emotions: [
    { label: '爽快', intensity: 4 },
    { label: '達成感', intensity: 3 },
  ],
  action_result: 'CONFRONTED_SUCCESS',
  trigger: '締切',
  needs_trigger_question: false,
  trigger_question: null,
};

describe('LLMResponseValidator.validateStructuredDiaryResponse', () => {
  it('accepts a clean response', () => {
    const res = validator.validateStructuredDiaryResponse(JSON.stringify(VALID));
    expect(res).not.toBeNull();
    expect(res?.actionResult).toBe('CONFRONTED_SUCCESS');
    expect(res?.timeOfDay).toBe('afternoon');
    expect(res?.emotions).toHaveLength(2);
    expect(res?.needsTriggerQuestion).toBe(false);
  });

  it('accepts a fenced response', () => {
    const raw = '```json\n' + JSON.stringify(VALID) + '\n```';
    expect(validator.validateStructuredDiaryResponse(raw)).not.toBeNull();
  });

  it('rejects an invalid action_result enum', () => {
    const bad = { ...VALID, action_result: 'CONFRONTED' };
    expect(validator.validateStructuredDiaryResponse(JSON.stringify(bad))).toBeNull();
  });

  it('rejects an invalid time_of_day enum', () => {
    const bad = { ...VALID, time_of_day: 'midnight' };
    expect(validator.validateStructuredDiaryResponse(JSON.stringify(bad))).toBeNull();
  });

  it('accepts null duration_minutes but rejects negative numbers', () => {
    const okNull = { ...VALID, duration_minutes: null };
    expect(validator.validateStructuredDiaryResponse(JSON.stringify(okNull))?.durationMinutes).toBeNull();

    const bad = { ...VALID, duration_minutes: -5 };
    expect(validator.validateStructuredDiaryResponse(JSON.stringify(bad))).toBeNull();
  });

  it('drops emotions with out-of-range intensity but keeps the rest', () => {
    const mixed = {
      ...VALID,
      emotions: [
        { label: 'ok', intensity: 3 },
        { label: 'too_high', intensity: 9 },
        { label: 'too_low', intensity: 0 },
      ],
    };
    const res = validator.validateStructuredDiaryResponse(JSON.stringify(mixed));
    expect(res?.emotions).toEqual([{ label: 'ok', intensity: 3 }]);
  });

  it('caps emotions at 5 items', () => {
    const many = {
      ...VALID,
      emotions: Array.from({ length: 10 }, (_, i) => ({ label: `e${i}`, intensity: 3 as const })),
    };
    const res = validator.validateStructuredDiaryResponse(JSON.stringify(many));
    expect(res?.emotions).toHaveLength(5);
  });

  it('returns null when description is missing or empty', () => {
    const empty = { ...VALID, description: '' };
    expect(validator.validateStructuredDiaryResponse(JSON.stringify(empty))).toBeNull();
  });

  it('returns null when the LLM emits non-JSON', () => {
    expect(validator.validateStructuredDiaryResponse('LLMがフォールバックを返しました')).toBeNull();
  });

  it('infers needsTriggerQuestion from trigger when the flag is missing', () => {
    const { needs_trigger_question: _omit, ...rest } = VALID;
    void _omit;
    const raw = JSON.stringify({ ...rest, trigger: null });
    const res = validator.validateStructuredDiaryResponse(raw);
    expect(res?.needsTriggerQuestion).toBe(true);
    expect(res?.trigger).toBeNull();
  });
});
