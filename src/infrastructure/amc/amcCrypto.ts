import { createHash, createHmac, randomBytes } from 'node:crypto';

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replaceAll(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeR2Key(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
}

function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const yyyy = date.getUTCFullYear().toString();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return {
    amzDate: `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`,
    dateStamp: `${yyyy}${mm}${dd}`,
  };
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function hexDigest(input: Buffer): string {
  return input.toString('hex');
}

export function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function buildShareToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = randomBase64Url(32);
  return {
    token,
    tokenHash: sha256Hex(token),
    tokenPrefix: token.slice(0, 8),
  };
}

export function normalizeExpiresInSeconds(value: number, fallback = 3600): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 604_800);
}

export function generateR2PresignedUrl(input: {
  accountId: string;
  bucket: string;
  key: string;
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
  contentType?: string;
}): string {
  const expiresInSeconds = normalizeExpiresInSeconds(input.expiresInSeconds);
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const host = `${input.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeR2Key(input.bucket)}/${encodeR2Key(input.key)}`;

  const signedHeaders = input.contentType ? 'content-type;host' : 'host';
  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  });

  const canonicalQueryString = [...queryParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => {
      const keyCompare = aKey.localeCompare(bKey);
      if (keyCompare !== 0) return keyCompare;
      return aValue.localeCompare(bValue);
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');

  const canonicalHeaders = input.contentType
    ? `content-type:${input.contentType}\nhost:${host}\n`
    : `host:${host}\n`;

  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    hexDigest(createHash('sha256').update(canonicalRequest, 'utf8').digest()),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), 'auto'), 's3'),
    'aws4_request',
  );
  const signature = hexDigest(hmac(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export function buildR2ObjectUrl(input: {
  accountId: string;
  bucket: string;
  key: string;
}): string {
  return `https://${input.accountId}.r2.cloudflarestorage.com/${encodeR2Key(input.bucket)}/${encodeR2Key(input.key)}`;
}
