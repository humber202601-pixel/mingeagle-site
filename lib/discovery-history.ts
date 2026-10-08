type Row=Record<string,unknown>;
type Selection={table:string;where:string;values:string[];rows:Row[]};
const ALL_TABLES=['discovery_clue_sources','discovery_run_candidates','discovery_auto_items','discovery_auto_cursors','discovery_auto_runs','discovery_jobs','discovery_clues','discovery_candidates','discovery_public_source_cache'];
const CRM_TABLES=['activities','automation_runs','email_queue','messages','tasks','lead_evidence','leads','contacts','companies'];
const RESTORE_ORDER=['companies','contacts','leads','lead_evidence','tasks','messages','email_queue','automation_runs','activities','discovery_candidates','discovery_clues','discovery_jobs','discovery_auto_runs','discovery_auto_cursors','discovery_auto_items','discovery_run_candidates','discovery_clue_sources','discovery_public_source_cache'];
const quoteId=(value:string)=>"'"+value.replaceAll("'","''")+"'";
const inIds=(column:string,ids:string[])=>({where:ids.length?`${column} IN (${ids.map(quoteId).join(',')})`:'0',values:[] as string[]});

export async function ensureHistory(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_history_archives (
    id TEXT PRIMARY KEY,counts_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ARCHIVED',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,restored_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_history_archive_rows (
    archive_id TEXT NOT NULL,table_name TEXT NOT NULL,row_json TEXT NOT NULL)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_discovery_history_archive ON discovery_history_archive_rows(archive_id,table_name)`).run();
}

async function selections(db:D1Database):Promise<{items:Selection[];protectedLeads:number}>{
  const tableRows=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all<{name:string}>();
  const tables=new Set(tableRows.results.map(r=>r.name));
  const all=await db.prepare(`SELECT l.id,l.company_id FROM leads l WHERE l.source='DISCOVERY'
    AND NOT EXISTS(SELECT 1 FROM inquiries i WHERE i.lead_id=l.id OR (l.company_id IS NOT NULL AND i.company_id=l.company_id) OR (l.primary_contact_id IS NOT NULL AND i.contact_id=l.primary_contact_id))
    AND NOT EXISTS(SELECT 1 FROM quotes q WHERE q.lead_id=l.id OR (l.company_id IS NOT NULL AND q.company_id=l.company_id) OR (l.primary_contact_id IS NOT NULL AND q.contact_id=l.primary_contact_id))
    AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.lead_id=l.id OR (l.company_id IS NOT NULL AND o.company_id=l.company_id) OR (l.primary_contact_id IS NOT NULL AND o.contact_id=l.primary_contact_id))
    AND NOT EXISTS(SELECT 1 FROM samples s WHERE s.lead_id=l.id OR (l.company_id IS NOT NULL AND s.company_id=l.company_id) OR (l.primary_contact_id IS NOT NULL AND s.contact_id=l.primary_contact_id))`).all<{id:string;company_id:string|null}>();
  const leadIds=all.results.map(r=>r.id),companyIds=[...new Set(all.results.map(r=>r.company_id).filter((id):id is string=>Boolean(id)))];
  const companies:string[]=[];
  for(const id of companyIds){
    const retained=await db.prepare(`SELECT id FROM leads WHERE company_id=? AND id NOT IN (${leadIds.map(quoteId).join(',')||"''"}) LIMIT 1`).bind(id).first();
    if(!retained)companies.push(id);
  }
  const contactRows=companies.length?await db.prepare(`SELECT ct.id FROM contacts ct WHERE ct.company_id IN (${companies.map(quoteId).join(',')})
    AND NOT EXISTS(SELECT 1 FROM leads l WHERE l.primary_contact_id=ct.id AND l.id NOT IN (${leadIds.map(quoteId).join(',')||"''"}))`).bind().all<{id:string}>():{results:[]};
  const contactIds=contactRows.results.map(r=>r.id),entityIds=[...leadIds,...companies,...contactIds];
  const selected:Record<string,{where:string;values:string[]}>=Object.fromEntries(ALL_TABLES.map(table=>[table,{where:'1=1',values:[]}]));
  for(const table of ['lead_evidence','messages','email_queue'])selected[table]=inIds('lead_id',leadIds);
  selected.tasks={...inIds('lead_id',leadIds),where:`(${inIds('lead_id',leadIds).where}) AND order_id IS NULL`};
  selected.activities=inIds('entity_id',entityIds);selected.automation_runs=inIds('entity_id',entityIds);
  selected.leads=inIds('id',leadIds);selected.companies=inIds('id',companies);selected.contacts=inIds('id',contactIds);
  const items:Selection[]=[];
  for(const table of [...ALL_TABLES,...CRM_TABLES]){
    if(!tables.has(table))continue;
    const {where,values}=selected[table];
    const data=await db.prepare(`SELECT * FROM ${table} WHERE ${where}`).bind(...values).all<Row>();
    items.push({table,where,values,rows:data.results});
  }
  const protectedCount=await db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE source='DISCOVERY'`).first<{n:number}>();
  return {items,protectedLeads:Number(protectedCount?.n||0)-leadIds.length};
}

