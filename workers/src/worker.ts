/**
 * Cloudflare Workers + Hono による RecEngine APIワーカー
 *
 * 設計方針:
 *   - POST /api/logs: ctx.waitUntil() で即時202を返し、バックグラウンドでSupabase書き込み
 *   - GET  /api/page: Workers KVによるユーザー固有SSR HTMLのキャッシュファースト配信
 *   - GET  /api/traits: シンプルなSupabase読み取り（キャッシュなし）
 *
 * 既存Next.jsアプリ（OpenNext）との共存:
 *   このワーカーは別の wrangler.jsonc でデプロイする独立したAPIワーカー。
 *   Next.js SSRは @opennextjs/cloudflare が引き続き担当する。
 *   または Cloudflare Service Binding で特定パスをこのワーカーにルーティングできる。
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from './supabase';
import {
  extractJwtFromCookie,
  createUserClient,
} from './supabase';
import {
  buildUserCacheKey,
  kvGetHtml,
  kvPutHtml,
  kvInvalidateUserPages,
} from './cache';

// ─── 型定義 ────────────────────────────────────────────────────────────────

/** Honoコンテキストに Workers バインディングを注入 */
type HonoEnv = { Bindings: Env };

// ─── 認証ヘルパー ──────────────────────────────────────────────────────────

/**
 * リクエストからSupabaseセッションを検証してユーザー情報を返す。
 *
 * 検証戦略:
 *   1. Authorization: Bearer <jwt> ヘッダーを優先（APIクライアント向け）
 *   2. なければ Cookie ヘッダーから sb-*-auth-token を解析（ブラウザ向け）
 *
 * 重要: JWTのペイロードをローカルで信頼しない。
 *   必ず supabase.auth.getUser() でサーバーサイド検証を行うこと。
 *   これにより失効・無効化されたトークンを確実に弾ける。
 *
 * @returns 検証済みユーザー情報とJWT、未認証時はnull
 */
async function getAuthUser(
  c: Context<HonoEnv>,
): Promise<{ user: { id: string; email?: string }; jwt: string } | null> {
  // 戦略1: Authorizationヘッダー（Bearer トークン）
  let jwt =
    c.req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim() ?? null;

  // 戦略2: Cookieヘッダーから解析
  if (!jwt) {
    jwt = extractJwtFromCookie(c.req.header('Cookie') ?? null);
  }

  if (!jwt) return null;

  try {
    const supabase = createUserClient(c.env, jwt);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;
    return { user: { id: user.id, email: user.email ?? undefined }, jwt };
  } catch {
    // ネットワークエラーやSupabase障害 → 認証失敗として扱う
    return null;
  }
}

// ─── バリデーション ────────────────────────────────────────────────────────

interface LogObstacle {
  description: string;
  domain: 'WORK' | 'RELATIONSHIP' | 'HEALTH' | 'MONEY' | 'SELF';
  stressLevel: number;
  actionResult: 'AVOIDED' | 'CONFRONTED';
  actionMemo?: string;
}

interface LogRequestBody {
  date: string;
  obstacles: LogObstacle[];
  lmConfig?: {
    provider: 'claude' | 'lmstudio';
    claudeApiKey?: string;
  };
}

const VALID_DOMAINS = new Set(['WORK', 'RELATIONSHIP', 'HEALTH', 'MONEY', 'SELF']);

function validateLogBody(body: unknown): body is LogRequestBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;

  if (typeof b['date'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b['date'])) return false;
  if (!Array.isArray(b['obstacles']) || b['obstacles'].length === 0) return false;

  for (const obs of b['obstacles'] as unknown[]) {
    if (typeof obs !== 'object' || obs === null) return false;
    const o = obs as Record<string, unknown>;

    if (typeof o['description'] !== 'string' || o['description'].trim() === '') return false;
    if (!VALID_DOMAINS.has(o['domain'] as string)) return false;
    if (
      typeof o['stressLevel'] !== 'number' ||
      o['stressLevel'] < 1 ||
      o['stressLevel'] > 5
    ) return false;
    if (o['actionResult'] !== 'AVOIDED' && o['actionResult'] !== 'CONFRONTED') return false;
  }
  return true;
}

// ─── バックグラウンドタスク ─────────────────────────────────────────────────

/**
 * POSTレスポンス送信後にバックグラウンドで実行されるSupabase書き込みとキャッシュ無効化。
 *
 * ctx.waitUntil() に渡すことで、202レスポンスが送信された後もWorkerが生き続ける。
 * 既存コードの InMemoryQueue.enqueue() を waitUntil で置き換えたもの。
 *
 * 重要な設計原則:
 *   - この関数は絶対にthrowしてはいけない。例外はサイレントに消えるが、
 *     古いWranglerバージョンではWorkerのクラッシュを引き起こすことがある。
 *   - 各ステップ（INSERT → キャッシュ削除 → LLM処理）は独立したtry/catchで囲む。
 *     一つの失敗が後続ステップをブロックしないようにする。
 *
 * なぜ anon key + ユーザーJWT を使うか:
 *   experiences テーブルへの INSERT は RLS で "user_id = auth.uid()" に制限されており、
 *   自分のデータへの書き込みのみ許可される。service_role_key は不要。
 *   waitUntil は数秒で完了するためJWT期限切れ（1時間）のリスクも実質ゼロ。
 *   service_role_key が必要になるのは、他ユーザーデータの横断集計や
 *   RLSが設定されていないテーブルへのアクセスが発生する場合のみ。
 */
