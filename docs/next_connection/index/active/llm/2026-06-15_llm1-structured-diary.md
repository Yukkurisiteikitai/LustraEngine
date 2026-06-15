---
title: LLM-1（自由テキスト日記 → 構造化抽出）導入後の検証タスク
category: llm
status: active
date: 2026-06-15
tags: [llm-1, lm-studio, qwen, structured-extraction, diary, log-input, migration-039, verify, pr-review, validation]
related: [./2026-06-11_local-llm-setup.md]
---

# LLM-1 導入後の検証タスク 引き継ぎ資料

> 作成: 2026-06-15 / 対象: 指示書 `CLAUDE_CODE_INSTRUCTIONS.md` の Priority 1+2+3 実装後
> 更新: 2026-06-15 / Copilot PR review 7件のコード修正を適用

---

## 【2026-06-15 追記3】time_of_day: null を validator が弾く問題 → 修正済み（commit 166b182）

### 症状
`POST /api/logs/extract` が 502 `LLMExtractionFailedError` で返る。rawText は正しい JSON だが validator が null 返却。

実際の LLM レスポンス（rawText）:
```json
{"description":"YourselfLMの音声入力テストで書き込みがリセットされる仕様に嫌だった",
 "context":"自宅","time_of_day":null,"duration_minutes":null,
 "emotions":[{"label":"嫌悪","intensity":4},{"label":"苛立ち","intensity":3}],
 "action_result":"CONFRONTED_FAILED","trigger":"書き込みがリセットされる仕様",
 "needs_trigger_question":false,"trigger_question":null}
```

`time_of_day: null` が `TIME_OF_DAY_VALUES.includes(null)` で弾かれ即 `return null`。

### 原因
`8ae5a37 fix:reveiew`（Copilot review 反映）で `time_of_day` を厳格チェックに変えたが、
「LLM が時間帯を判断できない場合は null を返す」ケースを想定していなかった。

### 修正内容（commit 166b182 `fix: valitation`）
| ファイル | 変更 |
|---|---|
| `src/application/llm/policies/LLMResponseValidator.ts` | `StructuredDiaryResponse.timeOfDay: TimeOfDay | null`。time_of_day が null/不正値なら null を許容（弾かずに null で続行） |
| `components/log/ExtractedConfirmStep.tsx` | `ConfirmDraft.timeOfDay: TimeOfDay | null`。`<select>` に「不明」オプション追加（value=""、null 扱い） |
| `app/log/new/LogNewClient.tsx` | `persist()` で `draft.timeOfDay ?? undefined` に変換（route validator は undefined を無視するので DB に null が入る） |
| `src/application/usecases/ExtractStructuredDiaryUseCase.ts` | `RESPONSE_MAX_TOKENS` 1024 → 4096（Qwen3 thinking が止まらない環境向け応急措置） |
| `src/infrastructure/llm/providerRegistry.ts` | `response_empty` / `response_truncated` ログに `reasoningTokens` / `reasoningContentHead` を追加（thinking 経路の診断用） |

### 未確認事項
- ~~`POST /api/logs` の INSERT 成否はまだ未確認~~ → **2026-06-15 第3セッションで解決済み**（PGRST204 schema cache 問題、migration 040 + admin client 切り替えで対処）
- Qwen3 thinking 対策（max_tokens=4096 + chat_template_kwargs）が実機で機能しているか未確認。
  - `llm:response_empty` ログに `reasoningTokens` が出るようにしたので次回確認可能。

---

## 【2026-06-15 追記2】Qwen3 thinking モードで max_tokens 枯渇 → `/no_think` 導入

### 症状
`POST /api/logs/extract` で `LLM response was empty (finish_reason: length)` 500エラー。

LM Studio 側のレスポンスを直接確認すると:
```
"content": "",
"reasoning_content": "We need to parse the user's diary... [長文]",
"finish_reason": "length",
"usage": {
  "prompt_tokens": 924,
  "completion_tokens": 800,
  "completion_tokens_details": { "reasoning_tokens": 777 }
}
```

