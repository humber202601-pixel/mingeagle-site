// Best-effort IP throttling for anonymous website inquiries, never for
// HubSpot's authenticated server-to-server recovery ingestion.
// Cloudflare supplies CF-Connecting-IP; client-controlled X-Forwarded-For is not trusted.
// Only a short-lived SHA-256 key, never the raw client IP, is written to D1.
let init:Promise<void>|undefined;
export async function publicInquiryRateLimit(db:D1Database,request:Request){
  const ip=request.headers.get('cf-connecting-ip')?.trim();
  if(!ip)return {allowed:true,retryAfter:0}; // Test/local traffic without a Cloudflare IP
  const window=Math.floor(Date.now()/900000);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+'|'+window));
  const key=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(!init)init=db.prepare(`CREATE TABLE IF NOT EXISTS public_inquiry_rate_windows(
    ip_window_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run().then(()=>undefined).catch(e=>{init=undefined;throw e});
  await init;
  const row=await db.prepare(`INSERT INTO public_inquiry_rate_windows(ip_window_hash,attempts)
    VALUES(?,1)
    ON CONFLICT(ip_window_hash) DO UPDATE SET attempts=attempts+1
    RETURNING attempts`).bind(key).first<{attempts:number}>();
  // Probabilistic TTL cleanup avoids a D1 write for every anonymous submission.
  if(Math.random()<0.015)await db.prepare(`DELETE FROM public_inquiry_rate_windows
    WHERE created_at<datetime('now','-1 day')`).run().catch(()=>{});
  const count=Number(row?.attempts||1);
  return {allowed:count<=12,retryAfter:Math.max(1,Math.ceil((900000-Date.now()%900000)/1000))};
}
