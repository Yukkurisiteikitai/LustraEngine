import type { Env } from './supabase';

// ─── キャッシュキー設計 ────────────────────────────────────────────────────

/**
 * ユーザー固有のSSR HTMLキャッシュキーを生成する。
 *
 * キー構造: `ssr:v1:{userId}:{pathKey}`
 * 例: "ssr:v1:a1b2c3d4-uuid:dashboard"
 *
 * 設計上のポイント:
 *   - `ssr:v1:` プレフィックス: フォーマット変更時に `v2:` に上げれば
 *     古いエントリ全体を無効化できる（KVにはプレフィックス削除機能がないが
 *     バージョン番号でミスにできる）
 *   - `userId`: Supabase UUID（JWTの `sub` クレーム）を使う。
 *     生のCookieトークン値はリフレッシュで変化するため使ってはいけない。
 *   - `pathKey`: 末尾スラッシュを除去・先頭スラッシュを削除して正規化。
 *     クエリパラメータはデフォルト除外（コンテンツに影響する場合は選択的に追加）。
 */
export function buildUserCacheKey(userId: string, pathname: string): string {
  const normalized = pathname.replace(/\/$/, '') || '/';
  const pathKey = normalized.replace(/^\//, '').replace(/\//g, '-') || 'root';
  return `ssr:v1:${userId}:${pathKey}`;
}

/**
 * Cache API用のリクエストオブジェクトをキャッシュキーとして生成する。
 *
 * Cache APIはURLまたはRequestオブジェクトをキーとして使用する。
 * 任意文字列キーを使うために内部用フェイクURLでラップする。
 *
 * 注意: Cache APIはPoP（データセンター）ごとにキャッシュを持つ。
 * あるPoPでdeleteしても他のPoPのキャッシュは削除されない。
 * ユーザー固有データには必ずKVを使い、Cache APIは公開コンテンツ専用にすること。
 */
export function buildCacheApiRequest(key: string): Request {
  return new Request(`https://internal.cache/${encodeURIComponent(key)}`);
}

// ─── Workers KV ストア（ユーザー固有HTMLに推奨）────────────────────────────

const KV_DEFAULT_TTL_SECONDS = 60 * 60; // 1時間

export interface HtmlCacheEntry {
  html: string;
  /** キャッシュ保存時刻（ISO 8601） */
  cachedAt: string;
  /** デバッグ用のパス名 */
  pathname: string;
}

/**
 * Workers KVからキャッシュ済みHTMLを取得する。
 *
 * KVはグローバルに一貫性がある（全データセンターに約60秒以内で伝播）。
 * キャッシュミス時または不正なエントリ時はnullを返す。
 * KVの読み取りエラーはサイレントに処理し、呼び出し元にキャッシュミスとして扱わせる。
 */
export async function kvGetHtml(
  kv: KVNamespace,
  key: string,
): Promise<HtmlCacheEntry | null> {
  try {
    const raw = await kv.get(key, 'json');
    if (!raw) return null;
    return raw as HtmlCacheEntry;
  } catch {
    // JSONパース失敗やKVエラー → キャッシュミスとして扱う（クラッシュしない）
    return null;
  }
}

/**
 * レンダリング済みHTMLをWorkers KVにTTL付きで保存する。
 *
 * キャッシュ書き込みは常にベストエフォート。
 * 失敗してもHTTPレスポンスには影響させない（waitUntil内から呼ばれる想定）。
 *
 * TTLについて: デフォルト1時間。データ更新後はkvDeleteHtmlで明示的に削除するが、
 * 削除が失敗してもTTL経過後に自動的に古いエントリが消えるフェイルセーフになる。
 */
export async function kvPutHtml(
  kv: KVNamespace,
  key: string,
  html: string,
  pathname: string,
  ttlSeconds = KV_DEFAULT_TTL_SECONDS,
): Promise<void> {
  const entry: HtmlCacheEntry = {
    html,
    cachedAt: new Date().toISOString(),
    pathname,
  };
  try {
    await kv.put(key, JSON.stringify(entry), { expirationTtl: ttlSeconds });
  } catch (err) {
    console.error('[cache:kvPutHtml] KV書き込み失敗:', err);
  }
}

/**
 * 特定ページのユーザーキャッシュを削除する。
 *
 * KVの削除は約60秒以内にグローバルに伝播する（結果整合性）。
 * 60秒間は古いHTMLが返る可能性があることに注意。
 *
 * より厳密な即時一貫性が必要な場合は「バージョニング方式」を採用する:
 *   KVに `version:{userId}` キーで整数を保存し、毎回インクリメントする。
 *   キャッシュキーに `v{n}` を含めることで古いエントリは自動的にミスになる。
 */
export async function kvDeleteHtml(kv: KVNamespace, key: string): Promise<void> {
  try {
    await kv.delete(key);
  } catch (err) {
    console.error('[cache:kvDeleteHtml] KV削除失敗:', err);
  }
}

/**
 * ユーザーの複数ページキャッシュを一括削除する。
 *
 * POSTリクエスト処理のバックグラウンドタスクからSupabase書き込み後に呼ばれる。
 * Promise.allSettled で並列実行し、一部の削除失敗が他の削除を止めないようにする。
 *
 * Workers KVにはプレフィックス一括削除機能がないため、
 * ページパス一覧を明示的に渡す必要がある。
 * パスが増えた場合はここのリストに追加すること。
 */
export async function kvInvalidateUserPages(
  kv: KVNamespace,
  userId: string,
  pathnames: string[],
): Promise<void> {
  await Promise.allSettled(
    pathnames.map((pathname) => {
      const key = buildUserCacheKey(userId, pathname);
      return kvDeleteHtml(kv, key);
    }),
  );
}

// ─── Cache API ストア（公開・共有コンテンツ専用）──────────────────────────

/**
 * Cache APIからキャッシュ済みレスポンスを取得する。
 *
 * ユーザー固有データには使わないこと。
 * Cache APIはPoP単位のため、削除操作がグローバルに伝播しない。
 * 公開ページ（ランディングページ、共通ヘルプページ等）にのみ使用すること。
 */
export async function cacheApiGet(key: string): Promise<Response | null> {
  const cache = caches.default;
  const req = buildCacheApiRequest(key);
  const cached = await cache.match(req);
  return cached ?? null;
}

/**
 * HTMLレスポンスをCache APIに保存する。
 *
 * Cache APIはCache-Controlヘッダーが設定されたレスポンスのみ保存する。
 * s-maxage でTTLを制御する（max-age はブラウザ用、s-maxage はCDN用）。
 */
export async function cacheApiPut(
  key: string,
  html: string,
  ttlSeconds = KV_DEFAULT_TTL_SECONDS,
): Promise<void> {
  const cache = caches.default;
  const req = buildCacheApiRequest(key);
  const res = new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `s-maxage=${ttlSeconds}`,
    },
  });
  try {
    await cache.put(req, res);
  } catch (err) {
    console.error('[cache:cacheApiPut] Cache API書き込み失敗:', err);
  }
}

/**
 * Cache APIからエントリを削除する（現在のPoPのみ）。
 *
 * 他のPoPのキャッシュは削除されない点に注意。
 * ユーザーデータの無効化には kvDeleteHtml を使うこと。
 */
export async function cacheApiDelete(key: string): Promise<void> {
  const cache = caches.default;
  const req = buildCacheApiRequest(key);
  try {
    await cache.delete(req);
  } catch (err) {
    console.error('[cache:cacheApiDelete] Cache API削除失敗:', err);
  }
}
