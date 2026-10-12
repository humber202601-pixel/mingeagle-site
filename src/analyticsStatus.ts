// Cloudflare D1 timestamps use SQLite UTC ("YYYY-MM-DD HH:MM:SS").
// This checks the AGE OF A STORED SNAPSHOT, not whether cron last ran.
export type SnapshotAge = {state:'missing'|'recent'|'old'|'invalid';text:string};
export function describeSnapshotAge(fetchedAt:string|null|undefined, nowMillis=Date.now()):SnapshotAge {
 if(!fetchedAt)return {state:'missing',text:'尚未产生可核验的日统计快照'};
 const raw=fetchedAt.trim();
 const iso=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)?raw.replace(' ','T')+'Z':raw;
 const parsed=Date.parse(iso);
 if(!Number.isFinite(parsed)||!Number.isFinite(nowMillis)||parsed>nowMillis+600000)
  return {state:'invalid',text:'快照同步时间异常，请检查数据来源'};
 const hours=(nowMillis-parsed)/3600000;
 if(hours>48)return {state:'old',text:'最近一条有效快照已超过48小时未更新；可能是没有新增可用数据，需结合 Cloudflare 报表检查'};
 return {state:'recent',text:'最近一条有效快照在48小时内获取，不代表当前实时访问量'};
}
export const FIRST_CAPTURE_DAY_UTC='2026-10-12';
export const FIRST_CAPTURE_TIME_UTC='2026-10-12 17:05 UTC';
export function containsPartialInitialDay(rows:ReadonlyArray<{dateUTC:string}>):boolean {
 return rows.some(r=>r.dateUTC===FIRST_CAPTURE_DAY_UTC);
}
