import {isUsDeliveryState} from './us-delivery-states';

// The seller must confirm both destination and import-duty responsibility
// before generating a draft intended for later Stripe buyer acceptance.
// No automatic DDP or zero-tax assumption is made.
export type WholesaleImportDutyBasis = 'SELLER_INCLUDED' | 'BUYER_RESPONSIBLE';

export function buildReviewedWholesaleDeliveryTerms(
  state: string,
  dutyBasis: string,
  shippingNotes: string
): string {
  const destination = state.trim().toUpperCase();
  if (!isUsDeliveryState(destination)) throw new Error('SHIP_TO_STATE_REQUIRED');
  if (dutyBasis !== 'SELLER_INCLUDED' && dutyBasis !== 'BUYER_RESPONSIBLE')
    throw new Error('CUSTOMS_DUTIES_REVIEW_REQUIRED');
  const notes = shippingNotes.trim().replace(/\s+/g, ' ');
  if (notes.length < 18 || notes.length > 350 ||
    /\b(?:tbd|tbc|pending|not confirmed|to be confirmed|pending confirmation)\b/i.test(notes))
    throw new Error('DELIVERY_TERMS_NOT_CONFIRMED');
  const importClause = dutyBasis === 'SELLER_INCLUDED'
    ? 'Seller covers customs clearance and US import duties; sales tax is separately stated in this quotation.'
    : 'Buyer is responsible for customs clearance and US import duties; sales tax is separately stated in this quotation.';
  return `Ship-to state: ${destination}. ${notes} ${importClause}`;
}
