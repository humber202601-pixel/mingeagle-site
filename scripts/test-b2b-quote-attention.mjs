import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';

const source=readFileSync('src/b2bQuoteAttention.ts','utf8');
const compiled=(await transform(source,{loader:'ts',format:'esm',target:'es2022'})).code;
const {quoteAttention,pendingQuoteAttention}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const now=Date.parse('2026-10-16T14:00:00Z');
const rows=[
  {reference:'V',status:'VIEWED',first_viewed_at:'2026-10-13 12:00:00',valid_until:'2026-10-25 00:00:00'},
  {reference:'S',status:'SENT',sent_at:'2026-10-11 12:00:00',valid_until:'2026-10-25 00:00:00'},
  {reference:'D',status:'DRAFT',created_at:'2026-10-12 12:00:00',valid_until:'2026-10-25 00:00:00'},
  {reference:'X',status:'EXPIRED',valid_until:'2026-10-15 00:00:00'},
  {reference:'G',status:'VIEWED',first_viewed_at:'2026-10-15 22:00:00',valid_until:'2026-10-25 00:00:00'},
  {reference:'C',status:'CONVERTED',first_viewed_at:'2026-10-01 00:00:00',valid_until:'2026-10-02 00:00:00'},
  {reference:'E',status:'SENT',sent_at:'2026-10-15 10:00:00',valid_until:'2026-10-16 00:00:00'}
];
const original=JSON.stringify(rows);
assert.deepEqual(pendingQuoteAttention(rows,now).map(x=>x.quote.reference),['E','X','V','S','D']);
assert.equal(JSON.stringify(rows),original,'No quote mutation or state changes');
assert.equal(quoteAttention(rows[4],now).needsAction,false,'Do not prematurely nag a recent quote viewer');
assert.equal(quoteAttention(rows[5],now).needsAction,false,'Never count converted as overdue');
assert.equal(quoteAttention({status:'DRAFT',created_at:'2026-10-16'},now).needsAction,false);
assert.equal(quoteAttention({status:'SENT',sent_at:'2026-10-12 08:00:00',valid_until:'2026-10-15'},now).label,'报价已过期','Expired status has precedence over stale-sent reminder');
assert.equal(quoteAttention({status:'DRAFT',created_at:'invalid'},now).needsAction,false);
const ui=readFileSync('src/QuoteBuilder.tsx','utf8');
assert(ui.includes('pendingQuoteAttention(quotes,followupClock)'));
assert(ui.includes('批发报价待跟进'));
assert(ui.includes('不自动联系客户'));
assert(ui.includes('quoteAttention(quote,followupClock).label'));
assert(ui.includes('deliverQuote(quote, true)'),'Existing explicit manual quote delivery remains available');
assert(!source.includes('fetch('),'Pure triage must never send requests');
console.log('PASS: B2B quote triage ranks expired, viewed, sent and draft quote records without mutation or automatic email.');
