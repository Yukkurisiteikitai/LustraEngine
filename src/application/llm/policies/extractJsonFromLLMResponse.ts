// Defensive JSON extractor for small local LLMs (qwen3-swallow-8b, etc.)
// that frequently wrap their JSON in ```json fences or preface it with
// explanation text. Mirrors scripts/verify_llm1_extraction.py::extract_json_object.
//
// Strategy:
//   1. Strip ```json / ``` fences if present.
//   2. Try JSON.parse on the whole stripped text.
//   3. Fallback: scan for the first '{' and find its balanced '}', skipping
//      braces inside string literals.
// Returns the parsed object, or null if no JSON object can be recovered.

export function extractJsonFromLLMResponse(raw: string | null | undefined): unknown {
  if (!raw) return null;
  let text = raw.trim();

  if (text.startsWith('```')) {
    const nl = text.indexOf('\n');
    if (nl !== -1) text = text.slice(nl + 1);
    if (text.endsWith('```')) text = text.slice(0, -3);
    text = text.trim();
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to brace-scan
  }

  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch {
          return null;
        }
        return null;
      }
    }
  }

  // depth > 0: JSON was truncated before closing }. Attempt repair.
  if (depth > 0) {
    const fragment = text.slice(start);
    // Pattern A: last value is complete, just missing closing braces
    for (let d = depth; d >= 1; d--) {
      try {
        const candidate = fragment + '}'.repeat(d);
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch { /* try next */ }
    }
    // Pattern B: truncated mid-key (e.g. ,"keyName... at end) — strip and close
    const stripped = fragment.replace(/,\s*"[^"]*$/, '');
    if (stripped !== fragment) {
      for (let d = depth; d >= 1; d--) {
        try {
          const candidate = stripped + '}'.repeat(d);
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch { /* try next */ }
      }
    }
  }
  return null;
}
