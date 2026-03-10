export interface ILlmModelRepository {
  upsertByName(name: string): Promise<string>;
}
