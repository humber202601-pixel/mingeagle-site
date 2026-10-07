// Public website reads never follow a redirect into local or private hosts.
export function publicUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return false;
    if (!host.includes('.') || host.includes(':') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return false;
    if (/^\d+(?:\.\d+){3}$/.test(host)) {
      const [a, b] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))) return false;
    }
    return true;
  } catch { return false; }
}

export async function fetchPublicText(value: string, timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    let url = value;
    for (let redirects = 0; redirects <= 4; redirects++) {
      if (!publicUrl(url)) throw new Error('非公开网站地址。');
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: {
        accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'MING-EAGLE-Discovery/13.1 (+https://mingeagle.com)',
      } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('网站重定向缺少目标。');
        url = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !/html|xml|text\/plain/i.test(contentType)) { await response.body?.cancel(); throw new Error('网站未返回网页内容。'); }
      const reader = response.body?.getReader();
      if (!reader) return '';
      const decoder = new TextDecoder();
      let body = '', bytes = 0;
      try {
        while (bytes < 1500000) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          body += decoder.decode(chunk.value, { stream: true });
        }
      } finally { await reader.cancel(); }
      return (body + decoder.decode()).slice(0, 650000);
    }
    throw new Error('网站重定向次数过多。');
  } finally { clearTimeout(timer); }
}
