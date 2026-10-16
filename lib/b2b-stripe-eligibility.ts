import {quoteTermsIssues,stripeCheckoutTermsSupported} from './b2b-quote-terms';

/**
 * Both sides must agree to complete commercial terms before a wholesale order
 * becomes eligible for secure Stripe collection. This validates approval and
 * agreed terms; it does not decide sales-tax nexus or grant tax exemptions.
 */
export type AcceptedB2bQuote={
 status?:unknown;sent_at?:unknown;accepted_at?:unknown;
 payment_terms?:unknown;shipping_terms?:unknown;valid_until?:unknown;
};
const utcTimestamp=(value:unknown):number|null=>{
 if(typeof value!=='string')return null;
 const text=value.trim();
 if(!/^\d{4}-\d\d-\d\d(?:[ T]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z)?)?$/.test(text))return null;
 const normalized=text.replace(' ','T');
 const stamp=Date.parse(normalized.endsWith('Z')?normalized:
  normalized+(normalized.includes('T')?'Z':'T00:00:00Z'));
 return Number.isFinite(stamp)?stamp:null;
};
export function acceptedB2bQuotePayable(quote:AcceptedB2bQuote):boolean{
 if(!['ACCEPTED','CONVERTED'].includes(String(quote.status||'')))return false;
 if(!stripeCheckoutTermsSupported(quote.payment_terms))return false;
 const sent=utcTimestamp(quote.sent_at),accepted=utcTimestamp(quote.accepted_at);
 if(sent===null||accepted===null||sent>accepted)return false;
 return quoteTermsIssues({payment_terms:quote.payment_terms,
   shipping_terms:quote.shipping_terms,valid_until:quote.valid_until},accepted).length===0;
}
