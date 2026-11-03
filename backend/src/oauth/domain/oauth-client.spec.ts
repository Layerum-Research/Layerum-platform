import { isAllowedRedirectUri } from './oauth-client';

describe('isAllowedRedirectUri', () => {
  it.each([
    'http://127.0.0.1:8080/callback',
    'http://localhost:1024/callback',
    'http://localhost:65535/callback',
  ])('accepts %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(true);
  });

  it.each([
    ['look-alike host', 'http://127.0.0.1.evil.com:8080/callback'],
    ['userinfo host trick', 'http://127.0.0.1:8080@evil.com/callback'],
    ['userinfo', 'http://user:pass@127.0.0.1:8080/callback'],
    ['https', 'https://127.0.0.1:8080/callback'],
    ['missing port', 'http://127.0.0.1/callback'],
    ['privileged port', 'http://127.0.0.1:1023/callback'],
    ['port out of range', 'http://127.0.0.1:65536/callback'],
    ['extra path', 'http://127.0.0.1:8080/callback/extra'],
    ['other path', 'http://127.0.0.1:8080/other'],
    ['query', 'http://127.0.0.1:8080/callback?a=1'],
    ['empty query', 'http://127.0.0.1:8080/callback?'],
    ['fragment', 'http://127.0.0.1:8080/callback#x'],
    ['other loopback', 'http://[::1]:8080/callback'],
    ['leading zero port', 'http://127.0.0.1:08080/callback'],
    ['not a url', 'not a url'],
  ])('rejects %s', (_label, uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(false);
  });
});
