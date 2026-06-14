---
title: LLM-1（自由テキスト日記 → 構造化抽出）導入後の検証タスク
category: llm
status: active
date: 2026-06-15
tags: [llm-1, lm-studio, qwen, structured-extraction, diary, log-input, migration-039, verify]
related: [./2026-06-11_local-llm-setup.md]
---

# LLM-1 導入後の検証タスク 引き継ぎ資料

> 作成: 2026-06-15 / 対象: 指示書 `CLAUDE_CODE_INSTRUCTIONS.md` の Priority 1+2+3 実装後

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
