export const COMPANY_WEBSITE = 'https://www.mingeagle.com';
export const WEBSITE_INTRO = `You can explore our silent basketball range, available sizes and colors, and custom logo options on our website: ${COMPANY_WEBSITE}. If a model looks suitable for your program, I’d be happy to discuss samples or a wholesale quote.`;
export const OUTREACH_SIGNATURE = `Best regards,\nMING EAGLE\n${COMPANY_WEBSITE}`;

export function customerGreeting(target: { company?: unknown; contact?: unknown; first_name?: unknown }) {
  const company = String(target.company || 'your organization').trim();
  const contact = String(target.contact || '').trim();
  const generic = !contact || contact.toLowerCase() === company.toLowerCase()
    || /^(public business contact|unknown contact|individual buyer|contact|info|sales|admin)$/i.test(contact)
    || contact.includes('@');
  const first = String(target.first_name || contact.split(/\s+/)[0] || '').trim();
  return !generic && first ? `Hi ${first},` : `Hello ${company} team,`;
}

// Applied to the visible composer before first contact, including external-channel text.
export function ensureWebsiteIntro(body: string) {
  const signature = body.search(/(?:^|\n)(?:Best regards|Kind regards|Regards)[,\s]/i);
  const message = signature >= 0 ? body.slice(0, signature) : body;
  if (/https?:\/\/(?:www\.)?mingeagle\.com(?:[\s/#?,;:!)]|\.(?=\s|$)|$)/i.test(message)) return body;
  if (signature >= 0) return `${body.slice(0, signature).trimEnd()}\n\n${WEBSITE_INTRO}\n\n${body.slice(signature).trimStart()}`;
  return `${body.trimEnd()}\n\n${WEBSITE_INTRO}`;
}
