import {retailReference, RETAIL_SOURCE_URL} from '../../../lib/retail-reference';
import {quoteTotals} from '../../../lib/quote-totals';
import {reviewRfqQuantityConstraints,type QuantityConstraint} from '../../../lib/rfq-commercial-check';
import {internalSkuForRfq,assessRfqPurchaseCosts,type ApprovedCostRow} from '../../../lib/rfq-cost-review';
// Admin-only, manually priced B2B draft. Never assume retail prices are wholesale prices.
interface Env {MINGEAGLE_DB?:D1Database}
type R=Record<string,unknown>;
const bad=(error:string,status=400)=>Response.json({ok:false,error},{status});
const names=['Flocked Silent Basketball Set','Fabric-Cover Silent Basketball Set','Weighted Flocked Silent Basketball','Flocked Silent Soccer Ball'];
const variants:Record<string,{sizes:string[];colors:string[]}>={
 [names[0]]:{sizes:['3','5','7'],colors:['Orange','Blue','Green','Yellow']},
 [names[1]]:{sizes:['3','5','7'],colors:['Orange','Green']},
 [names[2]]:{sizes:['3','4','6','7'],colors:['Orange','Brown','Black','Aqua Blue']},
 [names[3]]:{sizes:['5'],colors:['Black/White','Black/Green','Black/Red','Yellow/Green','Black/Gold']}
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return bad('Database unavailable',503);
 let input:{inquiryReference?:string;unitPrices?:Array<number|string>;shippingUSD?:number|string;taxUSD?:number|string;taxBasis?:string;paymentTerms?:string;shippingTerms?:string;quantityConstraints?:QuantityConstraint[]};
 try{input=await request.json()}catch{return bad('Invalid JSON')}
 const ref=String(input.inquiryReference||'').trim();
 if(!/^[A-Z0-9-]{5,100}$/.test(ref))return bad('Invalid inquiry reference');
 try{
 const inquiry=await db.prepare('SELECT id,reference,lead_id,company_id,contact_id,status,message FROM inquiries WHERE reference=? LIMIT 1').bind(ref).first<R>();
 if(!inquiry)return bad('Inquiry not found',404);
 if(inquiry.status==='CLOSED'||inquiry.status==='QUOTED')return bad('Inquiry already closed or quoted',409);
 const old=await db.prepare('SELECT reference FROM quotes WHERE inquiry_id=? LIMIT 1').bind(inquiry.id).first<R>();
 if(old)return bad('Existing quote: '+String(old.reference),409);
 const text=String(inquiry.message||''),mark='Combined wholesale RFQ (customer-selected; not a final price):',idx=text.indexOf(mark);
 if(idx<0)return bad('Not a structured wholesale RFQ');
 const raw=text.slice(idx+mark.length).replace(/^\r?\n/,'').split(/\r?\n/),
   lines:{description:string;product:string;size:string;color:string;quantity:number}[]=[];
 for(const line of raw){const m=/^(.+?) \| No\. (3|4|5|6|7) \| (.+?) \| ([1-9]\d{0,5}) units$/.exec(line.trim());if(!m)break;
  const product=variants[m[1]],quantity=Number(m[4]);if(!product||!product.sizes.includes(m[2])||!product.colors.includes(m[3])||!Number.isSafeInteger(quantity))return bad('Invalid customer variant',409);
  lines.push({description:m[1]+' | No. '+m[2]+' | '+m[3],product:m[1],size:m[2],color:m[3],quantity});if(lines.length>20)return bad('Too many RFQ lines',409);
 }
 if(!lines.length)return bad('Missing RFQ line items',409);
 const review=reviewRfqQuantityConstraints(lines,input.quantityConstraints);
 if(!review.ok)return bad('MOQ/packing review failed: '+review.errors.join(', ')+'; confirm with the supplier and buyer before changing requested quantities.');
 if(!Array.isArray(input.unitPrices)||input.unitPrices.length!==lines.length)return bad('Enter verified USD unit price for each line');
 if(input.taxUSD===''||input.taxUSD===null||input.taxUSD===undefined)return bad('Enter the explicitly reviewed US sales-tax amount for this quotation (0 is allowed only when the documented tax basis supports it)');
 let calculation:ReturnType<typeof quoteTotals>;
 try{calculation=quoteTotals(lines.map((line,i)=>({quantity:line.quantity,unitPrice:input.unitPrices![i]})),input.shippingUSD,0,input.taxUSD)}catch{return bad('Enter valid USD prices, explicit shipping and a reviewed sales-tax amount with at most two decimal places; review quantity and total limits');}
 // Compare the staff-selected sell prices against only APPROVED, effective
 // supplier SKU/size cost tiers. A missing/expired vendor source stays unverified;
 // never make up a margin. This check runs server-side even when the UI is bypassed.
 const skus=[...new Set(lines.map(line=>internalSkuForRfq(line)).filter((x):x is string=>Boolean(x)))];
 let approvedCosts:ApprovedCostRow[];
 try{
  const selected=await db.prepare(`SELECT sku,status,currency,moq,case_pack,effective_on,expires_on,tiers_json,version
   FROM supplier_purchase_terms WHERE sku IN (${skus.map(()=>'?').join(',')})`).bind(...skus).all<ApprovedCostRow>();
  approvedCosts=selected.results;
 }catch{return bad('Supplier cost catalog temporarily unavailable; retry after verifying migration 0005.',503)}
 const costReview=assessRfqPurchaseCosts(lines,calculation.lines.map(l=>l.unitCents),approvedCosts,new Date().toISOString().slice(0,10));
 if(!costReview.ok)return bad('Approved supplier cost/MOQ check failed: '+costReview.issues.join(', ')+
  '. Review the supplier source, requested quantities and manual sales prices before drafting.');
 const shipping=calculation.shipping;
 const payment=String(input.paymentTerms||'').trim(),terms=String(input.shippingTerms||'').trim(),taxBasis=String(input.taxBasis||'').trim();
 if(!payment||!terms||payment.length>500||terms.length>500)return bad('Confirm payment and shipping terms');
 if(!taxBasis||taxBasis.length>1000)return bad('Document the reviewed US sales-tax basis before creating a wholesale quote');
 const cents=calculation.lineCents,subtotalCents=calculation.subtotalCents,totalCents=calculation.totalCents;
 const id=crypto.randomUUID(),quoteRef='ME-Q-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,4).toUpperCase();
 // Catalog reference is already published and keyed by product + size.
 // Persist the exact per-line snapshot so the customer quotation can show verified savings.
 await db.prepare(`CREATE TABLE IF NOT EXISTS quote_retail_approvals (
 quote_id TEXT NOT NULL,item_id TEXT NOT NULL,retail_usd REAL NOT NULL,
 source_url TEXT NOT NULL,approved_description TEXT NOT NULL,
 approved_unit_price REAL NOT NULL,approved_quantity INTEGER NOT NULL,
 approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(quote_id,item_id))`).run();
 const lineItems=lines.map((line,i)=>({ ...line,itemId:crypto.randomUUID(),wholesale:calculation.lines[i].unitCents/100,retail:retailReference(line.description) }));
 const sql=db.prepare("INSERT INTO quotes (id,reference,lead_id,inquiry_id,company_id,contact_id,status,currency,subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,notes,tax_basis,valid_until) VALUES (?,?,?,?,?,?,'DRAFT','USD',?,0,?,?,?,?,?,?,?,datetime('now','+14 days'))").bind(id,quoteRef,inquiry.lead_id,inquiry.id,inquiry.company_id,inquiry.contact_id,subtotalCents/100,shipping,calculation.tax,totalCents/100,payment,terms,'Wholesale draft. Manually priced by staff; verify freight, duties, stock and terms before sending. Source inquiry '+ref
 +'. Staff-entered MOQ/whole-case review: '+review.verified.length+' fully specified; '+review.pending.length+' lines have MOQ or case-pack not verified. Supplier confirmation required.'
 +'. Sales-tax basis: '+taxBasis+'. Internal purchase source review: '+costReview.approvedLines+' lines matched an approved SKU-size baseline; '+costReview.unverifiedLines+' missing/expired/unapproved or color unverified. Internal cost figures must not be used as customer sale prices.',taxBasis);
 const stmts=[sql,...lineItems.map((line,i)=>db.prepare('INSERT INTO quote_items (id,quote_id,description,quantity,unit_price,line_total,sort_order) VALUES (?,?,?,?,?,?,?)').bind(line.itemId,id,line.description,line.quantity,line.wholesale,cents[i]/100,i)),
 ...lineItems.filter(line=>line.retail!==null&&line.wholesale<line.retail!).map(line=>db.prepare(`INSERT INTO quote_retail_approvals (quote_id,item_id,retail_usd,source_url,approved_description,approved_unit_price,approved_quantity)
 VALUES (?,?,?,?,?,?,?)`).bind(id,line.itemId,line.retail,RETAIL_SOURCE_URL,line.description,line.wholesale,line.quantity)),
 db.prepare("UPDATE inquiries SET status='QUOTED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(inquiry.id)];
 await db.batch(stmts);
 return Response.json({ok:true,quoteReference:quoteRef,status:'DRAFT',items:lines.length,subtotalUSD:subtotalCents/100,shippingUSD:shipping,taxUSD:calculation.tax,totalUSD:totalCents/100,reviewRequired:true,
   quantityReview:{fullySpecified:review.verified.length,pending:review.pending.length},
   purchaseCostReview:{
     approvedSkuBaselines:costReview.approvedLines,unverifiedSkuBaselines:costReview.unverifiedLines,
     estimates:costReview.rows.map((r,i)=>({line:i+1,sku:r.sku,state:r.state,
       purchaseUnitUSD:r.unitCostCents===null?null:r.unitCostCents/100,
       provisionalUnitContributionUSD:r.unitContributionCents===null?null:r.unitContributionCents/100,
       supplierVersion:r.supplierVersion})),
     caveat:'SKU/size-only purchasing cost baseline; color, freight, taxes and other landed costs need human review. Not gross or net profit.'
   },sent:false},{headers:{'cache-control':'no-store'}});
 }catch(e){console.error('wholesale_draft_error',e);return bad('Unable to create wholesale quote draft',503)}
};
