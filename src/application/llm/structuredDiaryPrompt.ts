// LLM-1: structured diary extraction prompt — TS counterpart of scripts/llm1_prompt.py.
// Keep BOTH files in sync when iterating the prompt.

import { ACTION_RESULT_VALUES, TIME_OF_DAY_VALUES } from '@/types';

export const STRUCTURED_DIARY_SYSTEM_PROMPT = `あなたはユーザの日記テキストから経験データを構造化抽出するアシスタントです。

絶対ルール:
- 出力はJSONオブジェクト1つだけ。前後の説明文・コードフェンス（\`\`\`json）禁止。
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
- 感情が明示されないなら空配列 [] を返す`;

interface FewShot {
  user: string;
  assistant: Record<string, unknown>;
}

export const STRUCTURED_DIARY_FEW_SHOTS: readonly FewShot[] = [
  {
    user: 'スタバで2時間レポートやった。550円分は絶対回収してやるって気持ちで集中できた。国語のレポート2個終わって爽快だった。',
    assistant: {
      description: 'スタバで国語のレポートを2件完了',
      context: 'スタバ',
      time_of_day: 'afternoon',
      duration_minutes: 120,
      emotions: [
        { label: '爽快', intensity: 4 },
        { label: '達成感', intensity: 4 },
      ],
      action_result: 'CONFRONTED_SUCCESS',
      trigger: '550円分は回収してやるという気持ち',
      needs_trigger_question: false,
      trigger_question: null,
    },
  },
  {
    user: '夜ベッドで明日の発表の準備しようと思ってたけどYouTube見て寝ちゃった。最悪。',
    assistant: {
      description: '発表準備を予定していたがYouTubeを見て就寝',
      context: '自宅・ベッド',
      time_of_day: 'night',
      duration_minutes: null,
      emotions: [
        { label: '自己嫌悪', intensity: 4 },
        { label: '後悔', intensity: 3 },
      ],
      action_result: 'AVOIDED',
      trigger: null,
      needs_trigger_question: true,
      trigger_question: '発表準備に取りかかれなかった一番の理由は何ですか？',
    },
  },
] as const;

// ILLMPort.generate takes a single user message string; embed few-shots inline
// so the local OpenAI-compatible adapter receives them as part of the turn.
// (Switching to a messages-array port can come later if we need true multi-turn.)
export function buildStructuredDiaryUserMessage(diaryText: string): string {
  const lines: string[] = [];
  for (const fs of STRUCTURED_DIARY_FEW_SHOTS) {
    lines.push('### 例（入力）');
    lines.push(fs.user);
    lines.push('### 例（出力）');
    lines.push(JSON.stringify(fs.assistant, null, 0));
    lines.push('');
  }
  lines.push('### 入力');
  lines.push(diaryText);
  lines.push('### 出力（JSONのみ）');
  // /no_think: Qwen3 chat-template directive to skip the <think> block.
  // Structured extraction does not benefit from chain-of-thought, and reasoning
  // tokens were consuming the entire max_tokens budget (777/800 observed) on
  // qwen3-swallow, leaving no room for the JSON itself.
  // Other providers (OpenAI/Anthropic) treat this as harmless trailing text.
  lines.push('/no_think');
  return lines.join('\n');
}

export const STRUCTURED_DIARY_SCHEMA_META = {
  actionResults: ACTION_RESULT_VALUES,
  timeOfDays: TIME_OF_DAY_VALUES,
  intensityMin: 1,
  intensityMax: 5,
  maxEmotions: 5,
} as const;
