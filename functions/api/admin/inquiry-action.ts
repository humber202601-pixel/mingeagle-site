interface Env { MINGEAGLE_DB?: D1Database }
type InquiryActionInput = { inquiryId?: unknown; action?: unknown; reason?: unknown };
type InquiryRow = { id:string; reference:string; lead_id:string|null; status:string };
const json=(body:Record<string,unknown>,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
const cleanReason=(value:unknown)=>typeof value==='string'
  ? value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,' ').trim().slice(0,500)
  : '';
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  const db=env.MINGEAGLE_DB;
  if(!db)return json({ok:false,error:'Database is not configured.'},503);
  let input:InquiryActionInput;
  try{input=await request.json() as InquiryActionInput}catch{return json({ok:false,error:'Invalid JSON.'},400)}
  const inquiryId=typeof input.inquiryId==='string'?input.inquiryId.trim():'';
  const action=typeof input.action==='string'?input.action.trim().toUpperCase():'';
  const reason=cleanReason(input.reason);
  if(!inquiryId||action!=='CLOSE')return json({ok:false,error:'Inquiry id and CLOSE action are required.'},400);
  if(reason.length<12)return json({ok:false,error:'请填写至少 12 个字符的关闭原因，便于保留审计记录。'},400);
  try{
    const inquiry=await db.prepare('SELECT id,reference,lead_id,status FROM inquiries WHERE id=? LIMIT 1')
      .bind(inquiryId).first<InquiryRow>();
    if(!inquiry)return json({ok:false,error:'Inquiry not found.'},404);
    if(inquiry.status==='CLOSED')return json({ok:true,alreadyClosed:true,status:'CLOSED',reference:inquiry.reference});
    const activeQuotes=await db.prepare(`SELECT COUNT(*) AS value FROM quotes
      WHERE inquiry_id=? AND status NOT IN ('DECLINED','EXPIRED')`)
      .bind(inquiry.id).first<{value:number}>();
    if(Number(activeQuotes?.value||0)>0)
      return json({ok:false,code:'INQUIRY_HAS_ACTIVE_QUOTE',error:'该询盘仍关联未结束的报价。请先核对报价状态；系统未关闭询盘。'},409);
    const linkedOrders=await db.prepare(`SELECT COUNT(*) AS value FROM orders
      WHERE quote_id IN (SELECT id FROM quotes WHERE inquiry_id=?)`)
      .bind(inquiry.id).first<{value:number}>();
    if(Number(linkedOrders?.value||0)>0)
      return json({ok:false,code:'INQUIRY_HAS_ORDER',error:'该询盘关联了订单。为保护销售和付款历史，系统不会关闭该询盘。'},409);
    const changed=await db.prepare(`UPDATE inquiries SET status='CLOSED',updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status<>'CLOSED'`).bind(inquiry.id).run();
    if(Number(changed.meta?.changes||0)!==1)
      return json({ok:false,code:'INQUIRY_STATUS_CHANGED',error:'询盘状态已被其他操作更新，请刷新后核对。'},409);
    let cancelledTasks=0;
    if(inquiry.lead_id){
      const tasks=await db.prepare(`UPDATE tasks SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP
        WHERE lead_id=? AND status IN ('OPEN','IN_PROGRESS') AND title=?`)
        .bind(inquiry.lead_id,'Review wholesale inquiry '+inquiry.reference).run();
      cancelledTasks=Number(tasks.meta?.changes||0);
    }
    await db.prepare(`INSERT INTO activities
      (id,entity_type,entity_id,activity_type,title,description,metadata_json)
      VALUES (?,'INQUIRY',?,'INQUIRY_CLOSED','Inquiry closed by admin',?,?)`)
      .bind(crypto.randomUUID(),inquiry.id,reason,JSON.stringify({
        inquiryReference:inquiry.reference,reason,contactAndLeadPreserved:true,
        messagesPreserved:true,outboundEmailSent:false,cancelledReviewTasks:cancelledTasks
      })).run();
    return json({ok:true,status:'CLOSED',reference:inquiry.reference,cancelledTasks,
      preserved:['contact','lead','messages','quotes','orders','existing activities']});
  }catch(error){
    console.error('admin_inquiry_close_failed',error);
    return json({ok:false,error:'Unable to close inquiry safely. Refresh the record and verify its current status.'},500);
  }
};
