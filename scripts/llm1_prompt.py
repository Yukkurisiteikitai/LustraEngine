"""LLM-1 (structured diary extraction) prompt — single source of truth.

This Python module mirrors what `src/application/llm/structuredDiaryPrompt.ts`
will export on the TypeScript side. Keep them in sync when iterating.

Schema (must match):
{
  "description": str,                 # 1-line summary of what was done
  "context": str,                     # place/situation
  "time_of_day": "morning|afternoon|evening|night",
  "duration_minutes": int | None,
  "emotions": [ { "label": str, "intensity": 1..5 } ],   # max 5 items
  "action_result": "CONFRONTED_SUCCESS|CONFRONTED_FAILED|AVOIDED|PARTIAL",
  "trigger": str | None,
  "needs_trigger_question": bool,
  "trigger_question": str | None
}
"""

import json

ACTION_RESULTS = ("CONFRONTED_SUCCESS", "CONFRONTED_FAILED", "AVOIDED", "PARTIAL")
TIME_OF_DAYS = ("morning", "afternoon", "evening", "night")
INTENSITY_MIN, INTENSITY_MAX = 1, 5
MAX_EMOTIONS = 5

SYSTEM_PROMPT = """あなたはユーザの日記テキストから経験データを構造化抽出するアシスタントです。

絶対ルール:
- 出力はJSONオブジェクト1つだけ。前後の説明文・コードフェンス（```json）禁止。
- すべての必須キーを必ず含める。値が読み取れないものは仕様で許された型でnullを返す。
- 日記に書かれていない事実を作らない（ハルシネーション禁止）。

出力スキーマ:
{
  "description": string,             // 1行の行為説明
  "context": string,                 // 場所・状況（例: "スタバ", "自宅"）
  "time_of_day": "morning"|"afternoon"|"evening"|"night",
  "duration_minutes": number|null,   // 所要時間（不明なら null）
  "emotions": [                       // 最大5件
    { "label": string, "intensity": 1|2|3|4|5 }
  ],
  "action_result": "CONFRONTED_SUCCESS"|"CONFRONTED_FAILED"|"AVOIDED"|"PARTIAL",
  "trigger": string|null,            // 行動のきっかけ。読み取れなければ null
  "needs_trigger_question": boolean, // trigger が null のとき true 推奨
  "trigger_question": string|null    // needs_trigger_question=true のとき1問だけ提示
}

action_result の判定:
- CONFRONTED_SUCCESS : 取り組んで完了/成功した
- CONFRONTED_FAILED  : 取り組んだが失敗/不達成だった
- AVOIDED            : 取り組まず回避した（先延ばし含む）
- PARTIAL            : 一部だけ進んだ、途中で止めた

time_of_day の目安: morning(5-11) / afternoon(11-17) / evening(17-21) / night(21-5)

emotions:
- 日記に出てくる感情語をそのまま label に使う（爽快, 不安, 自己嫌悪, など）
- intensity は文脈から1(微弱)〜5(極めて強い)で見積もる
- 感情が明示されないなら空配列 [] を返す
"""


def _few_shot_pair(user_text: str, expected: dict) -> tuple[str, str]:
    return user_text, json.dumps(expected, ensure_ascii=False)


FEW_SHOTS: list[tuple[str, str]] = [
    _few_shot_pair(
        "スタバで2時間レポートやった。550円分は絶対回収してやるって気持ちで集中できた。国語のレポート2個終わって爽快だった。",
        {
            "description": "スタバで国語のレポートを2件完了",
            "context": "スタバ",
            "time_of_day": "afternoon",
            "duration_minutes": 120,
            "emotions": [
                {"label": "爽快", "intensity": 4},
                {"label": "達成感", "intensity": 4},
            ],
            "action_result": "CONFRONTED_SUCCESS",
            "trigger": "550円分は回収してやるという気持ち",
            "needs_trigger_question": False,
            "trigger_question": None,
        },
    ),
    _few_shot_pair(
        "夜ベッドで明日の発表の準備しようと思ってたけどYouTube見て寝ちゃった。最悪。",
        {
            "description": "発表準備を予定していたがYouTubeを見て就寝",
            "context": "自宅・ベッド",
            "time_of_day": "night",
            "duration_minutes": None,
            "emotions": [
                {"label": "自己嫌悪", "intensity": 4},
                {"label": "後悔", "intensity": 3},
            ],
            "action_result": "AVOIDED",
            "trigger": None,
            "needs_trigger_question": True,
            "trigger_question": "発表準備に取りかかれなかった一番の理由は何ですか？",
        },
    ),
]


def build_messages(diary_text: str) -> list[dict]:
    """Return the messages array to send to an OpenAI-compatible /chat/completions endpoint."""
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for user, assistant in FEW_SHOTS:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": assistant})
    # /no_think: Qwen3 chat-template directive that skips the <think> block.
    # Mirrors structuredDiaryPrompt.ts — see comment there for context.
    messages.append({"role": "user", "content": f"{diary_text}\n/no_think"})
    return messages
