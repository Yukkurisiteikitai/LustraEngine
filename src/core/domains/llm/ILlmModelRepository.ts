export interface ILlmModelRepository {
  upsertByName(name: string): Promise<string>;
  getPricing(modelId: string): Promise<{ inputPrice: number | null; outputPrice: number | null }>;
}
