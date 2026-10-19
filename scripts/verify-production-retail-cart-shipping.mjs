import assert from 'node:assert/strict';

const origin = 'https://app.mingeagle.com';
const cases = [
  {
    name: 'one P1-S3 set',
    lines: [{ sku: 'P1-S3', quantity: 1 }],
    expected: { productsUSD: 9.90, shippingUSD: 11.50, totalBeforeTaxesUSD: 21.40, quantity: 1 },
  },
  {
    name: 'two P1-S7 sets',
    lines: [{ sku: 'P1-S7', quantity: 2 }],
    expected: { productsUSD: 29.80, shippingUSD: 28.00, totalBeforeTaxesUSD: 57.80, quantity: 2 },
  },
  {
    name: 'mixed P1-S3 and P1-S7 sets',
    lines: [{ sku: 'P1-S3', quantity: 1 }, { sku: 'P1-S7', quantity: 1 }],
    expected: { productsUSD: 24.80, shippingUSD: 25.50, totalBeforeTaxesUSD: 50.30, quantity: 2 },
  },
  {
    name: 'nine P1-S7 sets',
    lines: [{ sku: 'P1-S7', quantity: 9 }],
    expected: { productsUSD: 134.10, shippingUSD: 126.00, totalBeforeTaxesUSD: 260.10, quantity: 9 },
  },
];

async function postCart(body) {
  return fetch(origin + '/api/shipping/cart', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'cache-control': 'no-cache',
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
}

for (const test of cases) {
  const response = await postCart({
    country: 'US',
    method: 'air',
    lines: test.lines,
  });
  assert.equal(response.status, 200, test.name + ': expected HTTP 200');
  const data = await response.json();
  assert.equal(data.ok, true, test.name + ': API must return ok');
  assert.equal(data.wholesale, false, test.name + ': retail response must explicitly say wholesale=false');
  assert.equal(data.ddpConfirmed, true, test.name + ': only approved duty-paid SKUs are used');
  assert.equal(data.quantity, test.expected.quantity, test.name + ': quantity mismatch');
  // The legacy single-item response uses productUSD; multi-item responses use productsUSD.
  const productsUSD = data.productsUSD ?? data.productUSD;
  assert.equal(
    Math.round(Number(productsUSD) * 100),
    Math.round(test.expected.productsUSD * 100),
    test.name + ': product amount mismatch',
  );
  for (const field of ['shippingUSD', 'totalBeforeTaxesUSD']) {
    assert.equal(
      Math.round(Number(data[field]) * 100),
      Math.round(test.expected[field] * 100),
      test.name + ': ' + field + ' mismatch',
    );
  }
  assert.equal(
    Math.round(Number(data.totalBeforeTaxesUSD) * 100),
    Math.round(Number(productsUSD) * 100) + Math.round(Number(data.shippingUSD) * 100),
    test.name + ': total must equal product plus shipping before sales tax',
  );
  if (test.expected.quantity > 1) {
    assert.equal(data.shippingPlan, 'ONE_UNIT_PER_PARCEL', test.name + ': preserve separate-parcel contract');
    assert.equal(data.parcelCount, test.expected.quantity, test.name + ': every set must have its own parcel');
    assert.match(String(data.notice || ''), /parcels may arrive separately/i, test.name + ': disclose separate parcel delivery');
  }
  console.log('PASS ' + test.name + ': products $' + test.expected.productsUSD.toFixed(2) +
    ' + shipping $' + test.expected.shippingUSD.toFixed(2) +
    ' = $' + test.expected.totalBeforeTaxesUSD.toFixed(2) + ' before sales tax');
}

const overLimit = await postCart({
  country: 'US',
  method: 'air',
  lines: [{ sku: 'P1-S7', quantity: 10 }],
});
assert.equal(overLimit.status, 409, '10-unit air basket must not be treated as retail checkout');
const overLimitData = await overLimit.json();
assert.equal(overLimitData.wholesale, true, '10+ units must be routed to wholesale');
assert.equal(overLimitData.shippingConsentRequired, true, '10+ units must require sea-freight consent');
console.log('PASS 10-unit air basket is blocked and routed to the wholesale sea-freight quote path.');
console.log('READ-ONLY: this check does not create an order, customer record, Stripe Checkout Session, or charge.');
