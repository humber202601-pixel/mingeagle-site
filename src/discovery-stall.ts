/** V36. Pure stalled-run detection; timestamps are D1 UTC and never depend on browser locale. */
export type StallSnapshot={
  run?:{status:string;created_at?:string|null;last_progress_at?:string|null}|null;
  workerBusy?:boolean;
  progress?:{waiting?:number;processing?:number}|null;
};
export function discoveryStall(snapshot:StallSnapshot,now=Date.now()){
  const run=snapshot.run;
  const waiting=Math.max(0,Number(snapshot.progress?.waiting)||0);
  const processing=Math.max(0,Number(snapshot.progress?.processing)||0);
  const time=String(run?.last_progress_at||run?.created_at||'');
  // D1 stores UTC timestamps with a space rather than "T" + "Z".
  const utc=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(time)?time.replace(' ','T')+'Z':time;
  const date=utc?Date.parse(utc):NaN;
  const elapsed=Number.isFinite(date)?Math.max(0,Math.floor((now-date)/60000)):null;
  const active=run?.status==='RUNNING'&&(waiting+processing)>0;
  const stale=active&&elapsed!==null&&elapsed>=5;
  return {stale:Boolean(stale),canRecover:Boolean(stale&&!snapshot.workerBusy),workerBusy:Boolean(snapshot.workerBusy),
    elapsedMinutes:elapsed,waiting,processing,
    status:!active?'NONE':elapsed===null?'UNKNOWN':stale&&snapshot.workerBusy?'WAITING_FOR_LEASE':stale?'NEEDS_ATTENTION':'PROGRESSING'};
}