async function backgroundSaveAndInvalidate(
  env: Env,
  userId: string,
  userJwt: string,
  body: LogRequestBody,
): Promise<void> {
  // anon key + ユーザーJWT で RLS が正しく発動する
  const supabase = createUserClient(env, userJwt);

  // ── Step 1: Supabase へ experiences を INSERT ─────────────────────────
  try {
    const rows = body.obstacles.map((obs) => ({
      user_id: userId,
      description: obs.description,
      domain: obs.domain,
      stress_level: obs.stressLevel,
      action_result: obs.actionResult,
      action_memo: obs.actionMemo ?? null,
      logged_at: body.date,
    }));

    const { error } = await supabase.from('experiences').insert(rows);

    if (error) {
      // INSERT失敗はログに記録するが処理は継続する
      // クライアントは既に202を受け取っているため、次回のリトライで再送してもらう
      console.error('[worker:bg] Supabase INSERT失敗:', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        userId,
        rowCount: rows.length,
      });
      // INSERT失敗時はキャッシュを削除しない（データが変わっていないため）
      return;
    }

    console.log('[worker:bg] Supabase INSERT成功:', {
      userId,
      date: body.date,
      count: rows.length,
    });
  } catch (err) {
    console.error('[worker:bg] INSERT中に予期しないエラー:', err);
    return;
  }

  // ── Step 2: 該当ユーザーのHTMLキャッシュを削除 ───────────────────────
  // データが更新されたページのキャッシュを無効化。
  // 次回GETリクエスト時に最新データでSSRし直す。
  try {
    await kvInvalidateUserPages(env.HTML_CACHE, userId, [
      '/dashboard',
      '/logs',
      '/analytics',
    ]);
    console.log('[worker:bg] KVキャッシュ無効化完了:', { userId });
  } catch (err) {
    // キャッシュ削除失敗は非致命的。KVのTTL（1時間）が経過すれば自動的に消える。
    console.error('[worker:bg] キャッシュ無効化失敗:', err);
  }

  // ── Step 3: パターン検出LLM処理（オプション）─────────────────────────
  // 既存コードの detectPatterns ジョブに相当する処理をここに実装できる。
  //
  // 選択肢:
  //   A. ここで await する（シンプル。waitUntilが長くなる）
  //   B. Cloudflare Queues に enqueue（耐久性・リトライあり。別Workerが消費）
  //   C. Service Binding で別Workerを呼び出す（ファンアウトパターン）
  //
  // lmConfig があればLLM処理が可能（将来の実装プレースホルダー）:
  if (body.lmConfig) {
    console.log('[worker:bg] パターン検出はここで実装:', {
      userId,
      provider: body.lmConfig.provider,
    });
    // createDetectPatternsUseCase(adminClient, createLLM(body.lmConfig)).execute(userId) を呼ぶ
  }
}

// ─── Honoアプリ定義 ────────────────────────────────────────────────────────

const app = new Hono<HonoEnv>();

// ── POST /api/logs: 即時202 + バックグラウンドSupabase書き込み ──────────────
//
// 既存の app/api/logs/route.ts の POST ハンドラを置き換える。
// 最大の違い: Supabaseへの書き込みが完了する前にレスポンスを返す。
// これによりUIは即座にフィードバックを受け取れる。
app.post('/api/logs', async (c) => {
  // 1. 認証チェック
  const auth = await getAuthUser(c);
  if (!auth) {
    return c.json({ message: '認証が必要です' }, 401);
  }

  // 2. ボディサイズガード
  //    Workers は body を消費する前に Content-Length ヘッダーを確認できる
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > 16 * 1024) {
    return c.json({ message: 'リクエストボディが大きすぎます（最大16KB）' }, 413);
  }

  // 3. JSONパース・バリデーション
  let body: LogRequestBody;
  try {
    body = await c.req.json<LogRequestBody>();
  } catch {
    return c.json({ message: 'JSONの形式が不正です' }, 400);
  }

  if (!validateLogBody(body)) {
    return c.json(
      { message: 'リクエストボディの内容が不正です（date, obstacles の形式を確認してください）' },
      400,
    );
  }

  // 4. バックグラウンド処理をスケジュール
  //    c.executionCtx は HonoのContext から取得できる ExecutionContext。
  //    waitUntil に渡されたPromiseはHTTPレスポンス送信後も Worker を生かし続ける。
  //    これが InMemoryQueue.enqueue() の Workers版代替になる。
  c.executionCtx.waitUntil(
    backgroundSaveAndInvalidate(c.env, auth.user.id, auth.jwt, body),
  );

  // 5. 202 Accepted を即座に返す
  //    200 ではなく 202 を使う理由: データがまだ保存されていないことを明示するため。
  //    クライアントはポーリングまたはWebSocketで完了を確認できる（今後の拡張）。
  return c.json(
    { message: '記録を受け付けました。バックグラウンドで処理中です。' },
    202,
  );
});

