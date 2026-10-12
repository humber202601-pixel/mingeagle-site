import catalog from '../public/retail-reference-prices.json';
import { RETAIL_CATALOG_VERSION } from './retail-catalog-version';
export { RETAIL_CATALOG_VERSION };
export const RETAIL_SOURCE_URL = 'https://www.mingeagle.com/retail-reference-prices.json?v=' + RETAIL_CATALOG_VERSION;
export const PRODUCT_NAMES = ['Flocked Silent Basketball Set', 'Fabric-Cover Silent Basketball Set', 'Weighted Flocked Silent Basketball', 'Flocked Silent Soccer Ball'];
// The published catalog is the only price source. Colors do not change prices.
export const RETAIL_USD: Record<string, Record<string, number>> = Object.fromEntries(PRODUCT_NAMES.map((name, index) => [name, catalog.products[('p' + (index + 1)) as keyof typeof catalog.products]]));
export const SKU_USD: Record<string, number> = Object.fromEntries(Object.entries(catalog.products).flatMap(([id, sizes]) => Object.entries(sizes).map(([size, price]) => [id.toUpperCase() + '-S' + size, price])));
export function retailReference(description:unknown):number|null{
 const m=/^(.+?) \| No\. (3|4|5|6|7) \| (.+)$/.exec(String(description||'').trim());
 if(!m)return null;
 const price=RETAIL_USD[m[1]]?.[m[2]];
 return typeof price==='number'?price:null;
}
