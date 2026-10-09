import {fetchPublicText,publicUrl} from './public-web';
export type PublicSearchHit={title:string;url:string;snippet:string};
const decode=(v:string)=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const plain=(v:string)=>decode(v.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export function rssSearchHits(rss:string):PublicSearchHit[]{
  if(!/<rss\b|<channel\b/i.test(rss))throw new Error('公开索引未返回可读取的搜索结果。');
  const field=(item:string,key:string)=>plain(item.match(new RegExp(`<${key}[^>]*>([\\s\\S]*?)<\\/${key}>`,'i'))?.[1]||'');
  return (rss.match(/<item\b[\s\S]*?<\/item>/gi)||[]).map(item=>({title:field(item,'title'),url:field(item,'link'),snippet:field(item,'description')})).filter(hit=>hit.title&&publicUrl(hit.url));
}
export function htmlSearchHits(html:string):PublicSearchHit[]{
  if(/anomaly-modal|challenge-form|unfortunately, bots use DuckDuckGo|verify (?:that )?you are human/i.test(html))throw new Error('备用公开索引要求人工验证，本次未读取结果。');
  const hits:PublicSearchHit[]=[],seen=new Set<string>();
  for(const m of html.matchAll(/<a\b([^>]*\bclass\s*=\s*["'][^"']*\bresult__a\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)){
    const href=decode(m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]||'');let url='';
    try{const u=new URL(href,'https://html.duckduckgo.com');url=u.searchParams.get('uddg')||u.toString();}catch{continue;}
    const title=plain(m[2]);if(!title||!publicUrl(url)||/^(?:[^.]+\.)?duckduckgo\.com$/i.test(new URL(url).hostname)||seen.has(url))continue;
    const tail=html.slice((m.index||0)+m[0].length,(m.index||0)+m[0].length+5000).split(/<h2\b/i)[0];
    const snippet=plain(tail.match(/<(?:a|div|span)\b[^>]*\bclass\s*=\s*["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i)?.[1]||'');
    seen.add(url);hits.push({title,url,snippet});if(hits.length>=20)break;
  }
  if(!hits.length&&!/no-results|no results|result__a/i.test(html))throw new Error('备用公开索引页面无法识别，本次未读取结果。');
  return hits;
}
// One ordinary public HTML request; never solves challenges or changes the network/client identity.
export async function alternateSearch(query:string,db?:D1Database){
  const key='public-index-block:duckduckgo';
  if(db){
    await db.prepare(`CREATE TABLE IF NOT EXISTS discovery_public_source_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at TEXT NOT NULL)`).run();
    const blocked=await db.prepare(`SELECT payload FROM discovery_public_source_cache WHERE cache_key=? AND expires_at>CURRENT_TIMESTAMP`).bind(key).first<{payload:string}>();
    if(blocked)throw new Error('备用公开索引处于人工验证限制期，本次停止该来源请求（30分钟内不重试）。');
  }
  try{return htmlSearchHits(await fetchPublicText('https://html.duckduckgo.com/html/?q='+encodeURIComponent(query)+'&kl=us-en',4500));}
  catch(e){
    if(db&&e instanceof Error&&e.message.includes('人工验证'))await db.prepare(`INSERT INTO discovery_public_source_cache(cache_key,payload,expires_at) VALUES(?,?,datetime('now','+30 minutes')) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at`).bind(key,JSON.stringify({reason:e.message})).run();
    throw e;
  }
}
