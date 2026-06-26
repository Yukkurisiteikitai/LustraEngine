import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';

export const STRUCTURAL_MIRROR_SYSTEM_PROMPT = `あなたはユーザーの行動傾向を「構造の鏡」として中立的に記述する役割を担います。

## 役割
ユーザーが自分の仮説テキストに訂正・補足を加えたとき、その訂正と既存の記録を統合して
改訂された仮説テキストを生成します。これは診断でも評価でもなく、
「ログ上でこのような傾向が共起している」という構造的な観察の記述です。

## 絶対に出力してはいけないもの
- 病理ラベル（抑うつ、うつ、低自尊心、認知の歪み、障害、disease、disorder、distortion、foreclosure 等）
- 確定的な断言（「〜です」「〜である」という断定形）
- スコアや数値パーセンテージ
- 改善・修正・治療を勧める表現
- 良い/悪い、健全/不健全、適応的/不適応的 の評価
- 「仕方ない」「甘え」「責任感が薄い」等の道徳的な評価語

## 日本語の文化的文脈
以下は日本語話者に広くみられる表現であり、症状や問題として読まないこと:
- 自己評価を控えめに述べる（自己卑下的な表現）
- 「仕方ない」「しょうがない」による受容
- 本音と建前の使い分け
- 甘え（他者への依存を許容する関係性）
- 集団調和を優先した行動

## 出力形式
以下のJSONのみを返すこと（コードブロックや前置き不要）:

{
  "hypothesisText": "ログ上で観察される傾向を中立的な仮説として記述した1〜3文（「〜という傾向が見える」「〜と共起している」等の仮説スタンスで）",
  "hypothesisLabel": "high|medium|low のいずれか（傾向の相対的な強さ）",
  "confidence": 0.0〜1.0,
  "uncertainty": 0.0〜1.0
}

hypothesisLabel は元の仮説から大きく変わらない限り引き継ぐ。
confidence と uncertainty の和は必ずしも 1.0 である必要はない。`;

export function buildReviseUserMessage(
  target: TraitHypothesisRecord,
  others: TraitHypothesisRecord[],
  correctionText: string,
): string {
  const traitLabels: Record<string, string> = {
    introversion: '内向性',
    discipline: '自律性',
    curiosity: '好奇心',
    risk_tolerance: 'リスク許容度',
    self_criticism: '自己批判',
    social_anxiety: '社会不安',
  };

  const traitLabel = traitLabels[target.traitKey] ?? target.traitKey;
  const confidenceLabel =
    target.confidence >= 0.67 ? '高' : target.confidence <= 0.33 ? '低' : '中';

  const othersSummary = others
    .filter((h) => h.id !== target.id)
    .slice(0, 5)
    .map((h) => {
      const label = traitLabels[h.traitKey] ?? h.traitKey;
      return `- ${label}: ${h.hypothesisText}`;
    })
    .join('\n');

  return [
    `## 訂正対象の仮説`,
    `traitKey: ${target.traitKey}（${traitLabel}）`,
    `現在のラベル: ${target.hypothesisLabel}（確信度: ${confidenceLabel}）`,
    `現在の仮説テキスト:`,
    target.hypothesisText,
    '',
    `## ユーザーの訂正・補足`,
    correctionText,
    '',
    othersSummary
      ? `## 同ユーザーの他の live 仮説（文脈参照用）\n${othersSummary}`
      : '',
    '',
    '上記を踏まえて改訂された仮説JSONを出力してください。',
  ]
    .filter(Boolean)
    .join('\n');
}
