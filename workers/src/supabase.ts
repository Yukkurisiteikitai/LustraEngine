import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Worker環境バインディング型定義。
 *
 * wrangler.jsonc の [vars]（公開情報のため平文OK）:
 *   SUPABASE_URL      = "https://xxxx.supabase.co"
 *   SUPABASE_ANON_KEY = "eyJ..."
 *
 * wrangler secret put で登録（機密情報）:
 *   SUPABASE_SERVICE_ROLE_KEY  ← /api/monitor の get_db_stats() RPC専用
 *
 * 使い分け:
 *   createUserClient  → ユーザーデータ操作（/api/logs, /api/traits 等）
 *   createAdminClient → Admin RPC（/api/monitor の DB統計取得）のみ
 */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** /api/monitor の get_db_stats() RPC専用。他エンドポイントでは使わない。 */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** ユーザーごとのSSR HTMLキャッシュ用KVネームスペース */
  HTML_CACHE: KVNamespace;
}

// ─── Cookie解析 ────────────────────────────────────────────────────────────

/**
 * CookieヘッダーからSupabaseセッションCookieを解析してJWTを取り出す。
 *
 * Supabaseは `sb-<project-ref>-auth-token` というCookieに
 * base64エンコードされたJSON（{ access_token, refresh_token, ... }）を保存する。
 *
 * 本番環境での注意点:
 *   セッションが長い場合、Cookieは `sb-<ref>-auth-token.0`, `.1` のように
 *   チャンク分割される。その場合は全チャンクを順番に結合してからデコードする必要がある。
 *   この実装はチャンクなしの単純なケースを処理する。
 */
export function extractJwtFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  // Supabase認証Cookieのパターンにマッチ
  const match = cookieHeader.match(/sb-[a-z0-9]+-auth-token=([^;]+)/);
  if (!match) return null;

  const raw = decodeURIComponent(match[1]);

  // Supabaseバージョンによってエンコード方式が異なる（base64 JSON or 平文JSON）
  try {
    // パターン1: base64エンコードされたJSON
    const decoded = atob(raw);
    const session = JSON.parse(decoded) as { access_token?: string };
    if (session.access_token) return session.access_token;
  } catch {
    // base64デコード失敗 → パターン2へ
  }

  try {
    // パターン2: 平文JSON
    const session = JSON.parse(raw) as { access_token?: string };
    return session.access_token ?? null;
  } catch {
    return null;
  }
}

// ─── JWT解析（キャッシュキー生成専用） ────────────────────────────────────

/**
 * JWTのペイロードから `sub`（SupabaseユーザーUUID）を取り出す。
 *
 * 重要: この関数は署名を検証しない。キャッシュキーの構築専用。
 * 認証・認可の判断には必ず `supabase.auth.getUser()` を使うこと。
 *
 * なぜ生Cookieではなく `sub` を使うか:
 *   `access_token` はリフレッシュのたびに変化するため、
 *   Cookieの値そのものをキーにすると別ユーザーのように扱われてしまう。
 *   `sub` はユーザーアカウントの生存期間中不変のUUID。
 */
export function extractUserIdFromJwt(jwt: string): string | null {
  try {
    const [, payloadB64] = jwt.split('.');
    if (!payloadB64) return null;
    // JWTはbase64url形式 → 標準base64に変換してからatob
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded)) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// ─── Supabaseクライアントファクトリ ───────────────────────────────────────

/**
 * ユーザー認証済みSupabaseクライアントを生成する。
 *
 * ユーザーのJWTを Authorization ヘッダーにセットすることで、
 * SupabaseのRLS（行レベルセキュリティ）ポリシーがそのユーザーとして発動する。
 *
 * 用途: GETエンドポイント（/api/traits, /api/persona等）でのデータ読み取り。
 * 注意: Workers はステートレスなので autoRefreshToken を必ず false にする。
 */
export function createUserClient(env: Env, userJwt: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        // Supabaseはこのヘッダーを読んでリクエストをユーザーとして認証する
        Authorization: `Bearer ${userJwt}`,
      },
    },
    auth: {
      autoRefreshToken: false,  // Workers間でセッションを共有できないため無効
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Supabase管理者クライアントを生成する（service_role_key使用）。
 *
 * RLSを完全にバイパスする。
 * 用途: /api/monitor の get_db_stats() RPC のみ。
 * ユーザーデータの操作には絶対に使わないこと。
 */
export function createAdminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

