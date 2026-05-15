const encoder = new TextEncoder();
const decoder = new TextDecoder();

const LOCAL_DEV_LLM_SETTINGS_SECRET = 'local-dev-llm-settings-key';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptApiKey(apiKey: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(apiKey),
  );
  const payload = new Uint8Array(iv.length + cipher.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(cipher), iv.length);
  return toBase64(payload);
}

export async function decryptApiKey(encryptedApiKey: string, secret: string): Promise<string> {
  const payload = fromBase64(encryptedApiKey);
  if (payload.length <= 12) {
    throw new Error('Encrypted API key payload is invalid');
  }
  const iv = payload.slice(0, 12);
  const cipher = payload.slice(12);
  const key = await deriveKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipher,
  );
  return decoder.decode(plain);
}

export function resolveLlmSettingsEncryptionKey(): string {
  const key = process.env.LLM_SETTINGS_ENCRYPTION_KEY;
  if (key) return key;

  if (process.env.APP_ENV === 'production') {
    throw new Error('LLM_SETTINGS_ENCRYPTION_KEY is missing');
  }

  // Local debugging fallback: avoid breaking app flows when the secret is not set.
  return LOCAL_DEV_LLM_SETTINGS_SECRET;
}
