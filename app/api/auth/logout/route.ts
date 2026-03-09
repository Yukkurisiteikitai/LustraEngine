import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', 'https://lustra-engine.vercel.app/'), {
    status: 302,
  });
}
