import {normalizeSupplierTerms,mayApproveSupplierTerms,type SupplierTerms} from '../../../lib/supplier-pricing';
interface Env{MINGEAGLE_DB?:D1Database}
type Stored={sku:string;supplier_name:string;supplier_sku:string|null;moq:number;case_pack:number;currency:string;
 tiers_json:string;source_note:string;effective_on:string;expires_on:string;status:string;version:number;approved_at:string|null;updated_at:string};
const response=(v:object,s=200)=>Response.json(v,{status:s,headers:{'cache-control':'private, no-store'}});
const no=()=>response({ok:false,error:'Supplier purchase database unavailable; apply migration 0005.'},503);
const display=(row:Stored)=>({
 sku:row.sku,supplierName:row.supplier_name,supplierSku:row.supplier_sku||'',
 moq:row.moq,casePack:row.case_pack,currency:row.currency,
 tiers:JSON.parse(row.tiers_json) as Array<{minimumQuantity:number;purchaseCents:number}>,
 sourceNote:row.source_note,effectiveOn:row.effective_on,expiresOn:row.expires_on,
 status:row.status,version:row.version,approvedAt:row.approved_at,updatedAt:row.updated_at,
});
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return no();
 try{
  const [rows,audit]=await Promise.all([
   db.prepare('SELECT * FROM supplier_purchase_terms ORDER BY sku LIMIT 30').all<Stored>(),
   db.prepare('SELECT sku,version,action,occurred_at FROM supplier_purchase_audit ORDER BY occurred_at DESC, rowid DESC LIMIT 30').all(),
  ]);
  return response({ok:true,terms:rows.results.map(display),audit:audit.results});
 }catch{return no()}
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 const db=env.MINGEAGLE_DB;if(!db)return no();
 let x:Record<string,unknown>;
 try{const v=await request.json();if(!v||typeof v!=='object'||Array.isArray(v))throw Error();x=v as Record<string,unknown>}
 catch{return response({ok:false,error:'Invalid JSON.'},400)}
 const action=x.action;
 if(!['SAVE_DRAFT','APPROVE','DISABLE'].includes(String(action)))return response({ok:false,error:'Unknown operation.'},400);
 const sku=String(x.sku||'').trim().toUpperCase();
 if(!/^P[1-4]-S[3-7]$/.test(sku))return response({ok:false,error:'Invalid SKU.'},400);
 const revision=x.expectedVersion;
 if(!Number.isSafeInteger(revision)||Number(revision)<0)return response({ok:false,error:'Version check is required.'},400);
 try{
  const existing=await db.prepare('SELECT * FROM supplier_purchase_terms WHERE sku=?').bind(sku).first<Stored>();
  if(existing&&existing.version!==revision||!existing&&revision!==0)return response({ok:false,error:'Supplier terms changed; refresh before saving.'},409);
  if(action!=='SAVE_DRAFT'&&!existing)return response({ok:false,error:'Save and verify draft first.'},409);
  let terms:SupplierTerms;
  let status:'DRAFT'|'APPROVED'|'DISABLED'='DRAFT';
  if(action==='SAVE_DRAFT'){
   try{terms=normalizeSupplierTerms({...x,sku})}
   catch(e){return response({ok:false,error:'Invalid supplier terms: '+String(e instanceof Error?e.message:'UNKNOWN')},400)}
  }else{
   if(x.confirmed!==true)return response({ok:false,error:'Explicit staff confirmation is required.'},400);
   if(action==='APPROVE'&&existing!.status!=='DRAFT')return response({ok:false,error:'Only reviewed drafts can be approved.'},409);
   if(action==='DISABLE'&&existing!.status==='DISABLED')return response({ok:false,error:'Already disabled.'},409);
   try{
    const savedTiers=JSON.parse(existing!.tiers_json) as Array<{minimumQuantity:number;purchaseCents:number}>;
    terms=normalizeSupplierTerms({sku:existing!.sku,supplierName:existing!.supplier_name,
      supplierSku:existing!.supplier_sku||'',moq:existing!.moq,casePack:existing!.case_pack,
      sourceNote:existing!.source_note,effectiveOn:existing!.effective_on,expiresOn:existing!.expires_on,
      tiers:savedTiers.map(t=>({minimumQuantity:t.minimumQuantity,unitCostUSD:(t.purchaseCents/100).toFixed(2)}))});
   }catch{return response({ok:false,error:'Saved supplier terms require correction.'},409)}
   if(action==='APPROVE'){
    if(!mayApproveSupplierTerms(terms,new Date().toISOString().slice(0,10)))
      return response({ok:false,error:'Supplier cost tiers and valid effective/expiry dates are required before approval.'},409);
    status='APPROVED';
   }else status='DISABLED';
  }
  const next=Number(revision)+1;
  const tierJson=JSON.stringify(terms.tiers);
  let commands:D1PreparedStatement[];
  if(existing){
   commands=[
    db.prepare('UPDATE supplier_purchase_terms SET supplier_name=?,supplier_sku=?,moq=?,case_pack=?,tiers_json=?,source_note=?,effective_on=?,expires_on=?,status=?,version=?,approved_at=CASE WHEN ?=\'APPROVED\' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE sku=? AND version=?')
      .bind(terms.supplierName,terms.supplierSku,terms.moq,terms.casePack,tierJson,terms.sourceNote,terms.effectiveOn,terms.expiresOn,status,next,status,sku,revision),
    db.prepare('INSERT INTO supplier_purchase_audit(id,sku,version,action) SELECT ?,sku,version,? FROM supplier_purchase_terms WHERE sku=? AND version=?')
      .bind(crypto.randomUUID(),action,sku,next),
   ];
  }else{
   commands=[
    db.prepare('INSERT INTO supplier_purchase_terms(sku,supplier_name,supplier_sku,moq,case_pack,currency,tiers_json,source_note,effective_on,expires_on,status,version) VALUES(?,?,?,?,?,\'USD\',?,?,?,?,\'DRAFT\',1)')
      .bind(sku,terms.supplierName,terms.supplierSku,terms.moq,terms.casePack,tierJson,terms.sourceNote,terms.effectiveOn,terms.expiresOn),
    db.prepare('INSERT INTO supplier_purchase_audit(id,sku,version,action) VALUES(?,?,1,\'SAVE_DRAFT\')')
      .bind(crypto.randomUUID(),sku),
   ];
  }
  const result=await db.batch(commands);
  if(!result[0]?.meta||Number(result[0].meta.changes)!==1||!result[1]?.meta||Number(result[1].meta.changes)!==1)
    return response({ok:false,error:'Concurrent update; refresh the catalog.'},409);
  return response({ok:true,sku,version:next,status,approved:status==='APPROVED'});
 }catch(e){
  console.error('supplier_terms_save_failed');
  return response({ok:false,error:'Supplier terms cannot be saved; check migration and retry.'},503);
 }
};
