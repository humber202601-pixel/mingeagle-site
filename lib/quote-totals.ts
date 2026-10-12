import { cents } from './quote-math-core.mjs';

export function usdCents(value: unknown, maxUSD = 1000000, positive = false): number {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('INVALID_MONEY');
  const amount = cents(value);
  if (amount > maxUSD * 100 || (positive && amount <= 0)) throw new Error('INVALID_MONEY');
  return amount;
}

export function confirmedQuantity(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('INVALID_QUANTITY');
  if (!/^[1-9]\d{0,5}$/.test(String(value).trim())) throw new Error('INVALID_QUANTITY');
  return Number(value);
}

export function quoteTotals(items: Array<{ quantity: unknown; unitPrice: unknown }>, shipping: unknown, discount: unknown = 0, tax: unknown = 0) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new Error('INVALID_LINES');
  const lines = items.map(item => ({ quantity: confirmedQuantity(item.quantity), unitCents: usdCents(item.unitPrice, 100000, true) }));
  const lineCents = lines.map(line => line.quantity * line.unitCents);
  const subtotalCents = lineCents.reduce((sum, amount) => sum + amount, 0);
  const shippingCents = usdCents(shipping), discountCents = usdCents(discount), taxCents = usdCents(tax);
  if (discountCents > subtotalCents) throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');
  const totalCents = subtotalCents - discountCents + shippingCents + taxCents;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 100000000) throw new Error('INVALID_TOTAL');
  return { lines, lineCents, subtotalCents, shippingCents, discountCents, taxCents, totalCents,
    subtotal: subtotalCents / 100, shipping: shippingCents / 100, discount: discountCents / 100, tax: taxCents / 100, total: totalCents / 100 };
}