// ── GET /api/page: キャッシュファーストSSR HTML配信 ──────────────────────
//
// ユーザー固有のページをKVキャッシュから配信する。
// キャッシュミス時はSupabaseからデータ取得→HTML生成→KVへ非同期保存。
//
// 実際のSSRワーカーでは、React renderToString や OpenNext の代わりに
// このパターンでAPIレスポンスまたはHTMLフラグメントをキャッシュできる。
app.get('/api/page', async (c) => {
  // 1. 認証チェック
  const auth = await getAuthUser(c);
  if (!auth) {
    return c.json({ message: '認証が必要です' }, 401);
  }

  // 2. キャッシュキーを生成
  //    auth.user.id は Supabase が検証済みのUUID（JWTのsub）。
  //    生のCookieトークン値ではないのでリフレッシュで変化しない。
  const pathname = c.req.query('path') ?? '/dashboard';
  const cacheKey = buildUserCacheKey(auth.user.id, pathname);

  // 3. KVキャッシュを確認（グローバル一貫性保証）
  const cached = await kvGetHtml(c.env.HTML_CACHE, cacheKey);
  if (cached) {
    // キャッシュヒット: SupabaseへのDBアクセスなしで即座に返す
    return new Response(cached.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Cache': 'HIT',
        'X-Cached-At': cached.cachedAt,
      },
    });
  }

  // 4. キャッシュミス: Supabaseからデータを取得してSSR
  const supabase = createUserClient(c.env, auth.jwt);
  const { data: experiences, error } = await supabase
    .from('experiences')
    .select('*, domains(description)')
    .eq('user_id', auth.user.id)
    .gte(
      'logged_at',
      new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    )
    .order('logged_at', { ascending: false });

  if (error) {
    console.error('[worker:page] Supabase SELECT失敗:', error);
    return c.json({ message: 'データの取得に失敗しました' }, 500);
  }

  // 5. HTMLをレンダリング
  //    実際のSSRワーカーでは React renderToString を呼ぶ。
  //    ここでは構造を示すためシンプルなHTMLを生成。
  const html = renderExperiencesHtml(auth.user, experiences ?? []);

  // 6. レンダリング結果をKVに非同期保存（レスポンスをブロックしない）
  c.executionCtx.waitUntil(
    kvPutHtml(c.env.HTML_CACHE, cacheKey, html, pathname),
  );

  // 7. レスポンスを返す（X-Cache: MISS でデバッグ可能）
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Cache': 'MISS',
    },
  });
});

// ── GET /api/traits: ユーザートレイト取得（キャッシュなし）───────────────
//
// 既存の app/api/traits/route.ts の GET ハンドラに相当。
// 頻繁に更新されるためキャッシュは設けない。
app.get('/api/traits', async (c) => {
  const auth = await getAuthUser(c);
  if (!auth) return c.json({ message: '認証が必要です' }, 401);

  const supabase = createUserClient(c.env, auth.jwt);
  const { data: rawTraits, error } = await supabase
    .from('traits')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('name');

  if (error) {
    console.error('[worker:traits] SELECT失敗:', error);
    return c.json({ message: `取得エラー: ${error.message}` }, 500);
  }

  // camelCase にマッピングして返す（既存の Next.js APIと同じ形式）
  const traits = (rawTraits ?? []).map((t) => ({
    id: t.id as string,
    userId: t.user_id as string,
    name: t.name as string,
    score: t.score as number,
    updatedAt: t.updated_at as string,
  }));

  return c.json({ traits });
});

// ─── HTMLレンダリング（実装例）─────────────────────────────────────────────

function renderExperiencesHtml(
  user: { id: string; email?: string },
  experiences: Record<string, unknown>[],
): string {
  const items = experiences
    .map(
      (e) =>
        `<li>${String(e['logged_at'] ?? '')} [${String(e['domain'] ?? '')}] ${String(e['description'] ?? '')}</li>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ダッシュボード</title>
</head>
<body>
  <h1>こんにちは</h1>
  <p>ユーザーID: ${user.id}</p>
  <ul>${items || '<li>記録がありません</li>'}</ul>
</body>
</html>`;
}

// ─── Workerエクスポート ────────────────────────────────────────────────────

/**
 * Cloudflare Workersのエントリポイント。
 *
 * app.fetch はHonoのルーターとして動作し、ExecutionContextを
 * 各ルートハンドラの c.executionCtx として提供する。
 * これにより waitUntil() がルートハンドラ内で使用できる。
 */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
