// Conservative, read-only B2B quote release safety check.
// Drafts may contain placeholders; public links and real quotation emails may not.
export type QuoteTermsInput={
  payment_terms?:unknown;
  shipping_terms?:unknown;
  valid_until?:unknown;
};
const normalized=(value:unknown)=>String(value??'').trim().replace(/\s+/g,' ');
const isUnconfirmed=(value:unknown)=> {
  const term=normalized(value);
  if (!term) return true;
  if (/^(?:tbd|tbc|n\/?a|pending|unknown|not specified|to be confirmed|not confirmed)$/i.test(term))return true;
  if (/\b(to be confirmed|pending confirmation|terms? not (?:yet )?confirmed|will be confirmed|require(?:s)? staff confirmation|confirm before sending|quote pending)\b/i.test(term))return true;
  return false;
};
function parseValidity(value:unknown):number|null {
  const t=normalized(value);
  if (!t) return null;
  const candidate=/^\d{4}-\d\d-\d\d$/.test(t)?t+'T23:59:59Z'
    : /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(t)?t.replace(' ','T')+'Z'
    : t;
  const epoch=Date.parse(candidate);
  return Number.isFinite(epoch)?epoch:null;
}
export function quoteTermsIssues(quote:QuoteTermsInput,now=Date.now()):string[]{
  const issues:string[]=[];
  if(isUnconfirmed(quote.payment_terms)) issues.push('PAYMENT_TERMS_UNCONFIRMED');
  if(isUnconfirmed(quote.shipping_terms)) issues.push('SHIPPING_TERMS_UNCONFIRMED');
  const expiration=parseValidity(quote.valid_until);
  if(expiration===null)issues.push('QUOTE_VALIDITY_MISSING');
  else if(expiration<=now)issues.push('QUOTE_EXPIRED');
  return issues;
}
export const quoteTermsIssueDescriptions:Record<string,string>={
  PAYMENT_TERMS_UNCONFIRMED:'Confirm exact payment method, due date or deposit/balance terms before customer release.',
  SHIPPING_TERMS_UNCONFIRMED:'Confirm freight method, delivery basis, estimated timeline and duty/customs responsibility before customer release.',
  QUOTE_VALIDITY_MISSING:'Enter a valid quotation expiration date before releasing to the customer.',
  QUOTE_EXPIRED:'Quotation has expired. Revise and re-confirm prices and terms before releasing.'
};

/**
 * Fail closed when a commercial payment clause merely mentions Stripe but
 * actually directs the buyer to a different or disabled payment route.
 * This is conservative text screening, not proof of buyer acceptance or tax.
 */
export function stripeCheckoutTermsSupported(value:unknown):boolean{
 const term=String(value??'').trim().replace(/\s+/g,' ');
 if(term.length<12||term.length>500||!/\bstripe\b/i.test(term)||
    !/\b(?:pay|payment|checkout|card|cards)\b/i.test(term))return false;
 // No alternative payment rail is enabled on this merchant's website.
 if(/\b(?:bank\s+(?:transfer|wire)|wire\s+transfer|ach|wise|payoneer|airwallex|paypal|cash)\b/i.test(term))
  return false;
 if(/\b(?:no|not|never|without|cannot|can't|do\s+not|don't|unavailable|disabled|forbidden|prohibited)\b.{0,40}\bstripe\b/i.test(term))
  return false;
 if(/\bstripe\b.{0,40}\b(?:not\s+(?:accepted|supported|allowed)|unavailable|disabled|forbidden|prohibited)\b/i.test(term))
  return false;
 return true;
}
