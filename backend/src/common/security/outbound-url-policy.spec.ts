import {
  assertSafeOutboundHttpUrl,
  normalizeSafeOutboundBaseUrl,
} from './outbound-url-policy';

describe('outbound URL policy', () => {
  afterEach(() => {
    delete process.env.PROVIDER_ALLOWED_PRIVATE_HOSTS;
  });

  it('rejects local and private targets before fetch', async () => {
    await expect(
      assertSafeOutboundHttpUrl('http://localhost:4000'),
    ).rejects.toThrow('host is not allowed');
    await expect(
      assertSafeOutboundHttpUrl('http://127.0.0.1:4000'),
    ).rejects.toThrow('host is not allowed');
    await expect(
      assertSafeOutboundHttpUrl('http://[::1]:4000'),
    ).rejects.toThrow('host is not allowed');
    await expect(
      assertSafeOutboundHttpUrl('http://[::ffff:127.0.0.1]:4000'),
    ).rejects.toThrow('host is not allowed');
  });

  it('rejects unsafe provider base_url shapes', async () => {
    await expect(
      normalizeSafeOutboundBaseUrl('https://user:pass@example.com/v1'),
    ).rejects.toThrow('must not contain credentials');
    await expect(
      normalizeSafeOutboundBaseUrl('https://example.com/v1?x=1'),
    ).rejects.toThrow('must not contain query parameters');
  });

  it('rejects private provider hosts unless they are listed', async () => {
    await expect(
      normalizeSafeOutboundBaseUrl('http://localhost:11434/v1'),
    ).rejects.toThrow('host is not allowed');

    process.env.PROVIDER_ALLOWED_PRIVATE_HOSTS = ' Ollama , localhost';
    await expect(
      normalizeSafeOutboundBaseUrl('http://localhost:11434/v1/'),
    ).resolves.toBe('http://localhost:11434/v1');
    await expect(
      normalizeSafeOutboundBaseUrl('http://ollama:11434/v1'),
    ).resolves.toBe('http://ollama:11434/v1');
    await expect(
      normalizeSafeOutboundBaseUrl('http://127.0.0.1:11434/v1'),
    ).rejects.toThrow('host is not allowed');
    await expect(
      normalizeSafeOutboundBaseUrl('https://user:pass@ollama/v1'),
    ).rejects.toThrow('must not contain credentials');
  });

  it('does not apply the provider allowlist to other outbound URLs', async () => {
    process.env.PROVIDER_ALLOWED_PRIVATE_HOSTS = 'localhost';
    await expect(
      assertSafeOutboundHttpUrl('http://localhost:4000'),
    ).rejects.toThrow('host is not allowed');
  });
});
