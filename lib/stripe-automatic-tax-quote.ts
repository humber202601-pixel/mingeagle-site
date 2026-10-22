export const STRIPE_AUTOMATIC_TAX_BASIS = 'STRIPE_AUTOMATIC_AT_CHECKOUT';

export const STRIPE_AUTOMATIC_TAX_NOTE =
  'STRIPE_AUTOMATIC_TAX_PENDING: Final US sales tax and total are calculated by Stripe at secure checkout using the buyer-confirmed delivery address. Any applicable tax is added before payment.';

/**
 * This marker means the quote total is a pre-tax amount and the final
 * destination tax must be calculated by Stripe Checkout. It is not a zero-tax
 * exemption or a statement that no registration is required.
 */
export function usesStripeAutomaticTaxQuote(basis: unknown): boolean {
  return typeof basis === 'string' &&
    basis.trim().toUpperCase().startsWith(STRIPE_AUTOMATIC_TAX_BASIS);
}
