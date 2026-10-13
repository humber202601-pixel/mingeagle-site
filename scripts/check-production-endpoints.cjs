'use strict';
const assert = require('node:assert/strict');

const BASE = 'https://www.mingeagle.com/';
const CRM = 'https://app.mingeagle.com/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url, fetcher) {
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {'accept': 'application/json', 'cache-control': 'no-cache', 'user-agent': 'MING-EAGLE-production-smoke/1.0'},
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(url + ' returned HTTP ' + response.status);
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error(url + ' returned invalid JSON');
  return data;
}

async function checkProduction({expectedRevision, fetcher=globalThis.fetch, attempts=4, delay=sleep}={}) {
  assert.match(expectedRevision || '', /^[a-f0-9]{40}$/i, 'Expected full main commit SHA');
  assert(Number.isInteger(attempts) && attempts >= 1 && attempts <= 8, 'Invalid attempt limit');

  let publicVersion;
  for (let i=0; i<attempts; i++) {
    try {
      publicVersion = await getJson(BASE+'deployment-version.json', fetcher);
      if (publicVersion.revision === expectedRevision) break;
    } catch (error) {
      if (i===attempts-1) throw error;
    }
    if (i===attempts-1) throw new Error('Public site version does not match main: '+String(publicVersion?.revision));
    await delay(10000);
  }
  assert.equal(publicVersion.workflow, 'github-pages', 'Unexpected website deployment workflow');

  const [health, crmPrices, publicPrices] = await Promise.all([
    getJson(CRM+'api/health',fetcher),
    getJson(CRM+'api/quote-reference',fetcher),
    getJson(BASE+'retail-reference-prices.json',fetcher),
  ]);
  assert.equal(health.ok,true,'CRM health endpoint must be OK');
  assert.equal(health.databaseBinding,true,'CRM D1 database binding is absent');
  assert.equal(health.databaseReadOk,true,'CRM D1 read query failed');
  assert.equal(health.schedulerReadOk,true,'CRM Cron heartbeat query failed');
  for (const job of ['discovery','hubspotRecovery','dailyFollowup']) {
    assert.equal(health.scheduler?.[job],'healthy','CRM Cron heartbeat is missing or stale: '+job);
  }
  assert.equal(health.service,'MING EAGLE V2 API','Unexpected CRM service');
  assert.equal(crmPrices.ok,true,'CRM quote reference endpoint not OK');
  assert.equal(crmPrices.testEnvironment,false,'CRM production domain points to preview settings');
  assert.equal(crmPrices.catalog?.currency,'USD','CRM catalog currency changed');
  assert.equal(Object.keys(crmPrices.catalog?.products||{}).length,4,'Expected four verified products');
  assert.deepEqual(crmPrices.catalog,publicPrices,'CRM and public retail reference prices differ');

  // Public crawl assets must be served as documents, not a branded 404 fallback.
  for (const [path,needle] of [
    ['robots.txt','Sitemap: https://www.mingeagle.com/sitemap.xml'],
    ['sitemap.xml','<urlset'],
    ['llms.txt','MING EAGLE']
  ]) {
    const url=BASE+path;
    const response=await fetcher(url,{
      method:'GET',redirect:'follow',
      headers:{'accept':'text/plain, application/xml, text/xml','cache-control':'no-cache','user-agent':'MING-EAGLE-production-smoke/1.0'},
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw new Error('Public discovery asset '+path+' returned HTTP '+response.status);
    const body=await response.text();
    if(!body.includes(needle))throw new Error('Public discovery asset '+path+' has unexpected content');
  }

  return {revision:expectedRevision,crmBinding:true,priceProducts:4,priceCatalogsMatch:true,discoveryAssets:3};
}

if (require.main===module) {
  checkProduction({expectedRevision:process.env.EXPECTED_MAIN_SHA || process.env.GITHUB_SHA})
    .then(result=>console.log('PASS: read-only production smoke',JSON.stringify(result)))
    .catch(error=>{console.error('FAIL: production smoke',error.message);process.exitCode=1;});
}
module.exports={checkProduction,getJson};
