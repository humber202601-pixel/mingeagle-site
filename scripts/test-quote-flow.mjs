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
 preflight:(await load('functions/api/admin/quote-procurement-preflight.ts')).onRequestGet,
 view:(await load('functions/quote/[token].ts')).onRequestGet,
};
const auth=(await load('functions/api/admin/_middleware.ts')).onRequest;
const root=(await load('functions/_middleware.ts')).onRequest;
const sqlite=new DatabaseSync(':memory:');
for(const file of ['0001_core.sql','0002_quote_public_links.sql','0003_airwallex_payment_sessions.sql','0004_shipping_rates.sql','0005_supplier_purchase_terms.sql','0006_quote_retail_approvals.sql','0016_b2b_tax_basis.sql'])sqlite.exec(readFileSync('migrations/'+file,'utf8'));
let simulateBuyerAcceptBeforeReleaseBatch=false;
const database={
 prepare(sql){const statement={sql,args:[],bind(...args){statement.args=args;return statement;},async first(){return sqlite.prepare(sql).get(...statement.args)||null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...statement.args)};},async run(){const result=sqlite.prepare(sql).run(...statement.args);return {success:true,meta:{changes:Number(result.changes)}};}};return statement;},
 async batch(statements){
  if(simulateBuyerAcceptBeforeReleaseBatch&&statements.some(s=>s.sql.includes('UPDATE quotes SET status=CASE'))){
   simulateBuyerAcceptBeforeReleaseBatch=false;
   sqlite.prepare("UPDATE quotes SET status='CONVERTED' WHERE id=?").run(quoteId);
  }
  sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}
 }
};
const env={MINGEAGLE_DB:database,ADMIN_ACCESS_KEY:'test-only-local-key',TEST_ENVIRONMENT:'preview',OUTBOUND_EMAIL_DISABLED:'true',STRIPE_B2B_APPROVED_US_STATES:'TX,OR,NH'};
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
 // Server-side final quote publishing must never trust a mismatched stored
 // grand total, even if a preflight UI is bypassed.
 sqlite.prepare('UPDATE quotes SET total=total+1 WHERE id=?').run(quoteId);
 const badSum=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(badSum.status,409,'Mismatched quotation total cannot create a buyer link');
 assert.equal(badSum.body.code,'QUOTE_TOTALS_MISMATCH');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 assert.equal(externalCalls,0);
 sqlite.prepare('UPDATE quotes SET total=? WHERE id=?').run(quote.total,quoteId);
 sqlite.prepare('UPDATE quote_items SET line_total=line_total+0.01 WHERE quote_id=?').run(quoteId);
 const tamperedLine=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(tamperedLine.status,409,'Line-level tampering must fail even when total matches the quote');
 assert.equal(tamperedLine.body.code,'QUOTE_TOTALS_MISMATCH');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 sqlite.prepare('UPDATE quote_items SET line_total=? WHERE quote_id=?').run(item.line_total,quoteId);
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
 // Send-time payability review: the seller may not send a Stripe link
 // without an explicit state, tax amount, and an accountable tax basis.
 sqlite.prepare("UPDATE quotes SET payment_terms='Stripe card payment in full' WHERE id=?").run(quoteId);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'A Stripe quote without ship-to state cannot be released');
 assert.equal(response.body.code,'B2B_STRIPE_QUOTE_NOT_PAYABLE');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 sqlite.prepare("UPDATE quotes SET shipping_terms='Sea freight DDP to destination. Ship-to state: ZZ' WHERE id=?").run(quoteId);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'Invalid two-letter state must not release Stripe quotation');
 assert.equal(response.body.code,'B2B_STRIPE_QUOTE_NOT_PAYABLE');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 sqlite.prepare("UPDATE quotes SET shipping_terms='Sea freight DDP to destination. Ship-to state: CA' WHERE id=?").run(quoteId);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'State excluded from merchant B2B Stripe policy cannot be published');
 assert.equal(response.body.code,'B2B_DESTINATION_NOT_APPROVED');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0,
   'Unapproved delivery state must not publish any customer link');
 sqlite.prepare("UPDATE quotes SET shipping_terms='Sea freight DDP to destination. Ship-to state: TX' WHERE id=?").run(quoteId);
 sqlite.prepare("UPDATE quotes SET tax_basis=NULL WHERE id=?").run(quoteId);
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'Missing reviewed sales-tax basis must block card quote');
 assert.equal(response.body.code,'B2B_STRIPE_QUOTE_NOT_PAYABLE');
 sqlite.prepare("UPDATE quotes SET payment_terms='Bank transfer before production',shipping_terms='Sea freight DDP to destination subject to confirmed timeline',tax_basis='SYNTHETIC_TEST: reviewed tax record' WHERE id=?").run(quoteId);
 const blockedBank=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(blockedBank.status,409,'A bank-transfer-only wholesale quote must not create an unpayable customer link');
 assert.equal(blockedBank.body.code,'STRIPE_ONLY_QUOTE_TERMS');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0);
 const edit={quoteId,items:[{id:item.id,description:item.description,quantity:3,unitPrice:'8.07'}],shipping:'19.90',taxUSD:'1.10',taxBasis:'Synthetic test: explicit tax amount',discount:'0.29',validUntil:'2026-12-31',paymentTerms:'Full amount payable by secure Stripe card checkout',shippingTerms:'Sea freight DDP 25–30 days. Ship-to state: TX; customs and duties included'};
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
 // Real race: buyer accepts between seller's preflight and atomic release.
 simulateBuyerAcceptBeforeReleaseBatch=true;
 response=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(response.status,409,'Accepted quote cannot be republished after release preflight');
 assert.equal(response.body.code,'QUOTE_NO_LONGER_RELEASABLE');
 assert.equal(query('SELECT status FROM quotes').status,'CONVERTED');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,0,'No stale buyer link');
 assert.equal(query("SELECT count(*) AS n FROM activities WHERE activity_type='QUOTE_APPROVED'").n,0,'No stale seller approval audit');
 assert.equal(externalCalls,0,'No email on losing release');
 sqlite.prepare("UPDATE quotes SET status='DRAFT' WHERE id=?").run(quoteId);
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
 const basisMissing=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,supplierCostAcknowledged:true});
 assert.equal(basisMissing.status,409,'A staff checkbox without verified supplier evidence cannot release a quote');
 assert.equal(basisMissing.body.code,'SUPPLIER_REVIEW_BASIS_REQUIRED');
 const oldLinkCount=query('SELECT count(*) AS n FROM quote_public_links').n;
 assert.equal(externalCalls,0);
 const tooShort=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,supplierCostAcknowledged:true,supplierReviewBasis:'confirmed'});
 assert.equal(tooShort.status,409,'Short generic acknowledgements do not count as sourcing evidence');
 assert.equal(query('SELECT count(*) AS n FROM quote_public_links').n,oldLinkCount);
 const reviewNote='SYNTHETIC TEST ONLY: Factory offer reviewed for size, carton packing, MOQ and estimated DDP freight/duties; no live source verified.';
 const acknowledged=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,supplierCostAcknowledged:true,supplierReviewBasis:reviewNote});
 assert.equal(acknowledged.status,200,'Documented supplier source permits staff-reviewed noncatalog quote');
 const audit=sqlite.prepare("SELECT metadata_json FROM activities WHERE activity_type='QUOTE_LINK_GENERATED' ORDER BY created_at DESC, rowid DESC LIMIT 1").get();
 assert.equal(JSON.parse(audit.metadata_json).supplierCostManuallyAcknowledged,true,'Staff acknowledgement must be stored in quote activity metadata');
 assert.equal(JSON.parse(audit.metadata_json).unverifiedSupplierLines,1);
 assert.equal(JSON.parse(audit.metadata_json).supplierReviewBasis,reviewNote,'Source review evidence must persist in private quote activity');

 // Wholesale-only release now requires separate, itemized, positive
 // landed-cost evidence; retail/sample quotes remain unaffected.
 sqlite.prepare("UPDATE supplier_purchase_terms SET status='APPROVED' WHERE sku='P1-S5'").run();
 sqlite.prepare("UPDATE quote_items SET quantity=10,line_total=80.70 WHERE id=?").run(item.id);
 sqlite.prepare("UPDATE quotes SET subtotal=80.70,total=101.41 WHERE id=?").run(quoteId);
 const costEvidence='SYNTHETIC TEST ONLY: Supplier offer dated 2026-10-16 checked MOQ 1, carton 1 and quoted DDP freight/duties; mocked card fees are not live evidence.';
 const preflightResponse=await routes.preflight({request:new Request('https://quote-test.example/api/admin/quote-procurement-preflight?quoteId='+quoteId),env});
 assert.equal(preflightResponse.status,200);
 const freshSnapshot=(await preflightResponse.json()).quoteFingerprint;
 assert.match(freshSnapshot,/^[a-f0-9]{64}$/);
 const reviewed={quotedTotalUSD:101.41,quoteFingerprint:freshSnapshot,
  costs:{factoryUSD:'70',freightUSD:'15',dutiesUSD:'0',packingUSD:'1',stripeFeesUSD:'3',otherUSD:'0'},
  evidence:costEvidence};
 const linksBeforeCost=query('SELECT COUNT(*) n FROM quote_public_links').n;
 let costResult=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true});
 assert.equal(costResult.status,409,'10+ unit wholesale quotes must not release without full cost proof');
 assert.equal(costResult.body.code,'LANDED_COST_PROOF_REQUIRED');
 assert.equal(query('SELECT COUNT(*) n FROM quote_public_links').n,linksBeforeCost);
 const lowFactory={...reviewed,costs:{...reviewed.costs,factoryUSD:'60'}};
 costResult=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,landedReview:lowFactory});
 assert.equal(costResult.status,409,'Factory value below current approved purchase floor must block link');
 assert.equal(costResult.body.code,'LANDED_COST_BELOW_BASELINE');
 const loss={...reviewed,costs:{...reviewed.costs,freightUSD:'50'}};
 costResult=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,landedReview:loss});
 assert.equal(costResult.status,409,'All-inclusive negative scenario cannot be published');
 assert.equal(costResult.body.code,'LANDED_COST_LOSS_RISK');
 const missingFee={...reviewed,costs:{...reviewed.costs,stripeFeesUSD:''}};
 costResult=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,landedReview:missingFee});
 assert.equal(costResult.status,409);
 assert.equal(costResult.body.code,'LANDED_COST_PROOF_REQUIRED');
 assert.equal(query('SELECT COUNT(*) n FROM quote_public_links').n,linksBeforeCost,'No link on failed landed cost reviews');
 // Previously cost proof was bound only to the grand total. A different
 // color/variant or DDP contract at the same total must force a fresh review.
 sqlite.prepare('UPDATE quote_items SET description=? WHERE id=?')
  .run('Flocked Silent Basketball Set | No. 5 | Orange',item.id);
 costResult=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,landedReview:reviewed});
 assert.equal(costResult.status,409,'Old proof cannot cover a changed color at identical total');
 assert.equal(costResult.body.code,'LANDED_COST_PROOF_REQUIRED');
 assert.equal(query('SELECT COUNT(*) n FROM quote_public_links').n,linksBeforeCost);
 sqlite.prepare('UPDATE quote_items SET description=? WHERE id=?').run(item.description,item.id);
 const originalShipping=query('SELECT shipping_terms FROM quotes').shipping_terms;
 sqlite.prepare('UPDATE quotes SET shipping_terms=shipping_terms||? WHERE id=?')
  .run('; synthetic revised DDP port handling cost note',quoteId);
 costResult=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,landedReview:reviewed});
 assert.equal(costResult.status,409,'Old proof cannot cover new freight terms at identical total');
 assert.equal(costResult.body.code,'LANDED_COST_PROOF_REQUIRED');
 sqlite.prepare('UPDATE quotes SET shipping_terms=? WHERE id=?').run(originalShipping,quoteId);
 const absentFingerprint={...reviewed,quoteFingerprint:''};
 costResult=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,landedReview:absentFingerprint});
 assert.equal(costResult.status,409,'Browser-only synthetic proof without snapshot is not accepted');
 assert.equal(query('SELECT COUNT(*) n FROM quote_public_links').n,linksBeforeCost);
 costResult=await call('release','/api/admin/quote-send',{quoteId,sendEmail:false,approved:true,landedReview:reviewed});
 assert.equal(costResult.status,200,JSON.stringify(costResult));
 assert.equal(query("SELECT COUNT(*) n FROM activities WHERE activity_type='QUOTE_LANDED_COST_REVIEW'").n,1);
 const logged=JSON.parse(query("SELECT metadata_json FROM activities WHERE activity_type='QUOTE_LANDED_COST_REVIEW'").metadata_json);
 assert.equal(logged.evidence,costEvidence,'Supplier costing evidence must remain private audit metadata');
 assert.equal(logged.quoteFingerprint,freshSnapshot,'Private cost audit references reviewed exact quote snapshot');
 assert.equal(logged.scenarioDifferenceUSD,11.31,'No sales tax is counted as revenue');
 const wholesaleToken=costResult.body.publicPath.split('/').pop();
 const wholesaleHtml=await (await routes.view({request:new Request('https://quote-test.example'+costResult.body.publicPath),env,params:{token:wholesaleToken}})).text();
 assert(!wholesaleHtml.includes(costEvidence),'Buyer must never see internal cost proof');
 assert.equal(externalCalls,0);
 // Simulate real Gmail API boundary with synthetic email and in-memory SQL.
 // All network requests below are intercepted; NO external email is sent.
 sqlite.prepare("INSERT INTO contacts(id,full_name,email) VALUES('synthetic-email-contact','Synthetic Email','synthetic@example.invalid')").run();
 sqlite.prepare("UPDATE quotes SET contact_id='synthetic-email-contact' WHERE id=?").run(quoteId);
 const liveLikeEnv={...env,OUTBOUND_EMAIL_DISABLED:'false',GMAIL_CLIENT_ID:'synthetic-client',
  GMAIL_CLIENT_SECRET:'synthetic-secret',GMAIL_REFRESH_TOKEN:'synthetic-refresh',GMAIL_FROM:'synthetic@example.invalid'};
 const directSend=async()=>{
  const request=new Request('https://quote-test.example/api/admin/quote-send',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({quoteId,sendEmail:true,approved:true,landedReview:reviewed})
  });
  const reply=await routes.release({request,env:liveLikeEnv,params:{}});
  return {status:reply.status,body:await reply.json()};
 };
 let gmailAttempts=0,oauthAttempts=0;
 globalThis.fetch=async(url)=>{
  const endpoint=String(url);
  if(endpoint==='https://oauth2.googleapis.com/token'){
   oauthAttempts++;
   return Response.json({access_token:'synthetic-oauth'});
  }
  if(endpoint==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'){
   gmailAttempts++;
   assert.equal(query("SELECT status FROM quotes WHERE id='"+quoteId+"'").status,'SENT',
    'A quote must be durable and payable before any external email call');
   return Response.json({id:'synthetic-gmail-id',threadId:'synthetic-thread'});
  }
  throw Error('Unmocked network endpoint: '+endpoint);
 };
 const priorLinks=query('SELECT COUNT(*) n FROM quote_public_links').n;
 sqlite.prepare("UPDATE contacts SET do_not_contact=1 WHERE id='synthetic-email-contact'").run();
 let blockedMail=await directSend();
 assert.equal(blockedMail.status,409);
 assert.equal(blockedMail.body.code,'QUOTE_EMAIL_RECIPIENT_BLOCKED');
 assert.equal(query('SELECT COUNT(*) n FROM quote_public_links').n,priorLinks);
 assert.equal(gmailAttempts,0);
 sqlite.prepare("UPDATE contacts SET do_not_contact=0 WHERE id='synthetic-email-contact'").run();
 const savedRefresh=liveLikeEnv.GMAIL_REFRESH_TOKEN;
 delete liveLikeEnv.GMAIL_REFRESH_TOKEN;
 blockedMail=await directSend();
 assert.equal(blockedMail.status,503);
 assert.equal(blockedMail.body.code,'GMAIL_NOT_CONFIGURED');
 assert.equal(query('SELECT COUNT(*) n FROM quote_public_links').n,priorLinks);
 liveLikeEnv.GMAIL_REFRESH_TOKEN=savedRefresh;
 sqlite.exec("CREATE TRIGGER prevent_release_link BEFORE INSERT ON quote_public_links BEGIN SELECT RAISE(ABORT,'synthetic pre-mail DB failure'); END");
 let mail=await directSend();
 assert.equal(mail.status,500,'DB transaction failure must prevent Gmail dispatch');
 assert.equal(gmailAttempts,0,'Never send an email for an uncommitted customer link');
 assert.equal(oauthAttempts,0);
 assert.equal(query('SELECT COUNT(*) n FROM quote_public_links').n,priorLinks);
 sqlite.exec('DROP TRIGGER prevent_release_link');
 mail=await directSend();
 assert.equal(mail.status,200,JSON.stringify(mail));
 assert.equal(mail.body.emailed,true);
 assert.equal(mail.body.deliveryUnconfirmed,false);
 assert.equal(mail.body.trackingIncomplete,false);
 assert.equal(gmailAttempts,1);
 const confirmedLink=await routes.view({
  request:new Request('https://quote-test.example'+mail.body.publicPath),env,params:{token:mail.body.publicPath.split('/').pop()}
 });
 assert.equal(confirmedLink.status,200,'An emailed quote link must already be publicly readable');
 // Gmail may have received a message even when its API reply fails. The
 // merchant must check Sent, not interpret the failure as an unsent email.
 globalThis.fetch=async(url)=>{
  if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'synthetic-oauth'});
  if(String(url).includes('gmail.googleapis.com')){
   gmailAttempts++;
   return Response.json({error:{message:'Synthetic Gmail gateway response lost'}},{status:502});
  }
  throw Error('Unmocked network endpoint');
 };
 mail=await directSend();
 assert.equal(mail.status,200);
 assert.equal(mail.body.emailed,false);
 assert.equal(mail.body.deliveryUnconfirmed,true,'Uncertain Gmail delivery needs manual reconciliation');
 assert.equal(mail.body.followUpRecorded,true,'Uncertain delivery must persist an urgent staff task');
 assert.equal(query("SELECT COUNT(*) n FROM tasks WHERE type='QUOTE_EMAIL_REVIEW' AND priority='URGENT'").n,1);
 assert.equal(query("SELECT COUNT(*) n FROM activities WHERE activity_type='QUOTE_EMAIL_REVIEW_REQUIRED'").n,1);
 assert(mail.body.publicPath?.startsWith('/quote/'));
 assert.equal(query('SELECT status FROM quotes').status,'SENT');
 const stillReadable=await routes.view({
  request:new Request('https://quote-test.example'+mail.body.publicPath),env,params:{token:mail.body.publicPath.split('/').pop()}
 });
 assert.equal(stillReadable.status,200,'Do not revoke a possibly emailed valid URL');
 mail=await directSend();
 assert.equal(mail.body.deliveryUnconfirmed,true);
 assert.equal(query("SELECT COUNT(*) n FROM tasks WHERE type='QUOTE_EMAIL_REVIEW'").n,1,
  'A repeated uncertain send cannot create another identical open staff task');
 globalThis.fetch=async(url)=>{
  if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'synthetic-oauth'});
  if(String(url).includes('gmail.googleapis.com')){
   gmailAttempts++;return Response.json({id:'synthetic-gmail-after-crm-failure'});
  }
  throw Error('Unmocked network endpoint');
 };
 sqlite.exec(`CREATE TRIGGER fail_post_gmail_tracking BEFORE INSERT ON activities
  WHEN NEW.activity_type='QUOTE_EMAIL_SENT'
  BEGIN SELECT RAISE(ABORT,'synthetic CRM tracking failure'); END`);
 mail=await directSend();
 assert.equal(mail.status,200);
 assert.equal(mail.body.emailed,true,'Accepted Gmail message must not be relabeled as unsent due to CRM errors');
 assert.equal(mail.body.trackingIncomplete,true,'Staff must know when CRM tracking is incomplete');
 assert.equal(query("SELECT COUNT(*) n FROM tasks WHERE type='QUOTE_EMAIL_REVIEW' AND priority='URGENT'").n,2,
  'CRM tracking failure must create a separate urgent manual reconciliation task');
 assert.equal(query("SELECT COUNT(*) n FROM activities WHERE activity_type='QUOTE_EMAIL_REVIEW_REQUIRED'").n,3,
  'Both uncertain delivery incidents and tracking failure retain internal incident audits');
 sqlite.exec('DROP TRIGGER fail_post_gmail_tracking');
 assert.equal(gmailAttempts,4);
 globalThis.fetch=async()=>{externalCalls++;throw Error('Mock scope ended: external network forbidden')};

 assert.equal(externalCalls,0);
 console.log('PASS: real SQL inquiry → authenticated draft → decimal totals → edit/invalidation → staff approval → secure customer quote, no external sends.');
}finally{globalThis.fetch=originalFetch;sqlite.close();}
