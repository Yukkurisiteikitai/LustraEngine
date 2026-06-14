---
title: ローカルLLM (LM Studio via Cloudflare Tunnel) 接続セットアップ
category: llm
status: active
date: 2026-06-11
tags: [lm-studio, cloudflare, tunnel, llm, wrangler, .dev.vars, supabase, migration, ssl]
related: []
---

# ローカルLLM接続セットアップ 引き継ぎ資料
> 作成日: 2026-06-11 / 対象セッション: local-llm接続 + Cloudflare Workers preview環境構築
> 移行: 2026-06-14 にメモリ `project_local_llm_handover.md` から docs に移行

---

## 背景・目的

Anthropic APIへの課金ができないため、自宅PCで動作するLM Studio（ローカルLLM）を
Cloudflare Tunnel経由で公開し、Webアプリのバックエンドとして使用する。

- **LM Studioエンドポイント**: `https://llm.yourselflm.org/v1`
- **稼働中トンネル**: `yourselflm.org.lmstudio`（自宅Windows PC `210.174.28.205` から接続中）
- **利用可能モデル**:
  - `qwen3-swallow-8b-rl-v0.2` ← メイン
  - `qwen3-swallow-8b-sft-v0.2`
  - `zai-org/glm-4.7-flash`
  - `ibm/granite-3.2-8b`
  - `google/gemma-4-e4b`
  - `text-embedding-nomic-embed-text-v1.5`

---

## 今回セッションで実施した内容

### 1. `.env.local` 作成
```
LLM_BASE_URL=https://llm.yourselflm.org/v1
LLM_PROVIDER=lmstudio
LLM_MODEL=qwen3-swallow-8b-rl-v0.2
NODE_TLS_REJECT_UNAUTHORIZED=0  ← npm run dev用のSSL回避（後述）
```

### 2. `.dev.vars` 作成（Cloudflare Workers preview用）
`npm run preview` (wrangler) は `.env.local` ではなく `.dev.vars` から env vars を読む。
全サーバーサイド変数を `.dev.vars` に追加済み。
`.gitignore` にて `*.dev.vars` / `.dev.vars` は除外済み。

重要な発見: `wrangler.jsonc` の `vars` はデフォルトでproduction設定になっており、
`.dev.vars` がそれを上書きする。`.dev.vars` がない状態では
`LLM_BASE_URL=https://api.openai.com/v1` が使われていた。

### 3. `wrangler.jsonc` は production設定を維持
`vars` セクションは OpenAI/production のまま。ローカル開発は `.dev.vars` で上書き。

### 4. DB migration 適用 (supabase db push)
`experiences` テーブルに `careful` カラムが存在しないエラーが発生。
→ migration 036, 037 が未適用だったため `supabase db push` を実行。

---

## 現在の状態（2026-06-11時点）

### 動いていること ✓
- `npm run preview` (Cloudflare Workers) で起動可能
- `GET /api/settings/user` 200 OK
- `GET /api/settings/llm` 200 OK
- `GET /api/chat/threads` 200 OK
- `GET /api/persona` 200 OK
- `POST /api/analysis/jobs` 200 OK
- `[Queue] Job completed successfully` ← Cloudflare Queue処理が動作

### 動いていない・未確認 ✗
- `npm run dev` → SSL証明書エラー（後述）でSupabase認証不可
- `POST /api/logs` → migration適用後に未テスト（`careful` カラムエラーが解消したか未確認）
- `PUT /api/settings/user` → 間欠的500（原因未特定）
- LM Studioへのリクエストが実際に飛んでいるか → Queue jobは完了したがLLM応答の確認なし
- チャット機能のLLM応答 → 未テスト

> **2026-06-14時点の補足**: `eb63919 fix: LM Studio chat always returned fallback template instead of real responses` という commit が入っている。チャットのフォールバック暴発バグは別途修正されている可能性がある。要確認。

---

## 未解決の問題と検証優先度

### 🔴 優先度HIGH

