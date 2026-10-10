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
 let input:{inquiryReference?:string;unitPrices?:number[];shippingUSD?:number;paymentTerms?:string;shippingTerms?:string};
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
 const raw=text.slice(idx+mark.length).split(/\r?\n/),lines:{description:string;quantity:number}[]=[];
 for(const line of raw){const m=/^(.+?) \| No\. (3|4|5|6|7) \| (.+?) \| ([1-9]\d{0,5}) units$/.exec(line.trim());if(!m)break;
  const product=variants[m[1]],quantity=Number(m[4]);if(!product||!product.sizes.includes(m[2])||!product.colors.includes(m[3])||!Number.isSafeInteger(quantity))return bad('Invalid customer variant',409);
  lines.push({description:m[1]+' | No. '+m[2]+' | '+m[3],quantity});if(lines.length>20)return bad('Too many RFQ lines',409);
 }
 if(!lines.length)return bad('Missing RFQ line items',409);
 if(!Array.isArray(input.unitPrices)||input.unitPrices.length!==lines.length||input.unitPrices.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<=0||v>100000||Math.round(v*100)!==v*100))return bad('Enter verified USD unit price for each line');
 const shipping=input.shippingUSD;
 if(typeof shipping!=='number'||!Number.isFinite(shipping)||shipping<0||shipping>1000000||Math.round(shipping*100)!==shipping*100)return bad('Enter verified USD shipping amount (0 if included)');
 const payment=String(input.paymentTerms||'').trim(),terms=String(input.shippingTerms||'').trim();
 if(!payment||!terms||payment.length>500||terms.length>500)return bad('Confirm payment and shipping terms');
 const cents=lines.map((line,i)=>Math.round(input.unitPrices![i]*100)*line.quantity);
 const subtotalCents=cents.reduce((a,b)=>a+b,0),totalCents=subtotalCents+Math.round(shipping*100);
 if(!Number.isSafeInteger(totalCents)||totalCents>100000000)return bad('Quote total outside review limits');
 const id=crypto.randomUUID(),quoteRef='ME-Q-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,4).toUpperCase();
 const sql=db.prepare("INSERT INTO quotes (id,reference,lead_id,inquiry_id,company_id,contact_id,status,currency,subtotal,discount,shipping,tax,total,payment_terms,shipping_terms,notes,valid_until) VALUES (?,?,?,?,?,?,'DRAFT','USD',?,0,?,0,?,?,?,?,datetime('now','+14 days'))").bind(id,quoteRef,inquiry.lead_id,inquiry.id,inquiry.company_id,inquiry.contact_id,subtotalCents/100,shipping,totalCents/100,payment,terms,'Wholesale draft. Manually priced by staff; verify freight, duties, stock and terms before sending. Source inquiry '+ref);
 const stmts=[sql,...lines.map((line,i)=>db.prepare('INSERT INTO quote_items (id,quote_id,description,quantity,unit_price,line_total,sort_order) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,line.description,line.quantity,input.unitPrices![i],cents[i]/100,i)),db.prepare("UPDATE inquiries SET status='QUOTED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(inquiry.id)];
 await db.batch(stmts);
 return Response.json({ok:true,quoteReference:quoteRef,status:'DRAFT',items:lines.length,subtotalUSD:subtotalCents/100,shippingUSD:shipping,totalUSD:totalCents/100,reviewRequired:true,sent:false},{headers:{'cache-control':'no-store'}});
 }catch(e){console.error('wholesale_draft_error',e);return bad('Unable to create wholesale quote draft',503)}
};
