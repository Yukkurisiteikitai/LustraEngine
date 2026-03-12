import type { SupabaseClient } from '@supabase/supabase-js';
import type { ILlmModelRepository } from '@/core/domains/llm/ILlmModelRepository';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

type PricingResult = { inputPrice: number | null; outputPrice: number | null };
type CacheEntry = { value: PricingResult; expiresAt: number };

const PRICING_TTL_MS = 5 * 60 * 1000;

export class SupabaseLlmModelRepository implements ILlmModelRepository {
  private readonly pricingCache = new Map<string, CacheEntry>();

  constructor(private readonly supabase: SupabaseClient) {}

  async upsertByName(name: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('llm_models')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single();

    if (error) throw new InfrastructureError(`LLMモデル登録エラー: ${error.message}`);
    return data.id as string;
  }

  async getPricing(modelId: string): Promise<PricingResult> {
    const now = Date.now();
    const cached = this.pricingCache.get(modelId);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const { data } = await this.supabase
      .from('llm_model_pricing')
      .select('input_price, output_price')
      .eq('model_id', modelId)
      .maybeSingle();

    const value: PricingResult = data != null
      ? { inputPrice: data.input_price as number, outputPrice: data.output_price as number }
      : { inputPrice: null, outputPrice: null };

    this.pricingCache.set(modelId, { value, expiresAt: now + PRICING_TTL_MS });
    return value;
  }
}
