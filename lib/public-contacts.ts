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

// Page headings and navigation text must never become a buyer's name.
export function publicPersonName(value:string){
  const parts=value.trim().replace(/\s+/g,' ').split(' ');
  const nonNames=/^(?:at|the|new|our|your|basketball|academy|training|programs?|teams?|contact|about|director|coach|manager|owner|founder|staff|membership|sports|adult|youth|playing|career|experience|biography|profile|learn|more|read|meet|welcome|services?|schedule|register|registration|home|school|athletics|performance|leadership|principal|purchasing|procurement|gallery|news|privacy|policy|expert|interview|if)$/i;
  return parts.length>=2&&parts.length<=3&&parts.every(p=>/^[A-Z][A-Za-z'’-]{1,30}$/.test(p)&&!nonNames.test(p));
}

// Wix footer/social links describe the website builder, not the customer institution.
export function isWebsiteVendorSocial(value:string){
  try{const url=new URL(value),host=url.hostname.toLowerCase().replace(/^(www|m)\./,''),path=url.pathname.toLowerCase().replace(/\/+$/,'');
    return host==='instagram.com'&&['/wix','/wixstudio'].includes(path)||host==='facebook.com'&&['/wix','/wixstudio'].includes(path)||host==='linkedin.com'&&['/company/wix-com','/company/wix'].includes(path)||host==='tiktok.com'&&['/@wix','/@wixstudio'].includes(path);
  }catch{return false;}
}
