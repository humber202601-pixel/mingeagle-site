import {SKU_LABELS} from './supplier-pricing';

// Internal notes transcribed from the owner's 2026-10-14 figures.
// NOT supplier-issued quotations, valid approved costs, MOQ, purchase
// terms, landed costs, gross profit, or evidence of current availability.
export const OWNER_REPORTED_FACTORY_COSTS_USD:Readonly<Record<string,number>>=Object.freeze({
 'P1-S7':21,
 'P2-S7':23,
 'P3-S7':32,
});
export const OWNER_COST_NOTE_DATE='2026-10-14';

const COLUMNS=[
 'SKU','Product_Model','Owner_Reported_Factory_USD_UNVERIFIED',
 'Supplier_Confirmed_Unit_Cost_USD','Supplier_Name','Supplier_SKU',
 'MOQ_Units','Units_Per_Carton','Quotation_Date_UTC','Effective_On_UTC',
 'Expires_On_UTC','Specifications_Color','Sea_Freight_DDP_USD_Per_Unit',
 'Customs_Duties_USD_Per_Unit','Additional_Packing_Insurance_USD_Per_Unit',
 'Supplier_Quote_Reference','Document_Reviewed_By','Internal_Approval_Status'
] as const;

// Output intended to be filled by staff in Excel, *not* imported into approved D1
// purchasing terms automatically. Missing evidence fields deliberately stay blank.
export function supplierCostIntakeRows():string[][]{
 return Object.entries(SKU_LABELS).map(([sku,label])=>[
  sku,label,
  OWNER_REPORTED_FACTORY_COSTS_USD[sku]===undefined?'':OWNER_REPORTED_FACTORY_COSTS_USD[sku].toFixed(2),
  '','','','','','','','','','','','','','',''
 ]);
}
const quote=(value:string)=>'"'+value.replace(/"/g,'""')+'"';
export function supplierCostIntakeCsv():string{
 return [COLUMNS,...supplierCostIntakeRows()].map(line=>line.map(quote).join(',')).join('\r\n')+'\r\n';
}
