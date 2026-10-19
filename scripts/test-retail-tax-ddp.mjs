import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
const source=await build({entryPoints:['lib/retail-tax-policy.ts'],bundle:true,write:false,platform:'node',format:'esm',target:'es2022',logLevel:'silent'});
const {noSalesTaxCollectionRequired,reviewedZeroTaxStates}=await import('data:text/javascript;base64,'+Buffer.from(source.outputFiles[0].text).toString('base64'));
const time=new Date('2026-10-14T12:00:00Z');
const env={
 RETAIL_US_TAX_POLICY_JSON:JSON.stringify({
  reviewed_on:'2026-10-13',review_reference:'Synthetic CPA review for test purposes only',
  states:{KY:'NO_COLLECTION_REQUIRED',NY:'COLLECT_SALES_TAX',CA:'UNREVIEWED'}
 })
};
assert.equal(noSalesTaxCollectionRequired(env,'KY',time),true);
assert.equal(noSalesTaxCollectionRequired(env,'NY',time),false);
assert.equal(noSalesTaxCollectionRequired(env,'CA',time),false);
assert.equal(noSalesTaxCollectionRequired(env,'ZZ',time),false);
assert.deepEqual([...reviewedZeroTaxStates(env,time)],['KY']);
assert.equal(noSalesTaxCollectionRequired({RETAIL_US_TAX_POLICY_JSON:''},'KY',time),false);
assert.equal(noSalesTaxCollectionRequired({RETAIL_US_TAX_POLICY_JSON:'bad'},'KY',time),false);
const stale={RETAIL_US_TAX_POLICY_JSON:JSON.stringify({
 reviewed_on:'2026-08-01',review_reference:'stale CPA review older than a month',states:{KY:'NO_COLLECTION_REQUIRED'}
})};
assert.equal(noSalesTaxCollectionRequired(stale,'KY',time),false);
assert.equal(noSalesTaxCollectionRequired({...env,RETAIL_US_TAX_POLICY_JSON:JSON.stringify({reviewed_on:'2026-11-01',review_reference:'future review unacceptable',states:{KY:'NO_COLLECTION_REQUIRED'}})},'KY',time),false);
const invalid={RETAIL_US_TAX_POLICY_JSON:JSON.stringify({reviewed_on:'2026-10-13',states:{KY:'NO_COLLECTION_REQUIRED'}})};
assert.equal(noSalesTaxCollectionRequired(invalid,'KY',time),false);
const government={RETAIL_US_TAX_POLICY_JSON:JSON.stringify({reviewed_on:'2026-08-01',
 review_reference:'Official OR/NH general sales/use tax guidance',basis:'NO_GENERAL_SALES_USE_TAX',
 states:{OR:'NO_COLLECTION_REQUIRED',NH:'NO_COLLECTION_REQUIRED',CA:'NO_COLLECTION_REQUIRED',KY:'NO_COLLECTION_REQUIRED'}})};
assert.deepEqual([...reviewedZeroTaxStates(government,time)].sort(),['NH','OR'],
 'No-general-tax guidance must never approve an ordinary sales-tax state');
assert.equal(noSalesTaxCollectionRequired(government,'OR',new Date('2027-08-02')),false,'Government guidance still has a bounded annual review');
const reference=JSON.parse(readFileSync('public/us-single-parcel-shipping.json','utf8'));
assert.deepEqual(reference.confirmedDdpSingleItems.map(x=>[x.sku,x.shippingUSD]).sort(),
 [['P1-S3',11.5],['P1-S7',14]].sort());
for(const confirmed of reference.confirmedDdpSingleItems){
 assert.equal(confirmed.scope,'one-unit-only');
 assert.equal(confirmed.destination,'US');
 assert(confirmed.includes.includes('applicable_import_duties'));
 assert(confirmed.excludes.includes('US_state_local_sales_tax'));
}
console.log('PASS: tax policy remains state-specific and review-gated; only P1-S3/P1-S7 one-unit customs and import-duty approvals are scoped.');
