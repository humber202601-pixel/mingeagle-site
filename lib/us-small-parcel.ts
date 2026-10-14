// Approved single-item US air small-parcel rates, shared with the GitHub Pages
// site as first-party source JSON. Multi-unit checkout uses one unit per parcel,
// never an inferred consolidated-parcel tariff.
import rates from '../public/us-single-parcel-shipping.json';
import fulfillment from '../public/retail-fulfillment-policy.json';
import {SKU_USD} from './retail-reference';
const currency='USD';
export const MAX_US_PARCEL_CHECKOUT_UNITS=rates.retailCheckoutParcels.maxUnits;
export const US_DDP_CHECKOUT_SKUS=rates.confirmedDdpSingleItems.map(x=>x.sku);
export const US_SMALL_PARCEL_RATES=Object.fromEntries(
 Object.entries(rates.productSizeShippingUSD).flatMap(([product,sizes])=>
  Object.entries(sizes).map(([size,shipping])=>[
   product.toUpperCase()+'-S'+size,shipping
  ])
 )) as Record<string,number>;
export function oneItemUsAirParcel(sku:string,country:string,method:string,quantity:number){
 if(country!=='US'||method!=='air'||quantity!==1)return null;
 if(!Object.prototype.hasOwnProperty.call(US_SMALL_PARCEL_RATES,sku)||
    !Object.prototype.hasOwnProperty.call(SKU_USD,sku))return null;
 const freight=US_SMALL_PARCEL_RATES[sku],product=SKU_USD[sku];
 if(!Number.isFinite(freight)||freight<=0||!Number.isFinite(product)||product<=0)
  throw Error('Unverified single-item US rate');
 const ddpConfirmed=rates.confirmedDdpSingleItems.some(ddp=>
  sku===ddp.sku&&freight===ddp.shippingUSD&&country===ddp.destination&&
  ddp.origin==='CN'&&ddp.scope==='one-unit-only'&&
  ddp.includes.includes('import_customs_clearance')&&ddp.includes.includes('applicable_import_duties'));
 return {sku,country,method,quantity,productUSD:product,
  availability:fulfillment.availability,dispatchWithinDays:fulfillment.dispatchWithinDays,
  dispatchDayType:fulfillment.dispatchDayType,dispatchBasis:fulfillment.dispatchBasis,
  importCustomsClearanceIncluded:ddpConfirmed,importDutiesIncluded:ddpConfirmed,
  ddpConfirmed,usSalesTaxNotIncluded:true,
  shippingUSD:freight,totalBeforeTaxesUSD:Math.round((product+freight)*100)/100,
  currency,deliveryEstimateDaysMin:rates.estimatedDeliveryDays.min,
  deliveryEstimateDaysMax:rates.estimatedDeliveryDays.max,
  deliveryEstimateBasis:rates.estimatedDeliveryDays.basis,
  quoteSource:'APPROVED_US_SINGLE_ITEM_AIR_SMALL_PARCEL',
  paymentEnabled:false,taxesNotIncluded:true,estimateOnly:true};
}

export function separateUnitUsAirParcels(lines:{sku:string;quantity:number}[],country:string,method:string){
 if(country!=='US'||method!=='air'||!Array.isArray(lines)||!lines.length||lines.length>MAX_US_PARCEL_CHECKOUT_UNITS)return null;
 let quantity=0,goodsCents=0,shippingCents=0;
 const priced=[];
 for(const line of lines){
  if(!line||!Number.isSafeInteger(line.quantity)||line.quantity<1)return null;
  quantity+=line.quantity;
  if(quantity>MAX_US_PARCEL_CHECKOUT_UNITS)return null;
  const parcel=oneItemUsAirParcel(line.sku,country,method,1);
  if(!parcel?.ddpConfirmed)return null;
  const unitCents=Math.round(parcel.productUSD*100),freightCents=Math.round(parcel.shippingUSD*100);
  goodsCents+=unitCents*line.quantity;shippingCents+=freightCents*line.quantity;
  priced.push({sku:line.sku,quantity:line.quantity,unitPriceUSD:unitCents/100,
   lineTotalUSD:unitCents*line.quantity/100,unitShippingUSD:freightCents/100,
   lineShippingUSD:freightCents*line.quantity/100});
 }
 return {country,method,quantity,lines:priced,productsUSD:goodsCents/100,
  shippingUSD:shippingCents/100,totalBeforeTaxesUSD:(goodsCents+shippingCents)/100,
  currency,parcelCount:quantity,unitsPerParcel:1,shippingPlan:'ONE_UNIT_PER_PARCEL',
  ddpConfirmed:true,importCustomsClearanceIncluded:true,importDutiesIncluded:true,
  usSalesTaxNotIncluded:true,taxesNotIncluded:true,paymentEnabled:false,estimateOnly:true,
  availability:fulfillment.availability,dispatchWithinDays:fulfillment.dispatchWithinDays,
  dispatchDayType:fulfillment.dispatchDayType,dispatchBasis:fulfillment.dispatchBasis,
  deliveryEstimateDaysMin:rates.estimatedDeliveryDays.min,
  deliveryEstimateDaysMax:rates.estimatedDeliveryDays.max,
  deliveryEstimateBasis:rates.estimatedDeliveryDays.basis,
  quoteSource:'CONFIRMED_US_SEPARATE_UNIT_AIR_PARCELS'};
}
