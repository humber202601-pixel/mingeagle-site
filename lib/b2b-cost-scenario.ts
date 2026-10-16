// Internal-only scenario calculator. This is NOT approved procurement costing,
// accounting profit, a payment quote, or evidence of actual freight/tax/fees.
export const COST_FIELDS=[
 'factoryUSD','freightUSD','dutiesUSD','packingUSD','stripeFeesUSD','otherUSD'
] as const;
export type ScenarioCostKey=typeof COST_FIELDS[number];
export type ScenarioInputs=Record<ScenarioCostKey,string>;
export type QuoteScenarioTotals={
 netMerchandiseUSD:number;
 shippingCollectedUSD:number;
 salesTaxCollectedUSD:number;
 totalQuotedUSD:number;
};
const cents=(value:unknown):number|null=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)return null;
 const c=Math.round(value*100);
 return Number.isSafeInteger(c)&&Math.abs(value*100-c)<0.00001?c:null;
};
const enteredCents=(value:string):number|null=>{
 if(typeof value!=='string'||!/^(?:0|[1-9]\\d{0,6})(?:\\.\\d{1,2})?$/.test(value.trim()))return null;
 return cents(Number(value.trim()));
};
export type ScenarioResult={
 complete:boolean;missing:ScenarioCostKey[];invalid:ScenarioCostKey[];
 revenueExTaxUSD:number|null;costTotalUSD:number|null;
 estimatedDifferenceUSD:number|null;estimatedDifferencePct:number|null;
 uncoveredCosts:'scenarioOnly';
};
export function calculateB2BScenario(quote:QuoteScenarioTotals,input:ScenarioInputs):ScenarioResult{
 const empty:ScenarioResult={complete:false,missing:[],invalid:[],revenueExTaxUSD:null,
  costTotalUSD:null,estimatedDifferenceUSD:null,estimatedDifferencePct:null,uncoveredCosts:'scenarioOnly'};
 if(!quote||typeof quote!=='object')return empty;
 const merchandise=cents(quote.netMerchandiseUSD),shipping=cents(quote.shippingCollectedUSD),
  tax=cents(quote.salesTaxCollectedUSD),grand=cents(quote.totalQuotedUSD);
 if(merchandise===null||shipping===null||tax===null||grand===null||
  merchandise+shipping+tax!==grand||merchandise+shipping<=0)return empty;
 const values:Cents[]=COST_FIELDS.map(key=>{
  const v=input[key];
  if(v===undefined||v.trim()===''){empty.missing.push(key);return null}
  const x=enteredCents(v);
  if(x===null){empty.invalid.push(key);return null}
  return x;
 });
 const revenue=merchandise+shipping;
 empty.revenueExTaxUSD=revenue/100;
 if(empty.missing.length||empty.invalid.length)return empty;
 const cost=values.reduce((sum,n)=>sum+Number(n),0);
 if(!Number.isSafeInteger(cost))return empty;
 const difference=revenue-cost;
 return {complete:true,missing:[],invalid:[],revenueExTaxUSD:revenue/100,
  costTotalUSD:cost/100,estimatedDifferenceUSD:difference/100,
  estimatedDifferencePct:Number((difference/revenue*100).toFixed(2)),
  uncoveredCosts:'scenarioOnly'};
}
type Cents=number|null;
