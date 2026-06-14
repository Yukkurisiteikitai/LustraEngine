#!/usr/bin/env python3
"""LLM-1 抽出スクリプト検証ツール.

YourselfLM のログ入力UI改修で導入する LLM-1（自由テキスト日記 → 構造化JSON抽出）を、
本体実装前にローカルLLM (LM Studio via Cloudflare Tunnel) で実データ風サンプルにかけ、
プロンプトと防御パースが安定して動くかを目視確認するためのスクリプト。

前回反省: チャットがフォールバックテンプレートばかり返すバグ (commit eb63919) のように、
「動いてるつもりで実は壊れている」を再発させない。本スクリプトでは LLM が呼べていない
ケースを明示的に "endpoint_error" として可視化する。

使い方:
  python scripts/verify_llm1_extraction.py
  python scripts/verify_llm1_extraction.py --samples 5
  python scripts/verify_llm1_extraction.py --endpoint http://localhost:1234/v1 --model qwen3-swallow-8b-rl-v0.2
  python scripts/verify_llm1_extraction.py --insecure   # 自己署名証明書回避用

出力:
  各サンプルにつき raw text / 抽出後の dict / 失敗理由 を1ブロックで表示。
  最後に集計を表示（成功/各失敗カテゴリの件数）。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import urllib.request
import urllib.error
import ssl

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from llm1_prompt import (  # noqa: E402
    ACTION_RESULTS,
    INTENSITY_MAX,
    INTENSITY_MIN,
    MAX_EMOTIONS,
    TIME_OF_DAYS,
    build_messages,
)

DEFAULT_ENDPOINT = "https://llm.yourselflm.org/v1"
DEFAULT_MODEL = "qwen3-swallow-8b-rl-v0.2"
DEFAULT_FIXTURE = REPO_ROOT / "scripts" / "fixtures" / "diary_samples.json"

REQUIRED_KEYS = {
    "description",
    "context",
    "time_of_day",
    "duration_minutes",
    "emotions",
    "action_result",
    "trigger",
    "needs_trigger_question",
    "trigger_question",
}


# ---------------------------------------------------------------------------
# defensive JSON extraction — mirrors the future TS extractJsonFromLLMResponse
# ---------------------------------------------------------------------------

def extract_json_object(raw: str) -> dict | None:
    """Extract a single JSON object from arbitrary LLM output.

    Strategy:
      1. strip ```json / ``` fences if present
      2. try json.loads on the whole stripped text
      3. fallback: scan for the first '{' and find its matching '}' (brace balance)
    Returns None if no JSON object can be parsed.
    """
    if not raw:
        return None
    text = raw.strip()

    # strip leading ```json / ``` fences and trailing ```
    if text.startswith("```"):
        nl = text.find("\n")
        if nl != -1:
            text = text[nl + 1 :]
        if text.endswith("```"):
            text = text[: -3]
        text = text.strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : i + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    return None
    return None


# ---------------------------------------------------------------------------
# schema validation
# ---------------------------------------------------------------------------

@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)


def validate_schema(obj: dict) -> ValidationResult:
    errors: list[str] = []
    missing = REQUIRED_KEYS - set(obj.keys())
    if missing:
        errors.append(f"missing_field:{sorted(missing)}")

    def _str_or_err(key: str, allow_none: bool = False) -> None:
        if key not in obj:
            return
        v = obj[key]
        if v is None and allow_none:
            return
        if not isinstance(v, str):
            errors.append(f"type_error:{key} expected str got {type(v).__name__}")

    _str_or_err("description")
    _str_or_err("context")
    _str_or_err("trigger", allow_none=True)
    _str_or_err("trigger_question", allow_none=True)

    if "time_of_day" in obj and obj["time_of_day"] not in TIME_OF_DAYS:
        errors.append(f"enum_mismatch:time_of_day={obj['time_of_day']!r}")
    if "action_result" in obj and obj["action_result"] not in ACTION_RESULTS:
        errors.append(f"enum_mismatch:action_result={obj['action_result']!r}")

    if "duration_minutes" in obj:
        dur = obj["duration_minutes"]
        if dur is not None and not (isinstance(dur, int) and dur >= 0):
            errors.append(f"type_error:duration_minutes={dur!r}")

    if "needs_trigger_question" in obj and not isinstance(obj["needs_trigger_question"], bool):
        errors.append(f"type_error:needs_trigger_question={obj['needs_trigger_question']!r}")

    if "emotions" in obj:
        em = obj["emotions"]
        if not isinstance(em, list):
            errors.append("type_error:emotions not a list")
        else:
            if len(em) > MAX_EMOTIONS:
                errors.append(f"emotions_too_many:{len(em)}")
            for i, e in enumerate(em):
                if not isinstance(e, dict):
                    errors.append(f"emotions[{i}]:not_object")
                    continue
                if not isinstance(e.get("label"), str):
                    errors.append(f"emotions[{i}].label:not_str")
                inten = e.get("intensity")
                if not (isinstance(inten, int) and INTENSITY_MIN <= inten <= INTENSITY_MAX):
                    errors.append(f"intensity_out_of_range:emotions[{i}]={inten!r}")

    return ValidationResult(ok=not errors, errors=errors)


# ---------------------------------------------------------------------------
# LM Studio call
# ---------------------------------------------------------------------------

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def call_lmstudio(endpoint: str, model: str, messages: list[dict],
                  max_tokens: int, temperature: float, insecure: bool, timeout: int,
                  user_agent: str = DEFAULT_USER_AGENT) -> tuple[str | None, str | None]:
    """Return (raw_text, error_message). Exactly one of them is non-None."""
    url = endpoint.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    # Cloudflare Tunnel rejects Python-urllib UA with error 1010 (Browser
    # Integrity Check). Always send a real-browser-looking UA.
    req.add_header("User-Agent", user_agent)
    req.add_header("Accept", "application/json")
    api_key = os.environ.get("LLM_API_KEY")
    if api_key:
        req.add_header("Authorization", f"Bearer {api_key}")

    ctx = None
    if insecure:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return None, f"http_{e.code}: {e.read().decode('utf-8', errors='replace')[:200]}"
    except urllib.error.URLError as e:
        return None, f"url_error: {e.reason}"
    except TimeoutError:
        return None, "timeout"

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return None, f"endpoint_returned_non_json: {body[:200]}"

    try:
        text = parsed["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None, f"unexpected_response_shape: {body[:300]}"

    return text, None


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def colorize(text: str, color: str) -> str:
    if not sys.stdout.isatty():
        return text
    codes = {"red": "31", "green": "32", "yellow": "33", "cyan": "36", "dim": "2"}
    return f"\x1b[{codes.get(color, '0')}m{text}\x1b[0m"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT,
                        help=f"OpenAI-compatible base URL (default: {DEFAULT_ENDPOINT})")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"model name (default: {DEFAULT_MODEL})")
    parser.add_argument("--fixture", default=str(DEFAULT_FIXTURE), help="path to diary_samples.json")
    parser.add_argument("--samples", type=int, default=0, help="limit to first N samples (0=all)")
    parser.add_argument("--max-tokens", type=int, default=600)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--timeout", type=int, default=120, help="HTTP timeout seconds")
    parser.add_argument("--insecure", action="store_true", help="skip TLS verification (self-signed proxy)")
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT,
                        help="override the User-Agent header (default: a Chrome-like UA to bypass Cloudflare BIC)")
    parser.add_argument("--show-raw", action="store_true", help="always print raw model text, not only on failure")
    args = parser.parse_args()

    fixture_path = Path(args.fixture)
    if not fixture_path.exists():
        print(f"fixture not found: {fixture_path}", file=sys.stderr)
        return 2

    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    samples: list[dict[str, Any]] = fixture.get("samples", [])
    if args.samples > 0:
        samples = samples[: args.samples]

    print(colorize(f"endpoint = {args.endpoint}", "cyan"))
    print(colorize(f"model    = {args.model}", "cyan"))
    print(colorize(f"samples  = {len(samples)}", "cyan"))
    print()

    tally = {
        "ok": 0,
        "endpoint_error": 0,
        "parse_failed": 0,
        "schema_invalid": 0,
        "expected_mismatch": 0,
    }

    for i, sample in enumerate(samples, 1):
        sid = sample.get("id", f"#{i}")
        diary = sample.get("diary", "")
        print(colorize(f"[{i}/{len(samples)}] {sid}", "yellow"))
        print(colorize(f"  diary: {diary}", "dim"))

        messages = build_messages(diary)
        raw, err = call_lmstudio(
            args.endpoint, args.model, messages,
            max_tokens=args.max_tokens, temperature=args.temperature,
            insecure=args.insecure, timeout=args.timeout,
            user_agent=args.user_agent,
        )
        if err is not None:
            tally["endpoint_error"] += 1
            print(colorize(f"  ENDPOINT_ERROR: {err}", "red"))
            print()
            continue

        if args.show_raw:
            print(colorize(f"  raw: {raw[:400]}{'…' if len(raw) > 400 else ''}", "dim"))

        obj = extract_json_object(raw or "")
        if obj is None:
            tally["parse_failed"] += 1
            print(colorize("  PARSE_FAILED — could not extract JSON object", "red"))
            print(colorize(f"  raw: {raw[:400]}{'…' if len(raw) > 400 else ''}", "dim"))
            print()
            continue

        v = validate_schema(obj)
        if not v.ok:
            tally["schema_invalid"] += 1
            print(colorize(f"  SCHEMA_INVALID: {v.errors}", "red"))
            print(colorize(f"  obj: {json.dumps(obj, ensure_ascii=False)[:400]}", "dim"))
            print()
            continue

        mismatches: list[str] = []
        for key in ("action_result", "time_of_day"):
            exp_key = f"expected_{key}"
            if exp_key in sample and sample[exp_key] != obj.get(key):
                mismatches.append(f"{key}: expected={sample[exp_key]!r} got={obj.get(key)!r}")
        if mismatches:
            tally["expected_mismatch"] += 1
            print(colorize(f"  EXPECTED_MISMATCH: {mismatches}", "yellow"))
        else:
            tally["ok"] += 1
            print(colorize("  OK", "green"))

        compact = {
            "description": obj.get("description"),
            "context": obj.get("context"),
            "time_of_day": obj.get("time_of_day"),
            "duration_minutes": obj.get("duration_minutes"),
            "emotions": obj.get("emotions"),
            "action_result": obj.get("action_result"),
            "trigger": obj.get("trigger"),
            "needs_trigger_question": obj.get("needs_trigger_question"),
        }
        print(colorize(f"  -> {json.dumps(compact, ensure_ascii=False)}", "dim"))
        print()

    print(colorize("=== summary ===", "cyan"))
    for k, v in tally.items():
        color = "green" if k == "ok" else ("yellow" if k == "expected_mismatch" else "red")
        print(colorize(f"  {k:18s} {v}", color))

    return 0 if tally["endpoint_error"] == 0 and tally["parse_failed"] == 0 and tally["schema_invalid"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