→ qwen3-swallow-8b-rl-v0.2 は **thinking モデル**。`reasoning_tokens: 777/800` で max_tokens を思考に食い潰し、JSON 本体に到達できず `content` が空。

### 対応（実施済み・2段階）

**第1段: `/no_think` ディレクティブ追加（効かず）**
1. `src/application/llm/structuredDiaryPrompt.ts` の `buildStructuredDiaryUserMessage` 末尾に `/no_think` を追加。
2. `src/application/usecases/ExtractStructuredDiaryUseCase.ts` の `RESPONSE_MAX_TOKENS` を 800 → 1024 に増量。
3. `scripts/llm1_prompt.py` の `build_messages` も同期。

→ 再現結果: `reasoning_tokens: 1024/1024` で content 空のまま。`qwen3-swallow-8b-rl-v0.2` の chat template が `/no_think` を処理していない。

**第2段: `chat_template_kwargs.enable_thinking=false` を payload で明示**
1. `src/infrastructure/llm/providerRegistry.ts:resolveFetchOptions` で `config.provider === 'custom_openai_compatible'` のとき `chat_template_kwargs: { enable_thinking: false }` を payload に注入（extract / chat 非ストリーミング / DetectPatterns / InferTraits すべてに効く）。
2. `src/infrastructure/llm/adapters/LMStudioAdapter.ts` の `generate()` / `generateStream()` 両方の payload にも同じキーを追加（rethink ストリーミング用）。
3. `scripts/verify_llm1_extraction.py:call_lmstudio` も payload に追加。
4. `/no_think` は prompt 末尾に残置（チャットテンプレート対応モデル用のフォールバック。他プロバイダでは無害な末尾テキスト）。

### 次セッションでの確認ポイント
- 実機で `POST /api/logs/extract` を再投げて `reasoning_tokens` がほぼ0、`content` に JSON が入ることを確認。
- 駄目だった場合の追加手: LM Studio UI の "Reasoning Effort" 設定をオフ、または model を non-thinking variant (`qwen3-swallow-8b-sft-v0.2` 等) に差し替え。
- `chat_template_kwargs` が他の OpenAI 互換サーバ（DeepSeek 等）でエラーを起こさないか要確認。今は `custom_openai_compatible` 限定で送っているので OpenAI proper / DeepSeek の通常経路には影響しないはず。

---

## 【2026-06-15 追記】Copilot PR review コメント修正

PR レビュー (Copilot) で指摘された 7 件をすべて修正・対応済み。コミット前の状態。

### 修正内容サマリー

| # | ファイル | 修正内容 |
|---|---|---|
| 1 | `app/api/logs/route.ts` | `durationMinutes` に `Number.isInteger()` チェックを追加、エラーメッセージを「整数」に変更 |
| 2 | `app/api/logs/route.ts` | `emotions[].label` の空文字チェック追加、`intensity` を整数チェックに変更 |
| 3 | `src/application/mappers/ExperienceMapper.ts` | `parseEmotions()` で `label.trim()` 非空チェック + `Math.round(intensity)` + 整数範囲チェックに変更 |
| 4 | `src/application/llm/policies/LLMResponseValidator.ts` | `context` が非文字列・欠落時に `return null`（プロンプト逸脱として検出） |
| 5 | `src/application/llm/policies/LLMResponseValidator.ts` | `duration_minutes === undefined` を `null` 扱いせず `return null`（キー欠落 = 逸脱） |
| 6 | `src/application/llm/policies/LLMResponseValidator.ts` | `emotions` キー欠落・非配列時に `return null`（必須フィールドとして扱う） |
| 7 | `app/log/new/LogNewClient.tsx` | 確認ステップから「戻る」時に `extracted / draft / triggerAnswer / messageType / statusMessage` をすべてリセット（不整合状態防止） |

### 追加ファイル

- `__tests__/logsExtractRoute.test.ts` — 新規テストファイル（6ケース）
  - 401: 未認証
  - 400: `diaryText` 空文字
  - 400: `lmConfig` 欠落
  - 200: 正常レスポンス shape 検証（`rawText` が漏れないことも確認）
  - 502: `LLMExtractionFailedError` → `{ code: 'LLM_EXTRACTION_FAILED' }`

