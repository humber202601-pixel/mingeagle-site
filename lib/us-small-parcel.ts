// Approved single-item US air small-parcel rates, shared with the GitHub Pages
// site as first-party source JSON. No assumptions about multi-item parcel consolidation.
import rates from '../public/us-single-parcel-shipping.json';
import fulfillment from '../public/retail-fulfillment-policy.json';
import {SKU_USD} from './retail-reference';
const currency='USD';
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