export async function historyPreview(db:D1Database){
  const selected=await selections(db);
  const archives=await db.prepare(`SELECT id,counts_json,status,created_at,restored_at FROM discovery_history_archives ORDER BY created_at DESC,id DESC LIMIT 10`).all<Row>();
  return {counts:Object.fromEntries(selected.items.map(item=>[item.table,item.rows.length])),protectedLeads:selected.protectedLeads,archives:archives.results};
}

export async function clearHistory(db:D1Database){
  const table=await db.prepare(`SELECT name FROM sqlite_master WHERE name='discovery_auto_runs'`).first();
  if(table){const busy=await db.prepare(`SELECT id FROM discovery_auto_runs WHERE lease_until>datetime('now') LIMIT 1`).first();if(busy)throw new Error('当前步骤仍在执行，请暂停任务并等待该步骤结束后清理。');}
  const {items,protectedLeads}=await selections(db),id=crypto.randomUUID();
  const counts=Object.fromEntries(items.map(item=>[item.table,item.rows.length]));
  const statements=[db.prepare(`INSERT INTO discovery_history_archives(id,counts_json) VALUES(?,?)`).bind(id,JSON.stringify(counts))];
  for(const item of items){
    const columns=await db.prepare(`PRAGMA table_info(${item.table})`).all<{name:string}>();
    if(columns.results.some(c=>!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.name)))throw new Error('记录字段无法归档。');
    const fields=columns.results.map(c=>`'${c.name}',"${c.name}"`).join(',');
    statements.push(db.prepare(`INSERT INTO discovery_history_archive_rows(archive_id,table_name,row_json) SELECT ?,?,json_object(${fields}) FROM ${item.table} WHERE ${item.where}`).bind(id,item.table,...item.values));
  }
  // Child rows first; archived rows and deletion commit in one atomic D1 batch.
  const deletionOrder=['discovery_clue_sources','discovery_run_candidates','discovery_auto_items','discovery_auto_cursors','discovery_auto_runs','discovery_jobs','discovery_clues','discovery_candidates','discovery_public_source_cache',...CRM_TABLES];
  for(const name of deletionOrder){const item=items.find(i=>i.table===name);if(item)statements.push(db.prepare(`DELETE FROM ${item.table} WHERE ${item.where}`).bind(...item.values));}
  await db.batch(statements);
  return {archiveId:id,counts,protectedLeads};
}

export async function restoreHistory(db:D1Database,id:string){
  const archive=await db.prepare(`SELECT id,status FROM discovery_history_archives WHERE id=?`).bind(id).first<{id:string;status:string}>();
  if(!archive)throw new Error('历史恢复档案不存在。');
  if(archive.status==='RESTORED')return {alreadyRestored:true};
  const data=await db.prepare(`SELECT table_name,row_json FROM discovery_history_archive_rows WHERE archive_id=?`).bind(id).all<{table_name:string;row_json:string}>();
  if(data.results.some(row=>!RESTORE_ORDER.includes(row.table_name)))throw new Error('恢复档案包含未知记录。');
  const statements:D1PreparedStatement[]=[];
  for(const table of RESTORE_ORDER){
    const rows=data.results.filter(r=>r.table_name===table);
    if(!rows.length)continue;
    const columns=await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();
    const allowed=new Set(columns.results.map(c=>c.name));
    for(const item of rows){
      const row=JSON.parse(item.row_json) as Row;if(table==='discovery_auto_runs'){if(row.status==='RUNNING')row.status='PAUSED';row.lease_token=null;row.lease_until=null;}const keys=Object.keys(row).filter(k=>allowed.has(k)&&/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
      statements.push(db.prepare(`INSERT INTO ${table}(${keys.map(k=>'"'+k+'"').join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(k=>row[k]??null)));
    }
  }
  statements.push(db.prepare(`UPDATE discovery_history_archives SET status='RESTORED',restored_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id));
  try{await db.batch(statements);}catch{throw new Error('恢复与当前新增档案冲突，未更改任何记录。请先清理当前记录，再恢复该历史批次。');}
  return {restored:data.results.length};
}
