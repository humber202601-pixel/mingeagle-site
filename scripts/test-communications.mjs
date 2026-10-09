import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const folder = mkdtempSync(join(tmpdir(), 'mingeagle-communications-'));
const originalFetch = globalThis.fetch;
try {
  const entries = ['functions/api/admin/discovery-website-v1.ts', 'functions/api/admin/communications.ts',
    'functions/api/admin/outreach-draft.ts', 'functions/api/admin/customer-email-send.ts', 'lib/discovery-intake.ts', 'shared/outreach.ts'];
  await build({ entryPoints: entries, outdir: folder, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, entryNames: '[name]', logLevel: 'silent' });
  const handlers = {};
  for (const entry of entries) { const name = entry.split('/').pop().replace('.ts', ''); handlers[name] = await import(pathToFileURL(join(folder, `${name}.mjs`))); }
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_core.sql', 'utf8'));
  const db = { prepare(sql) { const statement = (args = []) => ({ bind(...values) { return statement(values); }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return { meta: sqlite.prepare(sql).run(...args) }; } }); return statement(); } };
  const env = { MINGEAGLE_DB: db, GMAIL_CLIENT_ID: 'fixture', GMAIL_CLIENT_SECRET: 'fixture', GMAIL_REFRESH_TOKEN: 'fixture' };
  let gmailCalls = 0, sentText = '';
  globalThis.fetch = async (value, init) => {
    const url = new URL(String(value));
    if (url.hostname === 'northstar.example' || url.hostname === 'austin.example') {
      const city = url.hostname === 'austin.example' ? 'Austin' : 'Dallas';
      return new Response(`<html><title>Northstar Basketball Academy</title><script type="application/ld+json">{"@type":"Organization","name":"Northstar Basketball Academy"}</script><h1>Northstar Basketball Academy</h1><p>${city} Texas basketball training academy private lessons youth programs. Register for training. Contact us.</p><a href="mailto:hello@northstar.example">hello@northstar.example</a><a href="tel:2145550186">214-555-0186</a></html>`, { headers: { 'content-type': 'text/html' } });
    }
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'fixture-only' });
    if (url.hostname === 'gmail.googleapis.com') {
      gmailCalls++; sentText = Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8');
      return Response.json({ id: 'mock-message', threadId: 'mock-thread' });
    }
    throw new Error(`Unexpected test network request: ${url.hostname}`);
  };
  const post = async (name, body) => {
    const r = await handlers[name].onRequestPost({ request: new Request(`https://test.example/api/admin/${name}`, { method: 'POST', body: JSON.stringify(body) }), env });
    return { status: r.status, body: await r.json() };
  };
  const get = async (leadId = '') => {
    const r = await handlers.communications.onRequestGet({ request: new Request(`https://test.example/api/admin/communications?leadId=${leadId}`), env });
    return { status: r.status, body: await r.json() };
  };
  const count = table => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const input = { stateCode: 'TX', customerType: 'BASKETBALL_TRAINING', city: 'Dallas', websiteUrls: ['https://northstar.example', 'https://austin.example'] };
  const imported = await post('discovery-website-v1', input);
  assert.equal(imported.status, 200); assert.equal(imported.body.intake.imported, 1); assert.equal(count('leads'), 1);
  assert.equal(imported.body.results.find(r => r.url.includes('austin')).status, 'REJECTED');
  const leadId = imported.body.intake.leadIds[0];
  assert.equal((await post('discovery-website-v1', input)).body.intake.matched, 1); assert.equal(count('leads'), 1);
  sqlite.exec(`INSERT INTO discovery_candidates(id,source_key,name,customer_type,state_region,website,source_provider,source_url,raw_json)
    VALUES ('raw-map','raw-map','Unverified Gym','BASKETBALL_GYM','TX','https://raw.example','GEOAPIFY_SCHOOL_V1','https://map.example','{"verified":false}')`);
  assert.equal((await handlers['discovery-intake'].intakeVerifiedCandidates(db, ['raw-map'])).review, 1); assert.equal(count('leads'), 1);
  assert.equal(count('messages'), 0); assert.equal(count('tasks'), 0, 'import never initiates communication');
  const draft = await post('outreach-draft', { leadId, mode: 'AUTO' });
  const { COMPANY_WEBSITE, WEBSITE_INTRO, ensureWebsiteIntro, customerGreeting } = handlers.outreach;
  assert.equal(draft.body.draftType, 'INTRO'); assert.ok(draft.body.body.includes(WEBSITE_INTRO));
  assert.ok(draft.body.body.startsWith('Hello Northstar Basketball Academy team,'));
  assert.equal(customerGreeting({ company: 'Acme', contact: 'Alex Morgan' }), 'Hi Alex,');
  assert.equal(ensureWebsiteIntro('Hello\n\nBest regards,\nMING EAGLE').includes(COMPANY_WEBSITE), true);
  assert.ok(ensureWebsiteIntro(`Hello\n\nBest regards,\nMING EAGLE\n${COMPANY_WEBSITE}`).includes(WEBSITE_INTRO), 'a signature alone is insufficient for the first website introduction');
  assert.equal(ensureWebsiteIntro(draft.body.body), draft.body.body, 'website invitation must not be duplicated');
  assert.equal(count('messages'), 0); assert.equal(count('tasks'), 0, 'draft generation is read-only');
  for (let i = 0; i < 310; i++) sqlite.prepare("INSERT INTO leads(id,status,lead_score) VALUES (?,'READY_TO_CONTACT',100)").run(`other-${i}`);
  const selected = await get(leadId);
  assert.equal(selected.body.targets[0].lead_id, leadId, 'list links must select customers beyond the default queue limit');
  assert.equal(selected.body.targets[0].outbound_count, 0);
  assert.equal((await get('missing-lead')).status, 404, 'missing selection must not fall back to another recipient');
  assert.equal((await post('customer-email-send', { leadId, subject: 'Hello', body: 'First introduction without a website' })).status, 400);
  assert.equal(gmailCalls, 0, 'missing website must be caught before any Gmail API call');
  const sent = await post('customer-email-send', { leadId, subject: draft.body.subject, body: draft.body.body });
  assert.equal(sent.status, 201); assert.equal(gmailCalls, 1); assert.ok(sentText.includes(WEBSITE_INTRO));
  assert.equal(sqlite.prepare('SELECT body FROM messages WHERE lead_id=?').get(leadId).body, draft.body.body);
  assert.equal((await get(leadId)).body.targets[0].outbound_count, 1);
  const followup = await post('outreach-draft', { leadId, mode: 'AUTO' });
  assert.equal(followup.body.draftType, 'FOLLOWUP_1'); assert.ok(followup.body.body.includes(COMPANY_WEBSITE));
  sqlite.prepare("UPDATE leads SET status='DO_NOT_CONTACT' WHERE id=?").run(leadId);
  const candidate = sqlite.prepare('SELECT id FROM discovery_candidates WHERE crm_lead_id=?').get(leadId);
  assert.equal((await handlers['discovery-intake'].intakeVerifiedCandidates(db, [candidate.id])).review, 1);
  sqlite.prepare("UPDATE discovery_candidates SET crm_lead_id=NULL,status='NEW' WHERE id=?").run(candidate.id);
  assert.equal((await handlers['discovery-intake'].intakeVerifiedCandidates(db, [candidate.id])).failed, 1);
  assert.equal(count('leads'), 311, 'suppressed organizations must not be recreated as new prospects');
  assert.equal((await post('customer-email-send', { leadId, subject: 'Hello', body: draft.body.body })).status, 409);
  assert.equal(gmailCalls, 1, 'do-not-contact protection must remain effective');
  console.log('Verified intake, deduplication, safe selection, website-first drafts and mock Gmail lifecycle passed.');
} finally { globalThis.fetch = originalFetch; rmSync(folder, { recursive: true, force: true }); }
