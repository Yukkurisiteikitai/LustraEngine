import { buildShareToken, generateR2PresignedUrl, sha256Hex } from '@/infrastructure/amc/amcCrypto';

describe('amcCrypto', () => {
  it('builds a stable token hash pair', () => {
    const token = buildShareToken();
    expect(token.token).toBeTruthy();
    expect(token.tokenHash).toBe(sha256Hex(token.token));
    expect(token.tokenPrefix).toHaveLength(8);
  });

  it('generates a presigned URL for R2', () => {
    const url = generateR2PresignedUrl({
      accountId: '123456789abcdef',
      bucket: 'amc-yourselflm',
      key: 'users/u1/records/r1/attachments/a1',
      method: 'PUT',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      expiresInSeconds: 3600,
      contentType: 'image/png',
    });

    expect(url).toContain('https://123456789abcdef.r2.cloudflarestorage.com/amc-yourselflm/users/u1/records/r1/attachments/a1?');
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(url).toContain('X-Amz-Signature=');
  });
});
