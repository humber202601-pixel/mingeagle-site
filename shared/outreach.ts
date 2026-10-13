export const COMPANY_WEBSITE = 'https://www.mingeagle.com';
export const WEBSITE_INTRO = `You can compare our actual product models, sizes and published retail reference prices in the wholesale catalog: ${COMPANY_WEBSITE}/wholesale-product-catalog.html. We can then confirm sample options and an individual bulk quote based on the quantities and destination.`;
// Generic, non-personalized tracking for manually reviewed B2B introductions.
// Never encode the lead, email address, or any customer identity in this URL.
export function buyerPlannerIntro(customerType:string){
 const t=String(customerType||'').toUpperCase();
 const page=['TRAINING_ACADEMY','BASKETBALL_TRAINING','INDEPENDENT_COACH','BASKETBALL_CAMP'].includes(t)
  ? 'for-coaches.html'
  : ['SCHOOL','EDUCATION','SCHOOL_DISTRICT','AFTER_SCHOOL','EDUCATION_SUPPLIER'].includes(t)
   ? 'for-schools.html':'wholesale.html';
 const link=COMPANY_WEBSITE+'/'+page+'?utm_source=mingeagle_sales&utm_medium=manual_outreach&utm_campaign=b2b_intro#volume-quote-planner';
 return 'If your program needs 10 or more indoor-play balls and sea freight is suitable, you can choose the actual product, size and quantity using this quick quote planner: '+link+
 '. For US deliveries, 25–30 days after dispatch is an estimate, not a guaranteed arrival date. Wholesale prices and discounts depend on the final order.';
}

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
