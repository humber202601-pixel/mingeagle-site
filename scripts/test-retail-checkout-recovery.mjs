import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
const js=(await transform(readFileSync('src/retailCheckoutIntent.ts','utf8'),{loader:'ts',format:'esm',target:'es2022'})).code;
const {checkoutIntentKey,checkoutIntentId,clearCheckoutIntent,checkoutSupportUrl}
 =await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const lines=[
 {sku:'P1-S7',color:'Orange',quantity:1},
 {sku:'P1-S3',color:'Blue',quantity:2}
];
const sameCart=[...lines].reverse();
const changedCart=[{sku:'P1-S7',color:'Orange',quantity:2},{sku:'P1-S3',color:'Blue',quantity:2}];
assert.equal(checkoutIntentKey(lines),checkoutIntentKey(sameCart),'Cart line order must not accidentally create another order identity');
assert.notEqual(checkoutIntentKey(lines),checkoutIntentKey(changedCart),'Changing the basket must start a fresh checkout intent');
const map=new Map();
const storage={
 getItem:k=>map.get(k)||null,
 setItem:(k,v)=>map.set(k,v),
 removeItem:k=>map.delete(k)
};
const idA='a7cb33cf-220b-496d-a123-8b837e57c543';
const idB='28b439f9-5779-4799-8986-6d88491fbb10';
let generated=0;
const next=()=>{generated++;return generated===1?idA:idB};
assert.equal(checkoutIntentId(lines,storage,next),idA);
assert.equal(checkoutIntentId(sameCart,storage,next),idA,'After network loss/reload, retry must use same backend idempotency key');
assert.equal(generated,1);
assert.equal(checkoutIntentId(changedCart,storage,next),idB);
assert.equal(generated,2);
assert(![...map.keys()].some(k=>k.includes('street')||k.includes('email')),'Never store address, customer email or card data in checkout intent');
const support=new URL(checkoutSupportUrl(idA));
assert.equal(support.protocol,'mailto:');
assert.equal(support.pathname,'mingeaglecommerce@gmail.com');
assert(support.searchParams.get('subject').includes(idA));
assert(!support.searchParams.get('body').includes('password'));
assert.throws(()=>checkoutSupportUrl('customer-email@example.com'),'Do not accept arbitrary support-reference text');
clearCheckoutIntent(lines,storage);
assert.equal(storage.getItem(checkoutIntentKey(lines)),null);
assert.equal(checkoutIntentId(lines,storage,()=>idA),idA);
const broken={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){throw Error('denied')}};
assert.equal(checkoutIntentId(lines,broken,()=>idA),idA,'Storage-disabled browsers must retain in-page fallback');
clearCheckoutIntent(lines,broken);
const ui=readFileSync('src/RetailCheckout.tsx','utf8');
const endpoint=readFileSync('functions/api/retail/checkout.ts','utf8');
assert(ui.includes('checkoutIntentId(lines,typeof sessionStorage'),'Actual checkout page must persist a cart-specific UUID');
assert(ui.includes('checkoutSupportUrl(requestId)'),'Error UI must provide a recovery contact link');
assert(ui.includes('Checkout request reference: <code>{requestId}</code>'),'Buyer receives a non-PII traceable reference');
assert(ui.includes('if(response.status===409&&/^Checkout request already received/'),'Client must explicitly recognize backend duplicate intent');
assert(ui.includes('setNeedsOrderReview(true)'),'A confirmed duplicate must not allow uncontrolled resubmission');
assert(ui.includes('disabled={busy||needsOrderReview'),'Submit button must be disabled after a known duplicate');
assert(ui.includes('A failed network response does not prove that no order was created'),'Do not falsely report abandoned order');
assert(endpoint.includes("if(previous)return bad('Checkout request already received."),'Backend duplicate response must not promise an inaccessible previous order link');
assert(endpoint.includes('SELECT request_id FROM retail_checkout_requests WHERE request_id=?'),'Backend idempotency gate is retained');
assert(!ui.includes('window.localStorage.setItem'),'Do not store checkout PII or bearer payment URLs in localStorage');
console.log('PASS: sample checkout survives reload with same UUID, new basket creates new intent, known duplicates fail closed with manual recovery and no money movement.');
