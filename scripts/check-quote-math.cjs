const assert=require('node:assert/strict');
const {calculate,calculateFromCatalog}=require('../public/quote-math.js');
const prices=require('../public/retail-reference-prices.json');
const example=calculate({retailUnitPrice:'11.90',wholesaleUnitPrice:'8.50',quantity:100});
assert.deepEqual({total:example.wholesaleTotal,saved:example.savingsTotal,percent:example.discountPercent},{total:'850.00',saved:'340.00',percent:28.57});
assert.equal(calculate({retailUnitPrice:9.9,wholesaleUnitPrice:8.01,quantity:3}).savingsTotal,'5.67');
assert.equal(calculate({retailUnitPrice:'12.90',wholesaleUnitPrice:'12.90',quantity:1}).discountPercent,0);
for(const data of [
 {retailUnitPrice:11.90,wholesaleUnitPrice:12,quantity:100},
 {retailUnitPrice:11.90,wholesaleUnitPrice:-1,quantity:100},
 {retailUnitPrice:11.90,wholesaleUnitPrice:8.5,quantity:0},
 {retailUnitPrice:11.90,wholesaleUnitPrice:8.5,quantity:1.5},
 {retailUnitPrice:11.90,wholesaleUnitPrice:8.555,quantity:1}
])assert.throws(()=>calculate(data));
const linked=calculateFromCatalog(prices,{productId:'p1',size:'No. 5',quantity:100,wholesaleUnitPrice:'8.50'});
assert.equal(linked.retailUnitPrice,'11.90');
assert.equal(linked.savingsTotal,'340.00');
assert.equal(linked.size,'No. 5');
assert.throws(()=>calculateFromCatalog(prices,{productId:'p3',size:'No. 5',quantity:100,wholesaleUnitPrice:'8.50'}));
assert.throws(()=>calculateFromCatalog(prices,{productId:'p5',size:'5',quantity:100,wholesaleUnitPrice:'8.50'}));
assert.equal(example.approved,false);
assert.equal(example.shippingAndTaxIncluded,false);
console.log('PASS: exact cents-based quote calculations, discount and unsafe input checks.');
