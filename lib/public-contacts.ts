export function publicPhone(raw: string) {
  let value = raw;
  try { value = decodeURIComponent(raw); } catch {}
  value = value.replace(/^tel:/i, '').split('?')[0].trim();
  const core = value.replace(/\s*(?:x|ext\.?)\s*\d{1,6}$/i, '');
  const digits = core.replace(/\D/g, '');
  const us = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (us.length === 10) return /^[2-9]\d{2}[2-9]\d{6}$/.test(us) ? value.slice(0, 80) : '';
  return core.startsWith('+') && digits.length >= 11 && digits.length <= 15 ? value.slice(0, 80) : '';
}

export function publicPhones(html: string, text: string) {
  const found = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["'](tel:[^"']+)["']/gi)) {
    const value = publicPhone(match[1]); if (value) found.add(value);
  }
  // Unformatted numbers and substrings inside IDs must not become phone numbers.
  const formatted = /(?<![A-Za-z0-9])(?:\+?1[\s.\-]+)?(?:\([2-9]\d{2}\)[\s.\-]*|[2-9]\d{2}[\s.\-]+)[2-9]\d{2}[\s.\-]+\d{4}(?:\s*(?:x|ext\.?)\s*\d{1,6})?(?![A-Za-z0-9])/gi;
  for (const match of text.matchAll(formatted)) { const value = publicPhone(match[0]); if (value) found.add(value); }
  for (const match of text.matchAll(/\b(?:phone|call|telephone|tel|text)\s*:?\s*(\+?1?\d{10})(?!\d)/gi)) { const value = publicPhone(match[1]); if (value) found.add(value); }
  return [...found];
}

export function organizationName(value: string) {
  return value.replace(/\s+(?:\+?1[\s.\-]*)?(?:\(?\d{3}\)?[\s.\-]*)\d{3}[\s.\-]*\d{4}(?:\s.*)?$/, '').trim();
}
