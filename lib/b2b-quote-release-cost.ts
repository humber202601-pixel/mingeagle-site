import {calculateB2BScenario,COST_FIELDS,type QuoteScenarioTotals,type ScenarioInputs} from './b2b-cost-scenario';

/** One quote-specific human-attested sourcing review, never buyer-visible. */
export type WholesaleReleaseProof={quotedTotalUSD:number;quoteFingerprint:string;costs:ScenarioInputs;evidence:string};
export type WholesaleCostDecision=
 |{ok:true;record:{quotedTotalUSD:number;revenueExTaxUSD:number;documentedCostsUSD:number;scenarioDifferenceUSD:number;costs:ScenarioInputs;evidence:string}}
 |{ok:false;code:'LANDED_COST_PROOF_REQUIRED'|'LANDED_COST_BELOW_BASELINE'|'LANDED_COST_LOSS_RISK';error:string};

export function checkWholesaleReleaseProof(
 quote:QuoteScenarioTotals,proof:unknown,approvedFactoryCostFloorCents:number|null,expectedQuoteFingerprint:string
):WholesaleCostDecision{
 const fail=(code:'LANDED_COST_PROOF_REQUIRED'|'LANDED_COST_BELOW_BASELINE'|'LANDED_COST_LOSS_RISK',error:string):WholesaleCostDecision=>
  ({ok:false,code,error});
 if(!proof||typeof proof!=='object'||Array.isArray(proof))
  return fail('LANDED_COST_PROOF_REQUIRED','A wholesale quote requires six cost components and a dated supplier/freight source review before customer release.');
 const row=proof as Record<string,unknown>,note=typeof row.evidence==='string'?row.evidence.trim():'';
 // A changed SKU, variant, quantity, delivery charge or commercial/tax term
 // invalidates even a positive cost review for the same grand total.
 if(!/^[a-f0-9]{64}$/.test(expectedQuoteFingerprint)||row.quoteFingerprint!==expectedQuoteFingerprint)
  return fail('LANDED_COST_PROOF_REQUIRED','The quote changed since the cost review. Reopen the six-cost scenario for the current SKU, delivery and tax terms.');
 if(note.length<40||note.length>700||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(note)||
    typeof row.quotedTotalUSD!=='number'||
    !Number.isFinite(row.quotedTotalUSD)||
    Math.round(row.quotedTotalUSD*100)!==Math.round(quote.totalQuotedUSD*100))
  return fail('LANDED_COST_PROOF_REQUIRED','Current quote total and specific supplier, MOQ, packing, dated DDP freight/duties source (40–700 characters) must be confirmed.');
 if(!row.costs||typeof row.costs!=='object'||Array.isArray(row.costs))
  return fail('LANDED_COST_PROOF_REQUIRED','All six reviewed cost fields must be present.');
 const x=row.costs as Record<string,unknown>;
 if(COST_FIELDS.some(key=>typeof x[key]!=='string')||
   Number(x.factoryUSD)<=0||Number(x.stripeFeesUSD)<=0)
  return fail('LANDED_COST_PROOF_REQUIRED','Actual factory costs and Stripe fees must be greater than zero. Unknown costs may not be set to zero.');
 const costs=Object.fromEntries(COST_FIELDS.map(key=>[key,x[key]])) as ScenarioInputs;
 const scenario=calculateB2BScenario(quote,costs);
 if(!scenario.complete||scenario.missing.length||scenario.invalid.length||
  scenario.revenueExTaxUSD===null||scenario.costTotalUSD===null||scenario.estimatedDifferenceUSD===null)
  return fail('LANDED_COST_PROOF_REQUIRED','Each cost must be a complete USD value to the cent; blanks or invalid values are not approved.');
 if(approvedFactoryCostFloorCents!==null&&
   Math.round(Number(costs.factoryUSD)*100)<approvedFactoryCostFloorCents)
  return fail('LANDED_COST_BELOW_BASELINE','Entered factory amount is lower than the current approved SKU-size purchase cost floor.');
 if(scenario.estimatedDifferenceUSD<=0)
  return fail('LANDED_COST_LOSS_RISK','The current six-cost scenario has zero or negative contribution. Revise the quote before customer release.');
 return {ok:true,record:{
  quotedTotalUSD:quote.totalQuotedUSD,revenueExTaxUSD:scenario.revenueExTaxUSD,
  documentedCostsUSD:scenario.costTotalUSD,scenarioDifferenceUSD:scenario.estimatedDifferenceUSD,
  costs,evidence:note
 }};
}
