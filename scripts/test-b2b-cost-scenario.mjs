import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'b2b-scenario-'));
try{
 const file=join(dir,'scenario.mjs');
 await build({entryPoints:['lib/b2b-cost-scenario.ts'],bundle:true,
  outfile:file,platform:'node',format:'esm',logLevel:'silent'});
 const {COST_FIELDS,calculateB2BScenario}=await import(pathToFileURL(file));
 const quote={netMerchandiseUSD:150,shippingCollectedUSD:30,salesTaxCollectedUSD:5,totalQuotedUSD:185};
 const values={factoryUSD:'100.00',freightUSD:'25',dutiesUSD:'10',packingUSD:'5',
  stripeFeesUSD:'7.00',otherUSD:'3'};
 let v=calculateB2BScenario(quote,values);
 assert.equal(COST_FIELDS.length,6);
 assert.equal(v.complete,true);
 assert.equal(v.revenueExTaxUSD,180,'Collected sales tax is liability, not revenue');
 assert.equal(v.costTotalUSD,150);
 assert.equal(v.estimatedDifferenceUSD,30);
 assert.equal(v.estimatedDifferencePct,16.67);
 assert.equal(v.uncoveredCosts,'scenarioOnly');
 v=calculateB2BScenario({...quote,salesTaxCollectedUSD:50,totalQuotedUSD:230},values);
 assert.equal(v.estimatedDifferenceUSD,30,'Tax changes cannot inflate earnings');
 v=calculateB2BScenario({...quote,shippingCollectedUSD:0,totalQuotedUSD:155},values);
 assert.equal(v.estimatedDifferenceUSD,0,'Shipping collected can offset actual delivery cost only once');
 v=calculateB2BScenario(quote,{...values,factoryUSD:'200'});
 assert.equal(v.estimatedDifferenceUSD,-70,'Negative contribution displays loss risk');
 v=calculateB2BScenario(quote,{...values,freightUSD:''});
 assert.equal(v.complete,false,'Never turn unknown freight into free freight');
 assert.deepEqual(v.missing,['freightUSD']);
 assert.equal(v.estimatedDifferenceUSD,null);
 v=calculateB2BScenario(quote,{...values,stripeFeesUSD:''});
 assert.equal(v.complete,false,'Never default Stripe fees to zero');
 v=calculateB2BScenario(quote,{...values,dutiesUSD:'0'});
 assert.equal(v.complete,true,'An explicitly entered zero is distinct from an unknown value');
 for(const invalid of ['-1','1.234','NaN','Infinity','1e3','$5','0.001']){
  v=calculateB2BScenario(quote,{...values,dutiesUSD:invalid});
  assert.equal(v.complete,false,'Reject invalid amount '+invalid);
  assert(v.invalid.includes('dutiesUSD'));
 }
 v=calculateB2BScenario({...quote,totalQuotedUSD:184.99},values);
 assert.equal(v.complete,false,'Do not calculate from unreconciled quote fields');
 assert.equal(v.estimatedDifferenceUSD,null);
 v=calculateB2BScenario({...quote,salesTaxCollectedUSD:0,totalQuotedUSD:185},values);
 assert.equal(v.complete,false);
 v=calculateB2BScenario({...quote,netMerchandiseUSD:0,shippingCollectedUSD:0,
  salesTaxCollectedUSD:0,totalQuotedUSD:0},values);
 assert.equal(v.complete,false);
 const ui=readFileSync('src/B2BCostScenario.tsx','utf8');
 const quoteBuilder=readFileSync('src/QuoteBuilder.tsx','utf8');
 assert(ui.includes('calculateB2BScenario')&&ui.includes('未核实请留空'));
 assert(ui.includes("cache:'no-store'")&&ui.includes('quote-procurement-preflight'),
  'Cost scenario must use an authenticated read-only quotation preflight');
 assert(!/fetch\([^)]*method:\s*'POST'/.test(ui),'Scenario UI may not POST price or purchase terms');
 assert(quoteBuilder.includes('内部成本试算')&&quoteBuilder.includes('<B2BCostScenario'),
  'Quote list must expose scenario review separately from quote release');
 console.log('PASS: B2B manual landed-cost scenario excludes tax, requires all six costs, guards invalid totals, and never approves a quote.');
}finally{rmSync(dir,{recursive:true,force:true})}