### 修正後のテスト結果

```
Test Suites: 58 passed（前: 57）
Tests:       131 passed（前: 125）
```

### 注意点: `LLMResponseValidator` の `context` / `duration_minutes` / `emotions` を厳格化した影響

実際の LM Studio (qwen/swallow 系) が返すレスポンスで、これらキーが欠落するケースがあると `validateStructuredDiaryResponse()` が `null` を返し `LLMExtractionFailedError` になる。

**次セッションで LLM-1 プロンプト検証スクリプトを回す際は、`schema_invalid` の件数が増えていないか特に確認すること。** 増えていた場合はプロンプト側でこれらフィールドの必須性をより明示する必要がある（`scripts/llm1_prompt.py` + `structuredDiaryPrompt.ts` 両方を更新）。

---

## 何をしたか（コミット前の作業ツリー）

ログ入力フォームを **「15フィールド埋めさせる」 → 「日記テキスト1つを書く → LLM-1が構造化抽出 → ユーザが確認・修正」** に置き換えた。
本体実装と並行して、前回反省（チャットがフォールバックテンプレートしか返さなかった件 = commit `eb63919`）を踏まえ、**Python検証スクリプトを先に整備**して LLM-1 の挙動を本体組み込み前に確認できる構成にした。

### 主な成果物
- `scripts/verify_llm1_extraction.py` — LM Studio 直叩きで実データ風サンプルにLLM-1プロンプトを流し、JSON抽出の成否を集計する CLI（2026-06-15: Cloudflare 1010 対応で User-Agent をブラウザ風に固定）
- `scripts/llm1_prompt.py` / `src/application/llm/structuredDiaryPrompt.ts` — プロンプト本体（Python/TS で同一仕様）
- `src/application/llm/policies/extractJsonFromLLMResponse.ts` — 防御パース（フェンス・前置き・末尾テキスト・文字列内ブレースに対応）
- `src/application/usecases/ExtractStructuredDiaryUseCase.ts` — **サイレントフォールバック禁止**。失敗時は `LLMExtractionFailedError` を投げる
- `app/api/logs/extract/route.ts` — 新規 POST エンドポイント
- `app/log/new/LogNewClient.tsx` + `components/log/*` — 3ステップフロー (diary → confirm → trigger?)
- `supabase/migrations/039_experience_structured_extraction.sql` — action_result 4値化、emotions jsonb、time_of_day enum、duration_minutes 追加
- DB / DTO / Mapper / Repo 全層を新フィールドに対応
- 旧 `components/ObstacleForm.tsx` / `ActionSelector.tsx` および対応テストは削除（オーファン）

### 自動検証の状況
- `npx tsc --noEmit` : 0 errors
- `npx jest` : 57 suites / 125 tests passing
- `npm run lint` : 0 errors（boundary 含む）

## 次セッションで最初にやること（優先順）

### 🔴 HIGH — Phase 0: LLM-1 プロンプト検証ループ（ユーザ作業）

**未実施。本体UIの信頼性はここの結果に依存する**。

```bash
# 2つの障壁を両方回避する標準実行
python scripts/verify_llm1_extraction.py --insecure --samples 5
```

`--insecure` と User-Agent 上書きの2つが両方必要。理由は下記の「ローカル環境からトンネルに到達するときの障壁」を参照。

確認ポイント:
- 全サンプルで `endpoint_error` が 0 になっているか（= LM Studio に届いているか）
- `parse_failed` / `schema_invalid` の傾向 → プロンプト改善（`scripts/llm1_prompt.py` を編集 → 再実行）
- `expected_mismatch` → action_result / time_of_day の判定基準を見直し
- プロンプトを変えたら `src/application/llm/structuredDiaryPrompt.ts` にも同じ変更を反映する（**単一ソース運用ではないので2ファイル要更新**）

許容に達したら本体UIに進む。

### ローカル環境からトンネルに到達するときの障壁（2026-06-15 セッションで判明）

`https://llm.yourselflm.org/v1` に Python から直叩きすると、デフォルトで2段階のブロックを食らう:

