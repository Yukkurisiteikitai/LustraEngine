---
title: wrangler dev での認証ループ（/logs にアクセスするとログインループになる）
category: infra
status: active
date: 2026-06-15
tags: [wrangler, auth, supabase, cookie, open-next, middleware, ssr]
related: [./2026-06-08_deployment-checklist.md, ../llm/2026-06-11_local-llm-setup.md]
---

# wrangler dev 認証ループ 引き継ぎ資料

> 作成: 2026-06-15

---

## 症状

`npx wrangler dev` 起動中に `/logs`（記録ページ）へアクセスすると `/login` にリダイレクトされる。
ログインしても home (`/`) に戻るだけで、再び `/logs` に行くとまたログインを要求される。

**`npm run dev`（通常の Next.js dev サーバー）では再現しない。wrangler 限定。**

---

## 診断済み事項

### home ページは認証チェックをしない（仕様通り）

`app/page.tsx` の `getUser()` は null でもリダイレクトせず 0 値でレンダリングする。
「home が表示された = ログイン成功」ではない。ここはバグではない。

### 環境変数は問題なし

`.dev.vars` に以下が設定済みであることを確認:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 認証フロー構成

| ファイル | 役割 |
|---|---|
| `middleware.ts` | `getUser()` でセッション更新、Cookie を `supabaseResponse` に書き込む |
| `lib/supabase/server.ts` | `next/headers`の`cookies()`を使うサーバー用クライアント |
| `lib/supabase/client.ts` | `createBrowserClient`、ログイン後 Cookie に token を書く |
| `app/login/page.tsx` | email/password ログイン後 `window.location.href = '/'` |
| `app/api/auth/callback/route.ts` | Google OAuth コールバック処理 |

---

## 仮説（未検証）

### 仮説A: open-next / Cloudflare Workers での `next/headers` cookies() の挙動差異

wrangler dev は open-next 経由で Next.js を Cloudflare Workers として動かす。
この環境では `next/headers`の`cookies()`がリクエストの Cookie ヘッダーを正しく読めていない可能性がある。

- standard Next.js: middleware が更新した Cookie → server component に自動的に伝播
- open-next/Cloudflare Workers: この Cookie 伝播が機能していない可能性

### 仮説B: middleware の supabaseResponse が open-next で正しく処理されない

`middleware.ts` は Cookie 更新を `supabaseResponse` に書き込んで `return supabaseResponse` する。
open-next のミドルウェア処理パスで、この response の Cookie が後続リクエストに反映されない可能性。

### 仮説C: `getUser()` のネットワークリクエストが Workers sandbox から失敗する

`supabase.auth.getUser()` はサーバーから Supabase の `/auth/v1/user` に HTTP リクエストを送る。
Workers の fetch が Supabase URL に到達できない場合（DNS 解決失敗、SSL 問題など）、`getUser()` は null を返す。

関連: [[2026-06-11_local-llm-setup]] でも wrangler のミドルウェア sandbox では `NODE_TLS_REJECT_UNAUTHORIZED` が効かない問題が既知。

---

## 次セッションで試すこと（優先順）

### 1. `getUser()` の結果をログ出力して仮説C を確認

`middleware.ts` に以下を追加して wrangler 起動:

```ts
const { data: { user }, error } = await supabase.auth.getUser();
console.log('[middleware] getUser result:', { userId: user?.id ?? null, error: error?.message });
```

wrangler のログに `userId: null` かつ `error: ...` が出ていれば仮説C 確定。
エラーなく `userId: null` なら Cookie が届いていない（仮説A/B）。

### 2. Cookie が届いているか確認（仮説A/B の確認）

`middleware.ts` に追加:
```ts
console.log('[middleware] cookies:', request.cookies.getAll().map(c => c.name));
```

ログイン後のリクエストで `sb-****-auth-token` が出ていれば Cookie は届いている。
出ていなければブラウザ → wrangler 間の Cookie 伝達に問題あり。

### 3. `getUser()` を `getSession()` に変えてみる（一時診断用）

`app/logs/page.tsx` と `middleware.ts` で試験的に `getSession()` に変えてみる。
`getSession()` は Cookie の JWT をローカルで検証するだけでネットワーク不要。
これで認証が通れば仮説C（ネットワーク到達不可）が確定。
※ `getSession()` はサーバーサイドでは本番使用非推奨なので診断後は戻すこと。

### 4. open-next の issue tracker を確認

open-next + Supabase SSR の Cookie 問題は既知の issue として報告されている可能性がある。
`@opennextjs/cloudflare` の GitHub issue で "supabase" "cookie" "auth" を検索する。

---

## 関連ファイル

- `middleware.ts` — セッション refresh の中心
- `lib/supabase/server.ts` — サーバー用 Supabase クライアント
- `lib/supabase/client.ts` — ブラウザ用 Supabase クライアント
- `app/login/page.tsx` — ログイン UI とリダイレクト
- `.dev.vars` — wrangler 用環境変数（Git 管理外）
