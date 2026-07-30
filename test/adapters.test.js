'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSetName,
  productMatchesSet,
  classifyProduct,
  parseShopifyProduct,
  parseWooProduct,
  parseMagentoProduct,
  parseJsonLdProducts,
  sameStoreUrl
} = require('../server');

const store = { name: 'Testbutikk', baseUrl: 'https://butikk.no' };

test('normaliserer settnavn', () => {
  assert.equal(normalizeSetName('Pokémon TCG: Scarlet & Violet — Destined Rivals'), 'scarlet and violet destined rivals');
});

test('matcher settnavn uten å matche et annet sett', () => {
  assert.equal(productMatchesSet({ title: 'Pokémon TCG SV10 Destined Rivals Booster Bundle' }, 'Destined Rivals'), true);
  assert.equal(productMatchesSet({ title: 'Pokémon TCG Journey Together Booster Pack' }, 'Destined Rivals'), false);
});

test('klassifiserer produkttype', () => {
  assert.equal(classifyProduct('Pokémon Destined Rivals Elite Trainer Box'), 'Elite Trainer Box');
  assert.equal(classifyProduct('Destined Rivals Booster Display'), 'Booster Display');
});

test('parser Shopify-produkt og beholder direkte URL', () => {
  const product = parseShopifyProduct({
    id: 1,
    handle: 'destined-rivals-booster',
    title: 'Pokemon Destined Rivals Booster Pack',
    variants: [{ price: '79.00', available: true }]
  }, store);
  assert.equal(product.price, 79);
  assert.equal(product.inStock, true);
  assert.equal(product.url, 'https://butikk.no/products/destined-rivals-booster');
});

test('parser WooCommerce-produkt', () => {
  const product = parseWooProduct({
    id: 2,
    name: 'Pokemon Destined Rivals Booster',
    permalink: 'https://butikk.no/produkt/destined-rivals',
    is_in_stock: false,
    prices: { price: '9900', currency_minor_unit: 2 }
  }, store);
  assert.equal(product.price, 99);
  assert.equal(product.inStock, false);
});


test('parser Adobe Commerce-produkt', () => {
  const product = parseMagentoProduct({
    sku: 'SV10-BB',
    name: 'Pokemon Destined Rivals Booster Box',
    url_key: 'pokemon-destined-rivals-booster-box',
    stock_status: 'IN_STOCK',
    price_range: { minimum_price: { final_price: { value: 1599 }, regular_price: { value: 1699 } } }
  }, store);
  assert.equal(product.price, 1599);
  assert.equal(product.inStock, true);
  assert.equal(product.url, 'https://butikk.no/pokemon-destined-rivals-booster-box.html');
});

test('parser JSON-LD-produkt', () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"Pokemon Destined Rivals Booster","url":"https://butikk.no/produkt/rivals","offers":{"@type":"Offer","price":"89.00","availability":"https://schema.org/InStock"}}</script>`;
  const products = parseJsonLdProducts(html, 'https://butikk.no/produkt/rivals', store);
  assert.equal(products.length, 1);
  assert.equal(products[0].price, 89);
  assert.equal(products[0].inStock, true);
});

test('avviser eksterne produktlenker', () => {
  assert.equal(sameStoreUrl('https://google.com/search?q=test', store), null);
});