1. **TLS 証明書エラー** `SSL: CERTIFICATE_VERIFY_FAILED self-signed certificate in certificate chain`
   - 原因: ローカルネットワーク上のルーター/プロキシが TLS を傍受している（既知。[[2026-06-11_local-llm-setup]] 問題4 と同根）
   - 回避: `--insecure` フラグで TLS 検証を無効化

2. **Cloudflare 1010 (Browser Integrity Check)** `http_403: error code: 1010`
   - 原因: Cloudflare が `Python-urllib/x.x` の User-Agent を「ボット風」と判断して403を返す
   - 回避: スクリプト側で常にブラウザ風 UA (`Mozilla/5.0 ... Chrome/124 ...`) を送るように修正済み（2026-06-15）。`--user-agent` で上書き可能
   - 注: app 側（Next.js / Cloudflare Workers）からの fetch でも同様の壁に当たらないかは未確認。当たったら User-Agent ヘッダの明示が必要

### 🔴 HIGH — DB migration 039 を適用

```bash
supabase db push
psql ... -c "\d+ experiences"   # 4列追加 + CHECK制約4値を目視
```

これを忘れると `POST /api/logs` で「column emotions does not exist」型のエラーになる。

### 🟡 MEDIUM — `npm run preview` での E2E 動作確認

1. `/log/new` を開く
2. 日記テキストを入力 → 「✨ AIに読み取ってもらう」
3. Step 2 に進み、emotions / action_result / time_of_day / duration_minutes が埋まっているか
4. 領域を選択 → 「保存する」 or trigger 追加質問へ
5. DB を直接覗いて `emotions jsonb` / `time_of_day` / `duration_minutes` / `trigger` / `action_result='CONFRONTED_SUCCESS'` 等が入っているか
6. **LM Studio側のリクエストログで `/v1/chat/completions` が実際にヒットしているか目視**（前回反省）
7. 音声入力ボタン: Chrome でマイク許可後、喋った内容がテキストエリアに流れ込むか

### 🟢 LOW — Web Speech API の制限明示

Safari は `webkitSpeechRecognition` 未対応。現状は「このブラウザでは未対応」ヒントを出して隠している。
Safari 対応が必要なら別途文字起こしAPI（外部）に差し替える設計判断が要る。

## 既知の前提 / 残課題

- **`emotion` (TEXT) 列を残置**: 後方互換のため、新規書き込み時は `emotions[0].label` を埋める。古い表示系（`getSearchFieldText` の `emotion` 検索など）が壊れないため。完全に乗り換えるなら別 PR で削除可能。
- **`get_unclassified_experiences` RPC** は新カラムを返さない（既存呼び出し側に影響なしのため今回未修正）。LLM-1で抽出した emotions/timeOfDay を後続のパターン検出やトレイト推論で使うなら、この RPC を拡張する必要あり。
- **Cloudflare preview の env**: `.dev.vars` に `LLM_BASE_URL=https://llm.yourselflm.org/v1` 等が入っている前提（[[2026-06-11_local-llm-setup]] 参照）。
- **action_result 4値の `isConfrontation()` 扱い**: `CONFRONTED_SUCCESS` / `CONFRONTED_FAILED` / `PARTIAL` を confrontation とみなし、ストレス係数 ×0.7 を適用する。PARTIAL を別係数にしたい場合は `src/core/domains/experience/Experience.ts` の `stressImpact()` を調整。
- **既存の `'CONFRONTED'` データは migration 039 で `'CONFRONTED_SUCCESS'` に変換済み**。フロント側の表示ラベルも 4値対応 (`getActionLabel` 等) に更新済み。

## 関連するファイル

- 指示書: `CLAUDE_CODE_INSTRUCTIONS.md`（リポジトリ直下、未コミット）
- モック: `log_input_mockup.html`（リポジトリ直下、未コミット）
- 既存LLM接続事情: [[2026-06-11_local-llm-setup]]
- DBスキーマ: `supabase/migrations/001_initial.sql`（初期） + `supabase/migrations/039_experience_structured_extraction.sql`（今回）