#### 問題1: LM Studioへのリクエストが本当に届いているか
- **症状**: Queue jobは `completed` だが、LLM呼び出しの証拠がない
- **仮説A**: `APP_ENV=development` かつ `.dev.vars` のLLM設定が正しく読まれていれば届いているはず
- **仮説B**: `createWorkerLLM.ts` がCloudflare env経由でLLM設定を読んでいる前提が成立しているか不明
- **検証方法**:
  1. LM Studio側のリクエストログ（UI上のログタブ）を確認
  2. chatでメッセージ送信して応答が返るか確認
  3. wranglerログに `LLMError` や `fetch failed` が出ないか確認

#### 問題2: `careful` カラム修正後の `POST /api/logs` 動作確認
- **症状**: `supabase db push` 実行後に `/log/new` からログを投稿していない
- **検証方法**: `/log/new` から実際に経験を投稿 → `POST /api/logs 202 Accepted` かつエラーなし

### 🟡 優先度MEDIUM

#### 問題3: `PUT /api/settings/user` 500 の原因
- **症状**: `/settings` ページでユーザー設定を保存しようとすると間欠的500
- **仮説A**: `user_settings` テーブルのスキーマと `parseUpdate` の入力が不一致
- **仮説B**: migration 033 (`user_settings`) の適用漏れ
- **仮説C**: `supabase.auth.getUser()` のセッションが取れていない（認証済みでも）
- **検証方法**:
  1. wranglerログの `console.error` 出力を確認（`unhandled_error` または `InfrastructureError`）
  2. Supabaseダッシュボードで `user_settings` テーブルの存在とスキーマを確認
  3. migration 033〜037が全て適用済みか `supabase migration list` で確認

#### 問題4: `npm run dev` のSSL証明書エラー
- **症状**: `SELF_SIGNED_CERT_IN_CHAIN` で Supabase への全fetch失敗
- **原因**: ローカルネットワーク上のルーター/プロキシがTLS通信を傍受している
- **回避策（済み）**: `.env.local` に `NODE_TLS_REJECT_UNAUTHORIZED=0` を追加
- **残問題**: Next.jsのMiddlewareはsandbox内で動くため、この env var が効かない可能性
- **仮説**: middleware内の `context.fetch` は Node.js の `process.env` を参照していない
- **検証方法**:
  1. `NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev` と直接設定して試す
  2. `next.config.ts` でWebpackやNode.jsオプションを設定する方法を検討
  3. **現実的な解決策**: `npm run dev` を諦めて `npm run preview` をメインにする

### 🟢 優先度LOW

#### 問題5: `__name is not defined` ブラウザエラー
- **症状**: Cloudflare preview起動時にブラウザコンソールでエラー
- **原因**: `@opennextjs/cloudflare@1.19.11` の既知バンドルバグ
- **影響**: ページは動作するので開発には影響なし
- **対処**: バージョンアップ待ち、または手動でpolyfillを追加

---

## アーキテクチャメモ（Cloudflare環境）

```
npm run dev    → Node.js Next.js dev server (localhost:3000)
               → .env.local のみ参照
               → SSL証明書エラーで Supabase middleware 接続不可

npm run preview → opennextjs-cloudflare build + wrangler preview (localhost:8787)
                → .env.local (NEXT_PUBLIC_* のみ、ビルド時に埋め込み)
                → .dev.vars (サーバーサイド変数、runtime時に注入)
                → Cloudflare Workers V8 runtime（SSL問題なし）
```

### 環境変数の優先順位（preview時）
1. `.dev.vars` > `wrangler.jsonc vars` （wrangler公式仕様）
2. `NEXT_PUBLIC_*` はビルド時に `.env.local` から埋め込まれる

### LLM設定の読み込みフロー
```
.dev.vars → wrangler env bindings → process.env (nodejs_compat経由)
→ createWorkerLLM.ts → LLMアダプター選択 → LMStudioAdapter → https://llm.yourselflm.org/v1
```

---

## 次のセッションで最初にやること

1. `supabase migration list` でmigration 033〜037が全て適用済みか確認
2. `npm run preview` → `/log/new` から経験を投稿 → エラーなし確認
3. `/chat` でメッセージ送信 → LM Studioに届いているか確認（LM Studio UI側のログも見る）
4. もし届かないなら `createWorkerLLM.ts` のenv var読み込み箇所をデバッグ
5. **2026-06-14追加**: `eb63919 fix: LM Studio chat always returned fallback template` の修正内容を確認し、本ドキュメントの「問題1」が既に解消しているか判定する
