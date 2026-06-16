---
title: Cloudflare デプロイ環境でLLM設定が無効化される問題
category: infra
status: resolved
date: 2026-06-16
resolved_date: 2026-06-16
tags: [cloudflare, wrangler, deploy, settings, llm, APP_ENV, LLM_SETTINGS_ENCRYPTION_KEY, secret, localStorage, resolveStoredLlmConfig]
---

# Cloudflare デプロイ環境でLLM設定が無効化される問題

> 作成: 2026-06-16 / 解決: 2026-06-16

---

## 症状①：設定フォームが disabled になり保存できない

`npm run deploy`（Cloudflare Workers）でデプロイすると `/settings` のLM設定フォームが disabled になり保存できない。

### 根本原因

`wrangler.jsonc` に `APP_ENV: "production"` が設定されており、以下 2 箇所が本番環境でLLM設定を完全ブロックしていた：

1. `app/settings/page.tsx` — `const llmSettingsEnabled = !isProduction;` → false
2. `app/api/settings/llm/route.ts` — GET で `{ setting: null }` 早期リターン、POST で 403

### 修正内容

- `app/settings/page.tsx`: `llmSettingsEnabled = true` に変更
- `app/api/settings/llm/route.ts`: GET/POST のproductionブロックを削除

---

## 症状②：設定済みなのに記録時に「設定ページでLMプロバイダーを設定してください」が出る

症状①を修正して設定を保存できるようになったが、日記記録（`/log/new`）時に上記エラーが表示される。

### 根本原因（2つのバグが重なっていた）

**Bug 1（クライアント側・ユーザーが見ていたエラーの直接原因）**

`lib/mockQueryClient.tsx` の各mutation（extract/detect/infer/chat）がAPIを呼ぶ前に `loadLMConfig()`（localStorage読み取り）を実行し、null なら例外を投げていた。

本番では `SettingsClient.tsx:handleSave()` が `clearLMConfig()` を呼ぶためlocalStorageが空になり、毎回エラーになっていた。

**Bug 2（サーバー側）**

`src/infrastructure/llm/resolveStoredLlmConfig.ts` が `APP_ENV === 'production'` の場合にDBを完全無視してクライアント送信のconfigをそのまま使っていた。本番ではlocalStorageからAPIキーが来ないため、`validateLLMConfig` でバリデーションエラーになる。

### 修正内容

- `src/infrastructure/llm/resolveStoredLlmConfig.ts`: `APP_ENV === 'production'` 早期リターンを削除。dev/prod共通でDB設定優先・クライアント設定フォールバックに統一。関数シグネチャを `config: LMConfig | null | undefined` に変更し `ValidationError` をインポート追加
- `lib/mockQueryClient.tsx`: 4箇所（extract/detect/infer/chat）の `if (!cfg) throw` を削除。lmConfigは `cfg ? { lmConfig: cfg } : {}` で条件付き送信に変更
- `app/api/logs/extract/route.ts`, `app/api/chat/route.ts`: `if (!lmConfig) throw new ValidationError(...)` を削除
- `app/api/patterns/detect/route.ts`, `app/api/traits/infer/route.ts`: `lmConfig: LMConfig` → `lmConfig?: LMConfig`

---

## `LLM_SETTINGS_ENCRYPTION_KEY` シークレットについて

`src/infrastructure/llm/llmSettingsCrypto.ts` の `resolveLlmSettingsEncryptionKey()` は本番でキー未設定なら throw する。APIキーを含む設定保存時（POST）に呼ばれる。

設定手順：
```bash
npx wrangler secret put LLM_SETTINGS_ENCRYPTION_KEY
```

エラー「Secret edit failed. The latest version isn't currently deployed.」→ 先に `npm run deploy` してから実行するか `npx wrangler versions secret put` を使う。

---

## 設計上の注意点

- `isProduction` 変数（`APP_ENV === 'production'`）は `page.tsx` に残す。`SettingsClient` 内の「本番ではAPIキーをlocalStorageに保存しない（`clearLMConfig()`）」ロジックに使われており削除不可
- `APP_ENV: "production"` は `wrangler.jsonc` にそのまま維持
- サーバー側はDBを常に優先参照するため、クライアントがlmConfigを送らなくてもDB設定があれば動作する
