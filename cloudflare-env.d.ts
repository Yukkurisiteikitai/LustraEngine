// Augment the global CloudflareEnv interface declared by @opennextjs/cloudflare
// with project-specific KV bindings and Queue bindings.

export interface AnalysisQueueMessage {
  jobId: string;
  userId: string;
  trigger: 'daily' | 'manual';
  mode: 'quick' | 'full_3months' | 'daily';
}

declare global {
  interface CloudflareEnv {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    // Compatibility binding name; stores Analytics ViewModel JSON, not HTML.
    HTML_CACHE: KVNamespace;
    ANALYSIS_QUEUE: Queue<AnalysisQueueMessage>;
    LLM_PROVIDER?: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'custom_openai_compatible' | 'claude' | 'lmstudio';
    ANTHROPIC_API_KEY?: string;
    LMSTUDIO_ENDPOINT?: string;
    LMSTUDIO_API_KEY?: string;
    LMSTUDIO_MODEL?: string;
    APP_ENV: 'development' | 'preview' | 'production';
    LLM_TYPE?: 'gpt' | 'claude' | 'gemini';
    LLM_BASE_URL?: string;
    LLM_API_KEY?: string;
    LLM_MODEL?: string;
    LLM_SETTINGS_ENCRYPTION_KEY?: string;
  }
}

export {};
