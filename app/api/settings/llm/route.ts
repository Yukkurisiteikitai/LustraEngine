import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { AuthError } from '@/core/errors/AuthError';
import { ValidationError } from '@/core/errors/ValidationError';
import { handleError } from '@/lib/apiHelpers';
import {
  encryptApiKey,
  decryptApiKey,
  resolveLlmSettingsEncryptionKey,
} from '@/infrastructure/llm/llmSettingsCrypto';
import { validateLLMConfig } from '@/infrastructure/llm/providerRegistry';
import type { LMConfig } from '@/types';

type LlmSettingsResponse = {
  setting: {
    provider: string;
    type: string;
    model: string;
    baseUrl: string | null;
    hasApiKey: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

function toResponse(setting: {
  provider: string;
  type: string;
  model: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    provider: setting.provider,
    type: setting.type,
    model: setting.model,
    baseUrl: setting.baseUrl,
    hasApiKey: setting.hasApiKey,
    isActive: setting.isActive,
    createdAt: setting.createdAt,
    updatedAt: setting.updatedAt,
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    // In production, user-managed LLM settings are disabled.
    // Return null to prevent exposing stored settings.
    const appEnv = process.env.APP_ENV;
    if (appEnv === 'production') {
      return NextResponse.json({ setting: null } satisfies LlmSettingsResponse);
    }

    const { llmSettings } = createRepositories(supabase);
    const setting = await llmSettings.getActiveByUser(user.id);
    return NextResponse.json({ setting: setting ? toResponse(setting) : null } satisfies LlmSettingsResponse);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    // In production, reject user-managed LLM settings storage.
    const appEnv = process.env.APP_ENV;
    if (appEnv === 'production') {
      return NextResponse.json(
        {
          ok: false,
          error: 'User-managed LLM settings are disabled in production',
        } satisfies ErrorResponse,
        { status: 403 },
      );
    }

    let body: Partial<LMConfig>;
    try {
      body = (await req.json()) as Partial<LMConfig>;
    } catch {
      throw new ValidationError('LLM設定のJSONが不正です');
    }

    const { llmSettings } = createRepositories(supabase);
    const existing = await llmSettings.getActiveByUser(user.id);

    const requestedApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const encryptionKey = requestedApiKey || existing?.encryptedApiKey
      ? resolveLlmSettingsEncryptionKey()
      : null;
    const preservedApiKey = !requestedApiKey && existing?.encryptedApiKey && encryptionKey
      ? await decryptApiKey(existing.encryptedApiKey, encryptionKey)
      : '';

    const config: LMConfig = {
      provider: (body.provider ?? 'anthropic') as LMConfig['provider'],
      type: body.type,
      model: body.model,
      apiKey: requestedApiKey || preservedApiKey || undefined,
      baseUrl: body.baseUrl,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      claudeApiKey: body.claudeApiKey,
      lmstudioEndpoint: body.lmstudioEndpoint,
      lmstudioApiKey: body.lmstudioApiKey,
      lmstudioModel: body.lmstudioModel,
    };

    const resolved = validateLLMConfig(config);
    const encryptedApiKey = requestedApiKey
      ? await encryptApiKey(requestedApiKey, encryptionKey ?? resolveLlmSettingsEncryptionKey())
      : existing?.encryptedApiKey ?? null;

    const saved = await llmSettings.upsertActive(
      user.id,
      {
        provider: resolved.provider,
        type: resolved.type,
        model: resolved.model,
        baseUrl: resolved.baseUrl,
        apiKey: requestedApiKey || undefined,
      },
      encryptedApiKey,
    );

    return NextResponse.json({ setting: toResponse(saved) } satisfies LlmSettingsResponse);
  } catch (error) {
    return handleError(error);
  }
}
