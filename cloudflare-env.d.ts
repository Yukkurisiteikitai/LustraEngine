// Augment the global CloudflareEnv interface declared by @opennextjs/cloudflare
// with project-specific KV bindings.
declare global {
  interface CloudflareEnv {
    HTML_CACHE: KVNamespace;
  }
}

export {};
