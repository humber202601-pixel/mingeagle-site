import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));};
const routes={
 inquiry:(await load('functions/api/inquiries.ts')).onRequestPost,
 create:(await load('functions/api/admin/quotes.ts')).onRequestPost,
 edit:(await load('functions/api/admin/quote-edit.ts')).onRequestPost,
 approve:(await load('functions/api/admin/quote-retail-approval.ts')).onRequestPost,
 release:(await load('functions/api/admin/quote-send.ts')).onRequestPost,
 view:(await load('functions/quote/[token].ts')).onRequestGet,
};
const auth=(await load('functions/api/admin/_middleware.ts')).onRequest;
const root=(await load('functions/_middleware.ts')).onRequest;
const sqlite=new DatabaseSync(':memory:');
for(const file of ['0001_core.sql','0002_quote_public_links.sql','0003_airwallex_payment_sessions.sql','0004_shipping_rates.sql','0005_supplier_purchase_terms.sql','0006_quote_retail_approvals.sql','0016_b2b_tax_basis.sql'])sqlite.exec(readFileSync('migrations/'+file,'utf8'));
const database={
 prepare(sql){const statement={sql,args:[],bind(...args){statement.args=args;return statement;},async first(){return sqlite.prepare(sql).get(...statement.args)||null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...statement.args)};},async run(){const result=sqlite.prepare(sql).run(...statement.args);return {success:true,meta:{changes:Number(result.changes)}};}};return statement;},
 async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
};
const env={MINGEAGLE_DB:database,ADMIN_ACCESS_KEY:'test-only-local-key',TEST_ENVIRONMENT:'preview',OUTBOUND_EMAIL_DISABLED:'true'};
const originalFetch=globalThis.fetch;let externalCalls=0;
globalThis.fetch=async()=>{externalCalls++;throw Error('No external email or customer calls are allowed in quote tests');};
const call=async(name,path,input,authorized=true)=>{
 const request=new Request('https://quote-test.example'+path,{method:'POST',headers:{'content-type':'application/json',origin:'https://www.mingeagle.com',...(authorized?{'x-admin-key':env.ADMIN_ACCESS_KEY}:{})},body:JSON.stringify(input)});
 const handler=()=>routes[name]({request,env,params:{}});
 const response=await root({request,env,next:()=>path.startsWith('/api/admin/')?auth({request,env,next:handler}):handler()});
 return {status:response.status,body:await response.json()};
};
const query=sql=>sqlite.prepare(sql).get();
try{
 const reference='ME-TEST-QUOTE-20261012';
 const inquiry=await call('inquiry','/api/inquiries',{originalReference:reference,firstName:'Synthetic',lastName:'Quote Test',email:'quote-test@example.invalid',country:'US',postalCode:'75201',estimatedQuantity:'100',products:['Flocked Silent Basketball Set'],privacyAck:true,message:'Synthetic isolated test inquiry. Exact requested units: 100'});
 assert.equal(inquiry.status,200,JSON.stringify(inquiry));assert.equal(inquiry.body.reference,reference);
 assert.equal(query('SELECT count(*) AS n FROM inquiries').n,1);assert.equal(externalCalls,0);
 const input={inquiryReference:reference,description:'Flocked Silent Basketball Set | No. 5 | Blue',quantity:'100',unitPrice:'8.03',shipping:'19.90',taxUSD:'0',taxBasis:'Synthetic test: no tax collection in isolated test',discount:'0',paymentTerms:'Test terms',shippingTerms:'Test freight'};
 let response=await call('create','/api/admin/quotes',input,false);assert.equal(response.status,401);
 for(const patch of [{unitPrice:'8.031'},{quantity:'50–100'},{shipping:''},{discount:'1000'},{unitPrice:true}]){response=await call('create','/api/admin/quotes',{...input,...patch});assert.equal(response.status,400);assert.equal(query('SELECT count(*) AS n FROM quotes').n,0);}
 response=await call('create','/api/admin/quotes',input);assert.equal(response.status,201,JSON.stringify(response));assert.equal(response.body.total,822.9);
 const quoteId=response.body.quoteId;
 let quote=query('SELECT * FROM quotes');let item=query('SELECT * FROM quote_items');
 // Normal quote approval must not also count as supplier cost verification.
 let unverified=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(unverified.status,409,'Missing supplier cost needs separate staff acknowledgement');
 assert.equal(unverified.body.code,'SUPPLIER_COST_ACK_REQUIRED');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0,'No quote token from unacknowledged cost');
 assert.equal(externalCalls,0,'Cost acknowledgement rejection may not contact Gmail');
 // Supplier cost data here is SYNTHETIC and exists only in a :memory: test DB.
 sqlite.prepare(`INSERT INTO supplier_purchase_terms
   (sku,supplier_name,moq,case_pack,tiers_json,source_note,effective_on,expires_on,status,version)
   VALUES ('P1-S5','TEST ONLY',1,1,?,'Synthetic supplier quote for automated tests','2020-01-01','2099-12-31','APPROVED',1)`)
   .run(JSON.stringify([{minimumQuantity:1,purchaseCents:700}]));
 assert.equal(quote.status,'DRAFT');assert.equal(item.line_total,803);assert.match(query('SELECT source_url FROM quote_retail_approvals').source_url,/www\.mingeagle\.com\/retail-reference-prices\.json\?v=[a-f0-9]{64}$/);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false});assert.equal(response.status,409,'Draft release requires explicit staff approval');
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:true,approved:true});assert.equal(response.status,403,'Preview cannot send customer email');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 sqlite.prepare("UPDATE quotes SET payment_terms='Payment terms to be confirmed before sending.' WHERE id=?").run(quoteId);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'Unconfirmed payment terms cannot publish a secure customer quote link');
 assert.equal(response.body.code,'QUOTE_TERMS_NOT_READY');
 assert(response.body.issues.includes('PAYMENT_TERMS_UNCONFIRMED'));
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 sqlite.prepare("UPDATE quotes SET payment_terms='Bank transfer before production',shipping_terms='Shipping terms to be confirmed before sending.' WHERE id=?").run(quoteId);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'Unconfirmed freight terms cannot publish a customer quote link');
 assert(response.body.issues.includes('SHIPPING_TERMS_UNCONFIRMED'));
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 sqlite.prepare("UPDATE quotes SET shipping_terms='Sea freight DDP to destination subject to confirmed timeline',valid_until='2020-01-01 00:00:00' WHERE id=?").run(quoteId);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'Expired quote cannot be sent or linked');
 assert(response.body.issues.includes('QUOTE_EXPIRED'));
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 sqlite.prepare("UPDATE quotes SET valid_until='2099-12-31 00:00:00' WHERE id=?").run(quoteId);
 const edit={quoteId,items:[{id:item.id,description:item.description,quantity:3,unitPrice:'8.07'}],shipping:'19.90',taxUSD:'1.10',taxBasis:'Synthetic test: explicit tax amount',discount:'0.29',validUntil:'2026-12-31',paymentTerms:'Test terms',shippingTerms:'Test freight'};
 response=await call('edit','/api/admin/quote-edit',{...edit,items:[{...edit.items[0],quantity:3.5}]});assert.equal(response.status,400);assert.equal(query('SELECT quantity FROM quote_items').quantity,100);
 response=await call('edit','/api/admin/quote-edit',{...edit,items:[{...edit.items[0],unitPrice:'6.99'}]});
 assert.equal(response.status,409,'Draft edits at/below approved procurement floor blocked');
 assert.equal(query('SELECT unit_price FROM quote_items').unit_price,8.03,'No changes saved on floor rejection');
 response=await call('edit','/api/admin/quote-edit',{...edit,discount:'3.22'});
 assert.equal(response.status,409,'Quote-level discounts cannot undercut supplier floor');
 assert.equal(query('SELECT discount FROM quotes').discount,0,'Discount failure cannot mutate quote');
 response=await call('edit','/api/admin/quote-edit',{...edit,items:[{...edit.items[0],description:'Generic unclassified item'}]});
 assert.equal(response.status,409,'Editing the SKU text away cannot bypass known procurement source');
 assert.equal(query('SELECT description FROM quote_items').description,item.description);
 sqlite.prepare('UPDATE quotes SET tax=1.1 WHERE id=?').run(quoteId);
 response=await call('edit','/api/admin/quote-edit',edit);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.quote.total,44.92,'Edit preserves existing tax and uses exact cents');
 assert.equal(query('SELECT count(*) AS n FROM quote_retail_approvals').n,0,'A change invalidates the old approval permanently');
 response=await call('approve','/api/admin/quote-retail-approval',{quoteId,itemId:item.id,retailUSD:11.9,sourceUrl:'https://www.mingeagle.com/retail-reference-prices.json',confirmed:true});assert.equal(response.status,200,JSON.stringify(response));
 // A vendor updates the approved cost after editing: final release MUST
 // recheck the current source, before creating any customer link or email.
 sqlite.prepare("UPDATE supplier_purchase_terms SET tiers_json=?,version=2 WHERE sku='P1-S5'")
   .run(JSON.stringify([{minimumQuantity:1,purchaseCents:900}]));
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'Final approval must recheck changed supplier purchase floor');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0,'Risky quote must not leak to public link');
 assert.equal(query('SELECT status FROM quotes').status,'DRAFT');
 assert.equal(externalCalls,0,'Rejection may not send emails');
 sqlite.prepare("UPDATE supplier_purchase_terms SET tiers_json=?,version=3 WHERE sku='P1-S5'")
   .run(JSON.stringify([{minimumQuantity:1,purchaseCents:700}]));
 sqlite.prepare("UPDATE quotes SET notes=? WHERE id=?").run(
   'Wholesale draft. Internal purchase source review: procurement cost must stay private.',quoteId);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.emailed,false);
 assert.equal(query("SELECT count(*) AS n FROM activities WHERE activity_type='QUOTE_APPROVED'").n,1);
 const token=response.body.publicPath.split('/').pop();
 const page=await routes.view({request:new Request('https://quote-test.example'+response.body.publicPath),env,params:{token}});
 assert.equal(page.status,200);const html=await page.text();
 assert(!html.includes('Internal purchase source review'),'Internal wholesale draft notes MUST be hidden from customer');
 assert.match(html,/Save USD 3\.83/);assert.match(html,/Product savings USD 11\.49/);assert.match(html,/44\.92/);
 response=await call('edit','/api/admin/quote-edit',edit);assert.equal(response.status,409,'Released quotations are locked');
 const blocked=await root({request:new Request('https://quote-test.example/api/admin/email-queue',{method:'POST'}),env,next:()=>{throw Error('Preview must block this mutation');}});assert.equal(blocked.status,403);
 assert.equal(externalCalls,0);assert.equal(query("SELECT count(*) AS n FROM messages WHERE direction='OUTBOUND'").n,0);
 // An approved cost can later be disabled; every repeated public link
 // must require the separate manual confirmation at release time.
 sqlite.prepare("UPDATE supplier_purchase_terms SET status='DISABLED' WHERE sku='P1-S5'").run();
 unverified=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(unverified.status,409,'Released quote with unverified source requires new attestation');
 assert.equal(unverified.body.code,'SUPPLIER_COST_ACK_REQUIRED');
 const acknowledged=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,supplierCostAcknowledged:true});
 assert.equal(acknowledged.status,200,'Extra supplier confirmation permits staff-reviewed noncatalog quote');
 const audit=sqlite.prepare("SELECT metadata_json FROM activities WHERE activity_type='QUOTE_LINK_GENERATED' ORDER BY created_at DESC, rowid DESC LIMIT 1").get();
 assert.equal(JSON.parse(audit.metadata_json).supplierCostManuallyAcknowledged,true,'Staff acknowledgement must be stored in quote activity metadata');
 assert.equal(JSON.parse(audit.metadata_json).unverifiedSupplierLines,1);
 assert.equal(externalCalls,0);
 console.log('PASS: real SQL inquiry → authenticated draft → decimal totals → edit/invalidation → staff approval → secure customer quote, no external sends.');
}finally{globalThis.fetch=originalFetch;sqlite.close();}
