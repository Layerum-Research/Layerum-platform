type RequestHeaders = Record<string, string | string[] | undefined>;

export type ParsedUserAgent = {
  osName: string;
  browserName: string;
  deviceType: string;
  deviceLabel: string;
};

export function extractUserAgent(headers: RequestHeaders | undefined) {
  const header = headers?.['user-agent'];
  return (Array.isArray(header) ? header[0] : header) ?? null;
}

export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  const ua = (userAgent ?? '').toLowerCase();

  const osName = ua.includes('windows')
    ? 'Windows'
    : ua.includes('mac os') || ua.includes('macintosh')
      ? 'macOS'
      : ua.includes('android')
        ? 'Android'
        : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')
          ? 'iOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'Unknown OS';

  const browserName = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('chrome/')
        ? 'Chrome'
        : ua.includes('firefox/')
          ? 'Firefox'
          : ua.includes('safari/') && !ua.includes('chrome/')
            ? 'Safari'
            : 'Unknown Browser';

  const deviceType = /iphone|ipad|android|mobile/.test(ua)
    ? 'mobile'
    : 'desktop';
  const deviceLabel = deviceType === 'mobile' ? 'Mobile Device' : 'Desktop';

  return { osName, browserName, deviceType, deviceLabel };
}
