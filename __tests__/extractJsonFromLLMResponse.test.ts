import { extractJsonFromLLMResponse } from '@/application/llm/policies/extractJsonFromLLMResponse';

describe('extractJsonFromLLMResponse', () => {
  it('parses plain JSON', () => {
    expect(extractJsonFromLLMResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in ```json fence', () => {
    expect(extractJsonFromLLMResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in bare ``` fence', () => {
    expect(extractJsonFromLLMResponse('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extracts JSON after a Japanese preamble', () => {
    const raw = 'はい、以下が結果です:\n{"a":1, "b":"x"}';
    expect(extractJsonFromLLMResponse(raw)).toEqual({ a: 1, b: 'x' });
  });

  it('extracts JSON when trailing text follows', () => {
    const raw = '{"a":1}\nas you can see...';
    expect(extractJsonFromLLMResponse(raw)).toEqual({ a: 1 });
  });

  it('handles nested objects', () => {
    expect(extractJsonFromLLMResponse('{"outer":{"inner":2}}')).toEqual({
      outer: { inner: 2 },
    });
  });

  it('does not split on braces inside string literals', () => {
    expect(extractJsonFromLLMResponse('{"s":"has } in it"}')).toEqual({
      s: 'has } in it',
    });
  });

  it('returns null on no JSON at all', () => {
    expect(extractJsonFromLLMResponse('definitely not json')).toBeNull();
  });

  it('returns null on empty / nullish input', () => {
    expect(extractJsonFromLLMResponse('')).toBeNull();
    expect(extractJsonFromLLMResponse(null)).toBeNull();
    expect(extractJsonFromLLMResponse(undefined)).toBeNull();
  });

  it('returns null on a JSON array (we only accept top-level objects)', () => {
    expect(extractJsonFromLLMResponse('[1,2,3]')).toBeNull();
  });
});
