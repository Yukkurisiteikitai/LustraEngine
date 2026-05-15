import evalCases from '@/docs/eval/ylm-046-cases.json';
import fs from 'fs';
import path from 'path';

type EvalCase = {
  id: string;
  category: string;
  source: 'manual' | 'chat_fallback';
  evidenceIds: string[];
  evidenceText: string;
  expectedHypothesisSummary: string;
  expectedNextAction: string;
  dangerousOutputs: string[];
  evaluationCriteria: string[];
  expectsActiveHypothesesEmpty: boolean;
};

describe('YLM-046 evaluation set', () => {
  it('contains a minimal but diverse set of 5 to 10 cases', () => {
    expect(evalCases).toHaveLength(6);
  });

  it('covers the required evidence patterns and fallback case', () => {
    const cases = evalCases as EvalCase[];
    const ids = cases.map((c) => c.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'manual-001-awkward-raise-hand',
        'manual-002-deadline-slip',
        'manual-003-decision-memo',
        'manual-004-routine-success',
        'manual-005-conflict-repair',
        'chat-fallback-001',
      ]),
    );

    expect(cases.some((c) => c.category.includes('違和感'))).toBe(true);
    expect(cases.some((c) => c.category.includes('失敗'))).toBe(true);
    expect(cases.some((c) => c.category.includes('判断'))).toBe(true);
    expect(cases.some((c) => c.category.includes('成功'))).toBe(true);
    expect(cases.some((c) => c.source === 'chat_fallback')).toBe(true);
    expect(cases.some((c) => c.expectsActiveHypothesesEmpty)).toBe(true);
  });

  it('describes evidence-rooted hypotheses and dangerous persona-like outputs', () => {
    const cases = evalCases as EvalCase[];

    for (const evalCase of cases) {
      expect(evalCase.evidenceIds.length).toBeGreaterThan(0);
      expect(evalCase.evidenceText.length).toBeGreaterThan(0);
      expect(evalCase.expectedHypothesisSummary.length).toBeGreaterThan(0);
      expect(evalCase.expectedNextAction.length).toBeGreaterThan(0);
      expect(evalCase.evaluationCriteria).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Evidence'),
          expect.stringContaining('仮説'),
        ]),
      );
      expect(evalCase.dangerousOutputs.length).toBeGreaterThan(0);
    }

    const dangerousText = cases.flatMap((c) => c.dangerousOutputs).join(' ');
    expect(dangerousText).toMatch(/あなたは|診断|人格|ペルソナ|性格|確定/);
  });

  it('keeps the markdown report in sync with the JSON cases', () => {
    const reportPath = path.join(process.cwd(), 'docs/eval/YLM-046.md');
    const report = fs.readFileSync(reportPath, 'utf8');

    for (const evalCase of evalCases as EvalCase[]) {
      expect(report).toContain(evalCase.id);
    }

    expect(report).toContain('Evidence -> TraitHypothesisHistory');
    expect(report).toContain('UserModelSnapshot');
    expect(report).toContain('あなたはX');
    expect(report).toContain('Pending');
  });
});
