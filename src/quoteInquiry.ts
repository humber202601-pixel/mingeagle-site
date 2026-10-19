import {parseWholesaleRfq} from './rfqParser';
import {retailReference} from '../lib/retail-reference';
import {isUsDeliveryState} from '../lib/us-delivery-states';

// Only explicit customer-reviewed values may prefill a draft. Never use a tier's floor.
export function quoteInquiryDefaults(item?: Record<string, unknown>) {
  const message = String(item?.message || '');
  const stateMatches=[...message.matchAll(/^Buyer-provided US destination state:\s*([A-Z]{2})\s*$/gm)];
  const stateCandidate=stateMatches.at(-1)?.[1]||'';
  const shippingState=isUsDeliveryState(stateCandidate)?stateCandidate:'';
  const rfq = parseWholesaleRfq(message);
  if (rfq.length > 1) return {quantity: '', description: '', multiline: true, shippingState};
  const quantities = new Set<string>();
  const add = (value: unknown) => { const s = String(value || '').trim(); if (/^[1-9]\d{0,5}$/.test(s)) quantities.add(s); };
  add(item?.estimated_quantity);
  for (const match of message.matchAll(/^Exact requested units: ([1-9]\d{0,5})\s*$/gm)) add(match[1]);
  for (const match of message.matchAll(/(?:^|; )Quantity: ([1-9]\d{0,5}) units(?=;|$)/gm)) add(match[1]);
  let description = '';
  if (rfq.length === 1) {
    add(rfq[0].quantity);
    const candidate = rfq[0].product + ' | No. ' + rfq[0].size + ' | ' + rfq[0].color;
    if (retailReference(candidate) !== null) description = candidate;
  }
  return {quantity: quantities.size === 1 ? [...quantities][0] : '', description, multiline: false, shippingState};
}
