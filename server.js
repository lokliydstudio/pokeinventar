'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const stores = require('./store-sources');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const USER_AGENT = process.env.CRAWLER_USER_AGENT || 'PokeInventar/1.0 (+https://pokeinventar.no; kontakt@pokeinventar.no)';
const REFRESH_MS = Number(process.env.REFRESH_MINUTES || 15) * 60_000;
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 8_000);
const ALLOW_HTML_FALLBACK = process.env.ALLOW_HTML_FALLBACK !== 'false';
const MAX_SHOPIFY_PAGES = Number(process.env.MAX_SHOPIFY_PAGES || 5);
const MAX_WOO_PAGES = Number(process.env.MAX_WOO_PAGES || 4);
const MAX_HTML_PRODUCT_PAGES = Number(process.env.MAX_HTML_PRODUCT_PAGES || 6);
const MAX_HTML_SEARCH_PATHS = Number(process.env.MAX_HTML_SEARCH_PATHS || 2);
const ERROR_BACKOFF_MS = Number(process.env.ERROR_BACKOFF_MINUTES || 10) * 60_000;
const STORE_CONCURRENCY = Number(process.env.STORE_CONCURRENCY || 8);
const CACHE_FILE = path.join(ROOT, 'live-cache.json');

const catalogCache = new Map();
const setOfferCache = new Map();
let warmupPromise = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeSetName(value) {
  return normalize(value)
    .replace(/\b(pokemon|tcg)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SET_ALIASES = new Map([
  ['collect 151', ['151', 'pokemon 151', 'sv 3 5']],
  ['151', ['151', 'pokemon 151', 'sv 3 5']],
  ['pokemon go', ['pokemon go', 'pokémon go']],
  ['glory of team rocket', ['glory of team rocket', 'the glory of team rocket']],
  ['ruler of the black flame', ['ruler of the black flame', 'black flame ruler']],
  ['jet black spirit', ['jet black spirit', 'jet black poltergeist']],
  ['vstar universe', ['vstar universe', 'v star universe']],
  ['vmax climax', ['vmax climax', 'v max climax']],
  ['shiny star v', ['shiny star v']],
  ['terastal festival', ['terastal festival', 'terastal festival ex']],
  ['white flare', ['white flare']],
  ['black bolt', ['black bolt']],
  ['destined rivals', ['destined rivals', 'sv10']],
  ['journey together', ['journey together', 'sv9']],
  ['prismatic evolutions', ['prismatic evolutions', 'sv8 5']],
  ['surging sparks', ['surging sparks', 'sv8']],
  ['stellar crown', ['stellar crown', 'sv7']],
  ['shrouded fable', ['shrouded fable', 'sv6 5']],
  ['twilight masquerade', ['twilight masquerade', 'sv6']],
  ['temporal forces', ['temporal forces', 'sv5']],
  ['paldean fates', ['paldean fates', 'sv4 5']],
  ['paradox rift', ['paradox rift', 'sv4']],
  ['obsidian flames', ['obsidian flames', 'sv3']],
  ['paldea evolved', ['paldea evolved', 'sv2']],
  ['scarlet and violet', ['scarlet violet base', 'scarlet and violet base', 'sv1']],
  ['crown zenith', ['crown zenith']],
  ['silver tempest', ['silver tempest']],
  ['lost origin', ['lost origin']],
  ['astral radiance', ['astral radiance']],
  ['brilliant stars', ['brilliant stars']],
  ['fusion strike', ['fusion strike']],
  ['evolving skies', ['evolving skies']],
  ['celebrations', ['celebrations']],
  ['chilling reign', ['chilling reign']],
  ['battle styles', ['battle styles']],
  ['shining fates', ['shining fates']],
  ['vivid voltage', ['vivid voltage']],
  ['champion s path', ['champions path', "champion's path"]],
  ['darkness ablaze', ['darkness ablaze']],
  ['rebel clash', ['rebel clash']],
  ['cosmic eclipse', ['cosmic eclipse']],
  ['hidden fates', ['hidden fates']]
]);

function aliasesFor(setName) {
  const key = normalizeSetName(setName);
  const direct = SET_ALIASES.get(key) || [];
  return [...new Set([key, ...direct.map(normalizeSetName)].filter(Boolean))];
}

function productMatchesSet(product, setName) {
  const haystack = normalizeSetName(`${product.title || ''} ${product.tags || ''} ${product.description || ''}`);
  if (!haystack) return false;
  const pokemonSignal = /\b(pokemon|pokémon|sv\d+|swsh|sun moon|scarlet|violet)\b/i.test(`${product.title || ''} ${product.tags || ''} ${product.description || ''}`);
  const aliases = aliasesFor(setName);
  const matched = aliases.some(alias => {
    if (/^\d+$/.test(alias)) return new RegExp(`(^|\\s)${alias}(\\s|$)`).test(haystack);
    const tokens = alias.split(' ').filter(token => token.length > 1);
    return tokens.length > 0 && tokens.every(token => haystack.includes(token));
  });
  const productSignal = /\b(booster|pack|pakke|display|elite trainer|collection|blister|tin|album|portfolio|kort|cards?)\b/i.test(`${product.title || ''} ${product.description || ''}`);
  return matched && (pokemonSignal || productSignal || aliases.some(alias => alias.split(' ').length >= 2));
}

function classifyProduct(title) {
  const value = normalize(title);
  if (value.includes('booster box') || value.includes('booster display') || value.includes('display boks')) return 'Booster Display';
  if (value.includes('booster bundle')) return 'Booster Bundle';
  if (value.includes('elite trainer') || /\betb\b/.test(value)) return 'Elite Trainer Box';
  if (value.includes('blister')) return 'Blisterpakke';
  if (value.includes('collection')) return 'Collection Box';
  if (value.includes('mini tin') || value.includes('tin boks')) return 'Tin';
  if (value.includes('build battle')) return 'Build & Battle';
  if (value.includes('booster') || value.includes('pack') || value.includes('pakke')) return 'Boosterpakke';
  if (value.includes('portfolio') || value.includes('album') || value.includes('perm')) return 'Album/perm';
  return 'Pokémon-produkt';
}

function sameStoreUrl(candidate, store) {
  try {
    const url = new URL(candidate, store.baseUrl);
    const base = new URL(store.baseUrl);
    const host = url.hostname.replace(/^www\./, '');
    const baseHost = base.hostname.replace(/^www\./, '');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!(host === baseHost || host.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${host}`))) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'nb-NO,nb;q=0.9,en;q=0.7',
        accept: options.accept || '*/*',
        ...(options.headers || {})
      }
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function htmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value) {
  return htmlEntities(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function money(value) {
  let text = String(value ?? '').replace(/[\s\u00a0]/g, '').replace(/[^0-9,.-]/g, '');
  if (!text) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    text = text.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    text = text.replace(/,/g, '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    const last = text.lastIndexOf('.');
    text = text.slice(0, last).replace(/\./g, '') + text.slice(last);
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function parseShopifyProduct(raw, store) {
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const prices = variants.map(v => money(v.price)).filter(v => v != null);
  const availableVariants = variants.filter(v => v.available === true);
  const handle = raw.handle || raw.id;
  const url = sameStoreUrl(`/products/${encodeURIComponent(handle)}`, store);
  if (!url) return null;
  return {
    id: String(raw.id || handle),
    title: stripHtml(raw.title),
    description: stripHtml(raw.body_html || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.join(' ') : String(raw.tags || ''),
    price: prices.length ? Math.min(...prices) : null,
    compareAtPrice: variants.map(v => money(v.compare_at_price)).filter(v => v != null).sort((a,b)=>a-b)[0] ?? null,
    inStock: availableVariants.length > 0,
    quantity: null,
    image: raw.images?.[0]?.src || raw.image?.src || null,
    url,
    productType: classifyProduct(raw.title),
    source: 'Shopify Ajax API'
  };
}

function parseWooProduct(raw, store) {
  const minor = Number(raw.prices?.currency_minor_unit ?? 2);
  const divisor = 10 ** minor;
  const rawPrice = raw.prices?.price;
  const price = rawPrice == null ? null : Number(rawPrice) / divisor;
  const url = sameStoreUrl(raw.permalink || raw.link || raw.url, store);
  if (!url) return null;
  return {
    id: String(raw.id || raw.slug || url),
    title: stripHtml(raw.name),
    description: stripHtml(raw.short_description || raw.description || ''),
    tags: [raw.categories?.map(x => x.name), raw.tags?.map(x => x.name)].flat(2).filter(Boolean).join(' '),
    price: Number.isFinite(price) ? price : null,
    compareAtPrice: null,
    inStock: raw.is_in_stock === true || raw.stock_status === 'instock',
    quantity: raw.low_stock_remaining ?? null,
    image: raw.images?.[0]?.src || null,
    url,
    productType: classifyProduct(raw.name),
    source: 'WooCommerce Store API'
  };
}

function parseMagentoProduct(raw, store) {
  const rewrites = Array.isArray(raw.url_rewrites) ? raw.url_rewrites : [];
  const rewrite = rewrites.find(item => item?.url && item.url !== 'no-route')?.url;
  const pathName = rewrite || (raw.url_key ? `${raw.url_key}.html` : null);
  const url = pathName ? sameStoreUrl(pathName, store) : null;
  if (!url) return null;
  const minimum = raw.price_range?.minimum_price || {};
  const price = money(minimum.final_price?.value ?? minimum.regular_price?.value);
  return {
    id: String(raw.sku || raw.uid || url),
    title: stripHtml(raw.name),
    description: stripHtml(raw.short_description?.html || raw.description?.html || ''),
    tags: '',
    price,
    compareAtPrice: money(minimum.regular_price?.value),
    inStock: String(raw.stock_status || '').toUpperCase() === 'IN_STOCK',
    quantity: null,
    image: raw.small_image?.url || raw.image?.url || null,
    url,
    productType: classifyProduct(raw.name),
    source: 'Adobe Commerce GraphQL'
  };
}

async function fetchMagentoProducts(store, setName) {
  const endpoint = new URL('/graphql', store.baseUrl);
  const query = `query PokeInventarProducts($search: String!) {
    products(search: $search, pageSize: 40, currentPage: 1) {
      items {
        uid sku name url_key stock_status
        url_rewrites { url }
        small_image { url }
        short_description { html }
        price_range {
          minimum_price {
            regular_price { value currency }
            final_price { value currency }
          }
        }
      }
    }
  }`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    accept: 'application/json',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { search: `pokemon ${setName}` } })
  });
  if (!response.ok) throw new Error(`Adobe Commerce ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error('Adobe Commerce GraphQL avviste spørringen');
  const items = payload.data?.products?.items;
  if (!Array.isArray(items)) throw new Error('Ugyldig Adobe Commerce-respons');
  return items.map(item => parseMagentoProduct(item, store)).filter(product => product && productMatchesSet(product, setName));
}

async function fetchShopifyProducts(store, setName) {
  const endpoint = new URL('/search/suggest.json', store.baseUrl);
  endpoint.searchParams.set('q', `pokemon ${setName}`);
  endpoint.searchParams.set('resources[type]', 'product');
  endpoint.searchParams.set('resources[limit]', '10');
  endpoint.searchParams.set('resources[options][unavailable_products]', 'show');
  const response = await fetchWithTimeout(endpoint, { accept: 'application/json' });
  if (!response.ok) throw new Error(`Shopify søk ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) throw new Error('Ikke Shopify søke-JSON');
  const payload = await response.json();
  const suggestions = payload.resources?.results?.products;
  if (!Array.isArray(suggestions)) throw new Error('Ugyldig Shopify søkerespons');

  const products = [];
  await mapLimit(suggestions, 4, async suggestion => {
    const direct = sameStoreUrl(suggestion.url, store);
    if (!direct) return;
    const productUrl = new URL(direct);
    productUrl.search = '';
    productUrl.pathname = productUrl.pathname.replace(/\/$/, '') + '.js';
    try {
      const productResponse = await fetchWithTimeout(productUrl, { accept: 'application/json' });
      if (!productResponse.ok) return;
      const raw = await productResponse.json();
      const parsed = parseShopifyProduct(raw, store);
      if (parsed && productMatchesSet(parsed, setName)) products.push(parsed);
    } catch {}
  });
  return products;
}

async function fetchShopifyCatalog(store) {
  const products = [];
  for (let page = 1; page <= MAX_SHOPIFY_PAGES; page += 1) {
    const endpoint = new URL('/products.json', store.baseUrl);
    endpoint.searchParams.set('limit', '250');
    endpoint.searchParams.set('page', String(page));
    const response = await fetchWithTimeout(endpoint, { accept: 'application/json' });
    if (!response.ok) { if (page > 1 && [400, 404, 422].includes(response.status)) break; throw new Error(`Shopify ${response.status}`); }
    const type = response.headers.get('content-type') || '';
    if (!type.includes('json')) throw new Error('Ikke Shopify JSON');
    const payload = await response.json();
    if (!Array.isArray(payload.products)) throw new Error('Ugyldig Shopify-respons');
    const parsed = payload.products.map(item => parseShopifyProduct(item, store)).filter(Boolean);
    products.push(...parsed);
    if (payload.products.length < 250) break;
  }
  if (!products.length) throw new Error('Tom Shopify-katalog');
  return { adapter: 'shopify', products };
}

async function fetchWooCatalog(store) {
  const products = [];
  const seen = new Set();
  let endpointWorked = false;
  for (const term of ['pokemon', 'pokémon']) {
    for (let page = 1; page <= MAX_WOO_PAGES; page += 1) {
      const endpoint = new URL('/wp-json/wc/store/v1/products', store.baseUrl);
      endpoint.searchParams.set('search', term);
      endpoint.searchParams.set('per_page', '100');
      endpoint.searchParams.set('page', String(page));
      let response;
      try { response = await fetchWithTimeout(endpoint, { accept: 'application/json' }); }
      catch (error) { if (endpointWorked) break; throw error; }
      if (!response.ok) {
        if (page > 1 && [400, 404].includes(response.status)) break;
        if (endpointWorked) break;
        throw new Error(`WooCommerce ${response.status}`);
      }
      const type = response.headers.get('content-type') || '';
      if (!type.includes('json')) { if (endpointWorked) break; throw new Error('Ikke WooCommerce JSON'); }
      const payload = await response.json();
      if (!Array.isArray(payload)) { if (endpointWorked) break; throw new Error('Ugyldig WooCommerce-respons'); }
      endpointWorked = true;
      for (const item of payload) {
        const parsed = parseWooProduct(item, store);
        if (parsed && !seen.has(parsed.url)) {
          seen.add(parsed.url);
          products.push(parsed);
        }
      }
      if (payload.length < 100) break;
    }
  }
  if (!products.length) throw new Error('Tom WooCommerce-katalog');
  return { adapter: 'woocommerce', products };
}

function extractProductUrls(html, pageUrl, store, setName) {
  const urls = new Set();
  const aliases = aliasesFor(setName);
  const hrefRegex = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html))) {
    const candidate = htmlEntities(match[1]);
    let decoded = candidate;
    try { decoded = decodeURIComponent(candidate); } catch {}
    const normalizedCandidate = normalizeSetName(decoded);
    const commonProductPath = /(\/products?\/|\/p\/|\/produkt\/|product|produkt|\.html(?:$|\?))/i.test(candidate);
    const aliasPath = aliases.some(alias => {
      const tokens = alias.split(' ').filter(token => token.length > 1);
      return tokens.length && tokens.every(token => normalizedCandidate.includes(token));
    });
    if (!commonProductPath && !aliasPath) continue;
    const direct = sameStoreUrl(new URL(candidate, pageUrl).toString(), store);
    if (direct) urls.add(direct);
    if (urls.size >= MAX_HTML_PRODUCT_PAGES * 3) break;
  }
  return [...urls];
}

function flattenJsonLd(value, out = []) {
  if (Array.isArray(value)) value.forEach(item => flattenJsonLd(item, out));
  else if (value && typeof value === 'object') {
    out.push(value);
    if (value['@graph']) flattenJsonLd(value['@graph'], out);
  }
  return out;
}

function parseJsonLdProducts(html, pageUrl, store) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products = [];
  for (const script of scripts) {
    let payload;
    try { payload = JSON.parse(htmlEntities(script[1]).trim()); } catch { continue; }
    for (const node of flattenJsonLd(payload)) {
      const type = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      if (!type.some(x => String(x).toLowerCase() === 'product')) continue;
      const offers = Array.isArray(node.offers) ? node.offers : [node.offers].filter(Boolean);
      const prices = offers.map(o => money(o.price ?? o.lowPrice)).filter(v => v != null);
      const availability = offers.map(o => String(o.availability || '').toLowerCase());
      const url = sameStoreUrl(node.url || pageUrl, store);
      if (!url) continue;
      products.push({
        id: String(node.sku || node.productID || url),
        title: stripHtml(node.name),
        description: stripHtml(node.description || ''),
        tags: '',
        price: prices.length ? Math.min(...prices) : null,
        compareAtPrice: null,
        inStock: availability.some(x => /instock|limitedavailability|preorder/.test(x)) && !availability.every(x => /outofstock|soldout/.test(x)),
        quantity: null,
        image: Array.isArray(node.image) ? node.image[0] : (node.image?.url || node.image || null),
        url,
        productType: classifyProduct(node.name),
        source: 'Produktets strukturerte data'
      });
    }
  }
  return products;
}

async function searchHtmlStore(store, setName) {
  if (!ALLOW_HTML_FALLBACK) return [];
  const query = encodeURIComponent(`pokemon ${setName}`);
  const pageUrls = store.searchPaths.slice(0, MAX_HTML_SEARCH_PATHS).map(template => new URL(template.replace('{query}', query), store.baseUrl).toString());
  const found = new Map();
  for (const pageUrl of pageUrls) {
    let response;
    try { response = await fetchWithTimeout(pageUrl, { accept: 'text/html' }); } catch { continue; }
    if (!response.ok) continue;
    const html = await response.text();
    for (const product of parseJsonLdProducts(html, response.url, store)) {
      if (productMatchesSet(product, setName)) found.set(product.url, product);
    }
    const productUrls = extractProductUrls(html, response.url, store, setName).slice(0, MAX_HTML_PRODUCT_PAGES);
    await mapLimit(productUrls, 3, async productUrl => {
      try {
        const productResponse = await fetchWithTimeout(productUrl, { accept: 'text/html' });
        if (!productResponse.ok) return;
        const productHtml = await productResponse.text();
        for (const product of parseJsonLdProducts(productHtml, productResponse.url, store)) {
          if (productMatchesSet(product, setName)) found.set(product.url, product);
        }
      } catch {}
    });
    if (found.size) break;
  }
  return [...found.values()];
}

async function detectCatalog(store) {
  const errors = [];
  try { return await fetchShopifyCatalog(store); } catch (error) { errors.push(error.message); }
  try { return await fetchWooCatalog(store); } catch (error) { errors.push(error.message); }
  throw new Error(errors.join(' / ') || 'Ingen offentlig produktfeed funnet');
}

async function refreshStore(store, force = false) {
  const cached = catalogCache.get(store.name);
  if (!force && cached && Date.now() - cached.fetchedAt < REFRESH_MS) return cached;
  if (!force && cached?.attemptedAt && Date.now() - cached.attemptedAt < ERROR_BACKOFF_MS) return cached;
  const startedAt = Date.now();
  try {
    const result = await detectCatalog(store);
    const entry = {
      store: store.name,
      website: store.baseUrl,
      adapter: result.adapter,
      products: result.products,
      fetchedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      error: null
    };
    catalogCache.set(store.name, entry);
    return entry;
  } catch (error) {
    const entry = {
      store: store.name,
      website: store.baseUrl,
      adapter: 'html',
      products: cached?.products || [],
      fetchedAt: cached?.fetchedAt || 0,
      attemptedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      error: error.message
    };
    catalogCache.set(store.name, entry);
    return entry;
  }
}

function chooseStoreOffer(store, products, fetchedAt, adapter) {
  if (!products.length) return null;
  const sorted = [...products].sort((a, b) => Number(b.inStock) - Number(a.inStock) || (a.price ?? Infinity) - (b.price ?? Infinity) || a.title.localeCompare(b.title, 'nb'));
  const selected = sorted[0];
  return {
    store: {
      name: store.name,
      website: store.baseUrl
    },
    inStock: products.some(product => product.inStock),
    productType: selected.productType,
    productName: selected.title,
    price: selected.price,
    quantity: selected.quantity,
    updatedAt: new Date(fetchedAt || Date.now()).toISOString(),
    source: selected.source || adapter,
    url: selected.url,
    image: selected.image || null,
    productCount: products.length,
    products: sorted.slice(0, 6).map(product => ({
      name: product.title,
      type: product.productType,
      price: product.price,
      inStock: product.inStock,
      quantity: product.quantity,
      url: product.url,
      image: product.image || null
    }))
  };
}

async function offersForSet(setName, force = false) {
  const key = normalize(setName);
  const cached = setOfferCache.get(key);
  if (!force && cached && Date.now() - cached.fetchedAt < REFRESH_MS) return cached;
  if (!force && cached?.attemptedAt && Date.now() - cached.attemptedAt < ERROR_BACKOFF_MS) return cached;

  const statuses = [];
  const offers = [];
  await mapLimit(stores.filter(store => store.enabled), STORE_CONCURRENCY, async store => {
    const catalog = await refreshStore(store, force);
    let matched = catalog.products.filter(product => productMatchesSet(product, setName));
    if (!matched.length) {
      try { matched = await fetchShopifyProducts(store, setName); } catch {}
    }
    if (!matched.length) {
      try { matched = await fetchMagentoProducts(store, setName); } catch {}
    }
    if (!matched.length && ALLOW_HTML_FALLBACK) {
      try { matched = await searchHtmlStore(store, setName); } catch {}
    }
    const offer = chooseStoreOffer(store, matched, catalog.fetchedAt || Date.now(), catalog.adapter);
    if (offer) offers.push(offer);
    statuses.push({
      store: store.name,
      website: store.baseUrl,
      adapter: catalog.adapter,
      fetchedAt: catalog.fetchedAt || null,
      matchedProducts: matched.length,
      error: catalog.error || null
    });
  });

  offers.sort((a, b) => Number(b.inStock) - Number(a.inStock) || (a.price ?? Infinity) - (b.price ?? Infinity) || a.store.name.localeCompare(b.store.name, 'nb'));
  const result = {
    set: setName,
    fetchedAt: Date.now(),
    refreshMinutes: Math.round(REFRESH_MS / 60_000),
    storesChecked: statuses.length,
    storesWithProducts: offers.length,
    offers,
    statuses
  };
  setOfferCache.set(key, result);
  await persistCache();
  return result;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function persistCache() {
  const payload = {
    savedAt: Date.now(),
    catalogs: [...catalogCache.entries()],
    sets: [...setOfferCache.entries()]
  };
  try {
    await fsp.writeFile(`${CACHE_FILE}.tmp`, JSON.stringify(payload), 'utf8');
    await fsp.rename(`${CACHE_FILE}.tmp`, CACHE_FILE);
  } catch (error) {
    console.warn('Kunne ikke lagre cache:', error.message);
  }
}

async function loadCache() {
  try {
    const payload = JSON.parse(await fsp.readFile(CACHE_FILE, 'utf8'));
    for (const [key, value] of payload.catalogs || []) catalogCache.set(key, value);
    for (const [key, value] of payload.sets || []) setOfferCache.set(key, value);
  } catch {}
}

async function warmCatalogs() {
  if (warmupPromise) return warmupPromise;
  warmupPromise = mapLimit(stores.filter(store => store.enabled), Math.max(2, Math.floor(STORE_CONCURRENCY / 2)), store => refreshStore(store, false))
    .then(() => persistCache())
    .finally(() => { warmupPromise = null; });
  return warmupPromise;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const clean = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, clean);
  if (!filePath.startsWith(ROOT)) return json(res, 403, { error: 'Forbudt' });
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error('Ikke fil');
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': stat.size,
      'cache-control': /\.(?:js|css|svg|png|webp)$/.test(filePath) ? 'public, max-age=3600' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    json(res, 404, { error: 'Ikke funnet' });
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (requestUrl.pathname === '/api/health') {
      const availableCatalogs = [...catalogCache.values()].filter(x => x.products?.length).length;
      return json(res, 200, {
        ok: true,
        storesConfigured: stores.length,
        catalogsAvailable: availableCatalogs,
        setCaches: setOfferCache.size,
        refreshMinutes: Math.round(REFRESH_MS / 60_000),
        htmlFallback: ALLOW_HTML_FALLBACK
      });
    }
    if (requestUrl.pathname === '/api/stores') {
      return json(res, 200, stores.map(store => {
        const status = catalogCache.get(store.name);
        return {
          name: store.name,
          website: store.baseUrl,
          adapter: status?.adapter || 'venter',
          products: status?.products?.length || 0,
          fetchedAt: status?.fetchedAt || null,
          error: status?.error || null
        };
      }));
    }
    if (requestUrl.pathname === '/api/offers') {
      const setName = String(requestUrl.searchParams.get('set') || '').trim();
      if (!setName || setName.length > 100) return json(res, 400, { error: 'Ugyldig settnavn' });
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const force = Boolean(adminToken && requestUrl.searchParams.get('token') === adminToken && requestUrl.searchParams.get('refresh') === '1');
      const result = await offersForSet(setName, force);
      return json(res, 200, result);
    }
    if (requestUrl.pathname === '/api/refresh' && req.method === 'POST') {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      if (!adminToken || req.headers.authorization !== `Bearer ${adminToken}`) return json(res, 401, { error: 'Ikke autorisert' });
      warmCatalogs().catch(error => console.error('Oppdatering feilet:', error));
      return json(res, 202, { accepted: true });
    }
    return serveStatic(req, res, requestUrl.pathname);
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Intern serverfeil', detail: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

async function start() {
  await loadCache();
  server.listen(PORT, HOST, () => {
    console.log(`PokéInventar kjører på http://${HOST}:${PORT}`);
    console.log(`${stores.length} butikker konfigurert. Live-kataloger varmes opp i bakgrunnen.`);
    warmCatalogs().catch(error => console.error('Oppvarming feilet:', error));
  });
  setInterval(() => warmCatalogs().catch(error => console.error('Planlagt oppdatering feilet:', error)), REFRESH_MS).unref();
}

if (require.main === module) start().catch(error => { console.error(error); process.exit(1); });

module.exports = {
  normalize,
  normalizeSetName,
  productMatchesSet,
  classifyProduct,
  parseShopifyProduct,
  fetchShopifyProducts,
  parseWooProduct,
  parseMagentoProduct,
  parseJsonLdProducts,
  sameStoreUrl,
  offersForSet,
  server
};
