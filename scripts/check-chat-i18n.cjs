const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync('public/sales-assistant-i18n.js','utf8'),sandbox);
const langs=['en','es','pt','fr','de','it','nl','pl','ja'];
for(const lang of langs){const a=sandbox.window.MINGEAGLE_CHAT_LANG[lang],b=sandbox.window.MINGEAGLE_CHAT_ANSWERS[lang];assert.equal(a.length,19,lang+' UI entries');assert.equal(b.length,9,lang+' FAQ entries');assert(a.every(x=>typeof x==='string'&&x.trim()),lang+' missing UI translation');assert(b.every(x=>typeof x==='string'&&x.trim()),lang+' missing FAQ translation')}
for(const file of ['index.html','products.html','wholesale.html','wholesale-product-catalog.html','inquiry.html']){const page=fs.readFileSync('public/'+file,'utf8');assert(page.includes('sales-assistant-i18n.js'),file+' missing translations');assert(page.indexOf('sales-assistant-i18n.js')<page.indexOf('sales-assistant.js'),file+' wrong script order')}
console.log('PASS: nine-language chat UI and FAQ dictionaries, correct script inclusion/order on five pages.');
const assistant=fs.readFileSync('public/sales-assistant.js','utf8');
assert(!/\\\\[bsd]/.test(assistant),'Chat assistant contains double-escaped regex tokens');
assert(assistant.includes('quoteState.active=true'),'Quote qualification flow missing');
assert(assistant.includes('quoteState.zip=z[1]'),'ZIP capture flow missing');
function extractFunction(name){const start=assistant.indexOf('function '+name+'(');assert(start>=0,name+' function missing');let brace=assistant.indexOf('{',start),depth=0,quote='',escape=false;for(let i=brace;i<assistant.length;i++){const ch=assistant[i];if(quote){if(escape)escape=false;else if(ch==='\\\\')escape=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return assistant.slice(start,i+1)}throw Error(name+' function unclosed')}
const quoteFunction=extractFunction('isQuoteIntent');
const quoteSandbox={};vm.runInNewContext(quoteFunction+';this.quoteIntent=isQuoteIntent;',quoteSandbox);
for(const phrase of ['wholesale quote','cotización mayorista','orçamento atacado','devis vente en gros','Großhandel Angebot','preventivo ingrosso','卸売 見積','groothandel offerte','wycena hurtowa'])assert(quoteSandbox.quoteIntent(phrase),'Missing quote intent: '+phrase);
assert(assistant.includes('if(i===2){quoteState.active=true'),'Wholesale quick action must activate qualification');
console.log('PASS: nine-language wholesale quote intent and quick action flow.');
const inquiry=fs.readFileSync('public/inquiry.js','utf8');
assert(inquiry.includes('Destination postal code|Destination ZIP'),'Inquiry must accept chat postal code keys');
assert(inquiry.includes("assistantSummary.match(/Size: No\\."),'Inquiry must carry ball size');
assert(inquiry.includes("if(units&&$('estimated_quantity'))"),'Inquiry must prefill quantity tier');
console.log('PASS: sales assistant to inquiry form prefill contract.');
const capture=extractFunction('captureDetails');
const cases=[['flocked basketball','Flocked Silent Basketball Set'],['soccer ball','Flocked Silent Soccer Ball'],['balón flocado','Flocked Silent Basketball Set'],['futebol silencioso','Flocked Silent Soccer Ball'],['basket lesté','Weighted Flocked Silent Basketball'],['basket lestée','Weighted Flocked Silent Basketball'],['Basketball aus Stoff','Fabric-Cover Silent Basketball Set'],['basket appesantito','Weighted Flocked Silent Basketball'],['geflockte basketbal','Flocked Silent Basketball Set'],['piłka obciążona','Weighted Flocked Silent Basketball'],['フロック バスケットボール','Flocked Silent Basketball Set'],['静音サッカー','Flocked Silent Soccer Ball']];
for(const [phrase,expected] of cases){const ctx={quoteState:{model:'',size:'',quantity:'',zip:''}};vm.runInNewContext(capture+'; captureDetails('+JSON.stringify(phrase)+')',ctx);assert.equal(ctx.quoteState.model,expected,'Product recognition failed for '+phrase)}
console.log('PASS: multilingual product routing test cases.');
const flowCtx={quoteState:{model:'',size:'',quantity:'',zip:''}};const capCtx={quoteState:flowCtx.quoteState};vm.runInNewContext(capture+';this.captureDetails=captureDetails;',capCtx);capCtx.captureDetails('flocked basketball');assert.equal(capCtx.quoteState.model,'Flocked Silent Basketball Set');capCtx.captureDetails('5');assert.equal(capCtx.quoteState.size,'5','Standalone size should be accepted');capCtx.captureDetails('100');assert.equal(capCtx.quoteState.quantity,'100','Standalone unit count should be accepted');assert.equal(capCtx.quoteState.zip,'','Unit count must not double as ZIP');capCtx.captureDetails('Orange');assert.equal(capCtx.quoteState.zip,'','Color must not be confused with postal code');capCtx.captureDetails('flocked');assert.equal(capCtx.quoteState.zip,'','Product text must not be confused with postal code');capCtx.captureDetails('75201');assert.equal(capCtx.quoteState.zip,'75201','US postal code should be accepted at postal step');console.log('PASS: model → size → quantity → postal code stateful checkout.');
assert(assistant.includes("if(isQuoteIntent(q)&&!quoteState.active){"),'New wholesale request must start a fresh quote');assert(assistant.includes("quoteState.model='';quoteState.size='';quoteState.quantity='';quoteState.zip=''"),'New quote must clear earlier customer choices');console.log('PASS: restart quote clears previously collected customer fields.');
const sizeFunction=extractFunction('supportedSizes');const sizeCtx={};vm.runInNewContext(sizeFunction+';this.supportedSizes=supportedSizes;',sizeCtx);const asPlain=x=>Array.from(x);assert.deepEqual(asPlain(sizeCtx.supportedSizes('Flocked Silent Basketball Set')),['3','5','7']);assert.deepEqual(asPlain(sizeCtx.supportedSizes('Fabric-Cover Silent Basketball Set')),['3','5','7']);assert.deepEqual(asPlain(sizeCtx.supportedSizes('Weighted Flocked Silent Basketball')),['3','4','6','7']);assert.deepEqual(asPlain(sizeCtx.supportedSizes('Flocked Silent Soccer Ball')),['5']);assert(assistant.includes('!supportedSizes(quoteState.model).includes(quoteState.size)'),'Invalid model and size pairs must be refused');console.log('PASS: assistant validates product-specific ball sizes.');
const handoff=fs.readFileSync('public/inquiry.js','utf8');assert(handoff.includes("!message.value.includes(assistantSummary)"),'AI quote must not duplicate the handoff summary');assert(handoff.includes("[message.value,'Information collected by the automated website assistant"),'AI quote must preserve existing buyer text and exact details together');console.log('PASS: inquiry prefill retains buyer text and exact AI quote specifications.');
assert(assistant.includes("if(!quoteState.size)quoteState.size='5'"),'Soccer quote should auto-select its only supported size');
const soccerCtx={quoteState:{model:'',size:'',quantity:'',zip:''}};vm.runInNewContext(capture+';captureDetails("100 silent soccer balls");this.state=quoteState;',soccerCtx);assert.equal(soccerCtx.state.model,'Flocked Silent Soccer Ball');assert.equal(soccerCtx.state.size,'5');assert.equal(soccerCtx.state.quantity,'100');
console.log('PASS: soccer quote auto-selects size No. 5.');
function captureState(phrases,initial={}){const ctx={quoteState:{model:'',size:'',quantity:'',zip:'',...initial}};vm.runInNewContext(capture+';this.captureDetails=captureDetails;',ctx);for(const phrase of phrases)ctx.captureDetails(phrase);return ctx.quoteState}
for(const phrase of ['100 balls','100 silent soccer balls','100 flocked basketball sets','100 weighted flocked silent basketball units','100 fabric-cover silent basketball sets']){
 const state=captureState([phrase]);assert.equal(state.quantity,'100','Descriptive quantity not captured: '+phrase);assert.equal(state.zip,'','Quantity must not become postal code: '+phrase);
}
for(const phrase of ['size 5 silent soccer balls','No. 5 balls','ZIP 75244 balls','50 to 100 balls','50-100 balls','0 balls','-100 balls','1.5 balls','100000 balls'])assert.equal(captureState([phrase]).quantity,'','Ambiguous or invalid count must not be guessed: '+phrase);
const combined=captureState(['100 silent soccer balls size 5 ZIP 75244']);assert.equal(combined.model,'Flocked Silent Soccer Ball');assert.equal(combined.size,'5');assert.equal(combined.quantity,'100');assert.equal(combined.zip,'75244');
const revised=captureState(['200 balls','size 7','Orange','75244'],{model:'Flocked Silent Basketball Set',size:'5',quantity:'100'});assert.equal(revised.quantity,'200');assert.equal(revised.size,'7');assert.equal(revised.zip,'75244','Count/size revisions must not fill postal code');
console.log('PASS: descriptive counts, invalid/ambiguous numbers, combined details and count/size revision boundaries.');
const internationalCounts=[
 ['100 silent soccer balls','Flocked Silent Soccer Ball'],
 ['100 balones de fútbol','Flocked Silent Soccer Ball'],
 ['100 bolas de futebol','Flocked Silent Soccer Ball'],
 ['100 ballons de football','Flocked Silent Soccer Ball'],
 ['100 Fußballbälle','Flocked Silent Soccer Ball'],
 ['100 palloni da calcio','Flocked Silent Soccer Ball'],
 ['100 stille voetbalballen','Flocked Silent Soccer Ball'],
 ['100 cichych piłek nożnych','Flocked Silent Soccer Ball'],
 ['100 静音サッカーボール','Flocked Silent Soccer Ball'],
 ['静音サッカーボール１００個','Flocked Silent Soccer Ball'],
];
for(const [phrase,model] of internationalCounts){const state=captureState([phrase]);assert.equal(state.quantity,'100',phrase);assert.equal(state.model,model,phrase);assert.equal(state.zip,'',phrase+' must not populate postal code');}
for(const phrase of ['50–100 balones','50 a 100 bolas','50 bis 100 Bälle','50/100 palloni','50 tot 100 ballen','50 lub 100 piłek','50 balls or 100 balls','0 ballons','-100 palloni','1.5 ballen','100000 sztuk','100+ balones'])assert.equal(captureState([phrase]).quantity,'','Ambiguous count must remain unconfirmed: '+phrase);
for(const phrase of ['talla 5 balones','taille 5 ballons','Größe 5 Bälle','taglia 5 palloni','maat 5 ballen','rozmiar 5 piłek','PLZ 75244 Bälle','kod pocztowy 75244 piłek','郵便番号75244個'])assert.equal(captureState([phrase]).quantity,'','Size/postal identifier is not a quantity: '+phrase);
const invalidRevision=captureState(['0 ballons'],{model:'Flocked Silent Soccer Ball',size:'5',quantity:'100'});assert.equal(invalidRevision.quantity,'');assert.equal(invalidRevision.zip,'','Invalid quantity must not become ZIP');
console.log('PASS: nine-language descriptive quantities, full-width Japanese digits, range rejection and multilingual size/postal separation.');

for(const phrase of ['1 balón de fútbol','1 pallone da calcio','1 unidad','1 piłka'])assert.equal(captureState([phrase]).quantity,'1',phrase);
for(const phrase of ['−100 balls','1½ balls'])assert.equal(captureState([phrase]).quantity,'','Unicode negative/fraction must not become a partial count: '+phrase);
