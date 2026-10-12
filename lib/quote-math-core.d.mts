export type MoneyInput = string | number;
export type Comparison = {
  currency: 'USD'; quantity: number; retailUnitPrice: string; wholesaleUnitPrice: string;
  retailTotal: string; wholesaleTotal: string; savingsPerUnit: string; savingsTotal: string;
  discountPercent: number; shippingAndTaxIncluded: false; approved: false;
};
export function cents(value: unknown): number;
export function money(value: number): string;
export function calculate(input: { quantity: unknown; retailUnitPrice: MoneyInput; wholesaleUnitPrice: MoneyInput }): Comparison;
export function calculateFromCatalog(catalog: unknown, input: { productId: string; size: string; quantity: unknown; wholesaleUnitPrice: MoneyInput }): Comparison & { productId: string; size: string };
export function calculateOrder(catalog: unknown, lines: Array<{ productId: string; size: string; quantity: unknown; wholesaleUnitPrice: MoneyInput }>): { currency: 'USD'; quantity: number; items: Comparison[]; retailTotal: string; wholesaleTotal: string; savingsTotal: string; discountPercent: number; shippingAndTaxIncluded: false; approved: false };
