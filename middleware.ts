import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  
  // 許可するオリジンのリスト
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_SUPABASE_URL, // Supabase
    process.env.NEXT_PUBLIC_SITE_URL, // 自分のドメイン（手動設定）
    process.env.RENDER_EXTERNAL_URL, // Render自動設定
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined, // Vercel自動設定
    'http://localhost:3000', // ローカル開発環境
  ].filter(Boolean) as string[];

  // OPTIONSリクエスト（プリフライト）への対応
  if (request.method === 'OPTIONS') {
    const isAllowed = origin && allowedOrigins.some((allowed) => origin.startsWith(allowed));
    
    if (!isAllowed) {
      return new NextResponse(null, { status: 403 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // 未認証ユーザーを /login にリダイレクト（公開ページは除外）
  const publicPaths = ['/login', '/api/auth'];
  const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 認証済みユーザーが /login にアクセスしたら / にリダイレクト
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // CORSヘッダーを追加（許可されたオリジンのみ）
  if (origin) {
    const isAllowed = allowedOrigins.some((allowed) => origin.startsWith(allowed));
    if (isAllowed) {
      supabaseResponse.headers.set('Access-Control-Allow-Origin', origin);
      supabaseResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      supabaseResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
