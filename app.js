(() => {
  'use strict';

  const { sets, stores } = window.POKE_DATA;
  const state = {
    view: 'sets',
    query: '',
    sort: 'smart',
    status: 'all',
    era: 'all',
    maxPrice: 'all',
    favorites: new Set(JSON.parse(localStorage.getItem('pokeinventar:favorites') || '[]'))
  };

  const liveSummaries = new Map();
  const liveOffers = new Map();
  const storeStatuses = new Map();
  let activeDetailName = null;

  const $ = id => document.getElementById(id);
  const grid = $('grid');
  const currency = new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 2
  });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const initials = name => String(name).split(/\s+/).map(part => part[0]).join('').replace(/[^A-Za-zÆØÅæøå]/g, '').slice(0, 3).toUpperCase();
  const safeUrl = value => {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) return null;
      if (/google\./i.test(url.hostname)) return null;
      return url.toString();
    } catch {
      return null;
    }
  };

  function formatPrice(value) {
    return Number.isFinite(Number(value)) ? currency.format(Number(value)) : '—';
  }

  function relativeTime(iso) {
    const timestamp = Date.parse(iso);
    if (!Number.isFinite(timestamp)) return 'ukjent tid';
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
    if (minutes < 1) return 'nå nettopp';
    if (minutes < 60) return `${minutes} min siden`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} t siden`;
    return `${Math.round(hours / 24)} d siden`;
  }

  const setImage = item => {
    const alt = item.packImageAlt || '';
    const logo = item.logoImage || '';
    return `<img src="${esc(item.packImage)}" data-alt-src="${esc(alt)}" data-logo-src="${esc(logo)}" data-fallback="assets/pack-fallback.svg" alt="Boosterpakke fra ${esc(item.name)}" loading="lazy" referrerpolicy="no-referrer">`;
  };

  function imageFallback(img) {
    if (!img.dataset.triedAlt && img.dataset.altSrc) {
      img.dataset.triedAlt = '1';
      img.src = img.dataset.altSrc;
      return;
    }
    if (!img.dataset.triedLogo && img.dataset.logoSrc) {
      img.dataset.triedLogo = '1';
      img.src = img.dataset.logoSrc;
      img.classList.add('logo-fallback');
      return;
    }
    img.onerror = null;
    img.src = img.dataset.fallback;
  }
  window.pokeImageFallback = imageFallback;

  function currentSource() {
    if (state.view === 'stores') return stores;
    if (state.view === 'favorites') return sets.filter(set => state.favorites.has(set.name));
    return sets;
  }

  function liveMetric(item, key, fallback = 0) {
    const summary = liveSummaries.get(item.name);
    return summary && Number.isFinite(summary[key]) ? summary[key] : fallback;
  }

  function filtered() {
    let list = [...currentSource()];
    const query = state.query.trim().toLocaleLowerCase('nb');
    if (query) list = list.filter(item => `${item.name} ${item.era || ''} ${item.category || ''}`.toLocaleLowerCase('nb').includes(query));

    if (state.status !== 'all') {
      list = list.filter(item => {
        if (state.view === 'stores') return state.status === 'available' ? (storeStatuses.get(item.name)?.products || 0) > 0 : (storeStatuses.get(item.name)?.products || 0) === 0;
        const summary = liveSummaries.get(item.name);
        if (!summary) return false;
        return state.status === 'available' ? summary.availableStores > 0 : summary.availableStores === 0 && summary.storesWithProducts > 0;
      });
    }
    if (state.view !== 'stores' && state.era !== 'all') list = list.filter(item => item.era === state.era);
    if (state.view !== 'stores' && state.maxPrice !== 'all') {
      list = list.filter(item => {
        const price = liveSummaries.get(item.name)?.minPrice;
        return Number.isFinite(price) && price <= Number(state.maxPrice);
      });
    }

    const sorters = {
      smart: (a, b) => {
        if (state.view === 'stores') return (storeStatuses.get(b.name)?.products || 0) - (storeStatuses.get(a.name)?.products || 0) || a.name.localeCompare(b.name, 'nb');
        return liveMetric(b, 'availableStores') - liveMetric(a, 'availableStores') || liveMetric(b, 'storesWithProducts') - liveMetric(a, 'storesWithProducts') || a.name.localeCompare(b.name, 'nb');
      },
      stock: (a, b) => liveMetric(b, 'availableStores') - liveMetric(a, 'availableStores') || a.name.localeCompare(b.name, 'nb'),
      products: (a, b) => {
        if (state.view === 'stores') return (storeStatuses.get(b.name)?.products || 0) - (storeStatuses.get(a.name)?.products || 0) || a.name.localeCompare(b.name, 'nb');
        return liveMetric(b, 'storesWithProducts') - liveMetric(a, 'storesWithProducts') || a.name.localeCompare(b.name, 'nb');
      },
      price: (a, b) => (liveSummaries.get(a.name)?.minPrice ?? Infinity) - (liveSummaries.get(b.name)?.minPrice ?? Infinity) || a.name.localeCompare(b.name, 'nb'),
      name: (a, b) => a.name.localeCompare(b.name, 'nb')
    };
    return list.sort(sorters[state.sort] || sorters.smart);
  }

  function setCard(item) {
    const saved = state.favorites.has(item.name);
    const summary = liveSummaries.get(item.name);
    const statusText = summary
      ? summary.availableStores > 0 ? 'På lager nå' : summary.storesWithProducts > 0 ? 'Utsolgt nå' : 'Ingen treff i feed'
      : 'Åpne for livepris';
    const statusClass = summary && summary.availableStores === 0 ? 'out' : summary ? '' : 'pending';
    const price = summary ? formatPrice(summary.minPrice) : 'Live-sjekk';
    const storeFact = summary ? `${summary.availableStores} av ${summary.storesWithProducts}` : 'Klikk for å hente';

    return `<article class="inventory-card" tabindex="0" data-kind="set" data-name="${esc(item.name)}">
      <div class="pack-stage">${setImage(item)}<button class="save ${saved ? 'is-saved' : ''}" data-save="${esc(item.name)}" aria-label="${saved ? 'Fjern fra favoritter' : 'Legg til i favoritter'}">${saved ? '♥' : '♡'}</button></div>
      <div class="card-info">
        <span class="status ${statusClass}">${esc(statusText)}</span>
        <span class="era">${esc(item.era)}</span>
        <h3>${esc(item.name)}</h3>
        <div class="card-facts"><div><span>Laveste livepris</span><strong>${price}</strong></div><div><span>Butikker på lager</span><strong>${storeFact}</strong></div></div>
      </div><span class="card-arrow">↗</span>
    </article>`;
  }

  function storeCard(item) {
    const live = storeStatuses.get(item.name);
    const website = safeUrl(item.website);
    const statusText = live?.fetchedAt ? `${live.products} produkter i feed` : live?.error ? 'Ingen offentlig feed' : 'Venter på live-sjekk';
    const adapter = live?.adapter && live.adapter !== 'venter' ? live.adapter : item.category;
    const tagClass = live?.fetchedAt ? '' : 'unverified';
    const tagText = live?.fetchedAt ? 'Live tilkoblet' : 'Direkte butikk';
    return `<a class="inventory-card store-card" href="${esc(website || '#')}" target="_blank" rel="noopener noreferrer" aria-label="Åpne ${esc(item.name)}">
      <div class="store-top"><div class="store-logo">${esc(initials(item.name) || 'PK')}</div><span class="verified ${tagClass}">${tagText}</span></div>
      <h3>${esc(item.name)}</h3><div class="store-category">${esc(adapter)}</div>
      <div class="store-metrics"><div><span>Status</span><strong>${esc(statusText)}</strong></div><div><span>Oppdatert</span><strong>${live?.fetchedAt ? esc(relativeTime(live.fetchedAt)) : '—'}</strong></div></div><span class="card-arrow">↗</span>
    </a>`;
  }

  function bindImages() {
    document.querySelectorAll('.pack-stage img, .detail-art img').forEach(img => img.addEventListener('error', () => imageFallback(img), { once: false }));
  }

  function render() {
    const items = filtered();
    grid.innerHTML = items.map(item => state.view === 'stores' ? storeCard(item) : setCard(item)).join('');
    $('resultCount').textContent = items.length;
    $('empty').hidden = items.length > 0;
    grid.hidden = items.length === 0;
    $('favoriteCount').textContent = state.favorites.size;
    bindImages();

    document.querySelectorAll('[data-save]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      toggleFavorite(button.dataset.save);
    }));
    document.querySelectorAll('.inventory-card[data-kind="set"]').forEach(card => {
      const open = () => openDetail(card.dataset.name);
      card.addEventListener('click', open);
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function toggleFavorite(name) {
    state.favorites.has(name) ? state.favorites.delete(name) : state.favorites.add(name);
    localStorage.setItem('pokeinventar:favorites', JSON.stringify([...state.favorites]));
    if ('setAppBadge' in navigator) state.favorites.size ? navigator.setAppBadge(state.favorites.size) : navigator.clearAppBadge();
    render();
  }

  function updateView(view) {
    state.view = view;
    state.query = '';
    state.status = 'all';
    state.era = 'all';
    state.maxPrice = 'all';
    $('search').value = '';
    $('eraFilter').value = 'all';
    $('priceFilter').value = 'all';
    document.querySelectorAll('.nav-tab').forEach(button => button.classList.toggle('is-active', button.dataset.view === view));
    document.querySelectorAll('[data-status]').forEach(button => button.classList.toggle('is-active', button.dataset.status === 'all'));
    const copy = {
      sets: ['ALLE SETT', 'Velg etter motiv, pris eller tilgjengelighet', 'Trykk på et sett for å hente ferske priser, lagerstatus og direkte produktlenker fra butikkene.', 'Søk etter sett …'],
      stores: ['BUTIKKER I NORGE', 'Gå direkte til forhandleren', 'Butikkort åpner butikkens egen nettside. Feedstatus viser hvilke butikker som er live tilkoblet.', 'Søk etter butikk …'],
      favorites: ['DINE FAVORITTER', 'Alt du følger på ett sted', 'Åpne favorittene for å hente fersk pris og lagerstatus fra norske butikker.', 'Søk i favoritter …']
    }[view];
    $('catalogKicker').textContent = copy[0];
    $('catalogTitle').textContent = copy[1];
    $('catalogIntro').textContent = copy[2];
    $('search').placeholder = copy[3];
    $('eraFilterWrap').hidden = view === 'stores';
    render();
    updateFilterCount();
    $('catalog').scrollIntoView({ behavior: 'smooth' });
  }

  function productLinks(offer) {
    if (!Array.isArray(offer.products) || offer.products.length < 2) return '';
    return `<details class="offer-products"><summary>Se ${offer.products.length} direkte produktlenker</summary><div>${offer.products.map(product => {
      const url = safeUrl(product.url);
      if (!url) return '';
      return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>${esc(product.name)}</span><b>${formatPrice(product.price)}</b><em class="${product.inStock ? '' : 'out'}">${product.inStock ? 'På lager' : 'Utsolgt'}</em></a>`;
    }).join('')}</div></details>`;
  }

  function offerRow(offer) {
    const url = safeUrl(offer.url);
    if (!url) return '';
    const updated = relativeTime(offer.updatedAt);
    const count = Number(offer.productCount || 1);
    const quantity = Number.isFinite(Number(offer.quantity)) && Number(offer.quantity) > 0 ? `${offer.quantity} på lager` : 'På lager';
    return `<article class="offer-row ${offer.inStock ? '' : 'is-soldout'}">
      <a class="offer-store" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
        <div class="offer-logo">${esc(initials(offer.store.name) || 'PK')}</div><div><b>${esc(offer.store.name)}</b><span>${esc(offer.productName)} · ${count} ${count === 1 ? 'produkt' : 'produkter'}</span></div>
      </a>
      <div class="offer-price"><span>${offer.inStock ? 'Laveste pris' : 'Registrert pris'}</span><strong>${formatPrice(offer.price)}</strong></div>
      <div class="offer-availability"><span class="offer-status ${offer.inStock ? '' : 'out'}">${offer.inStock ? quantity : 'Utsolgt'}</span><small>${esc(updated)} · ${esc(offer.source || 'butikkfeed')}</small></div>
      <a class="offer-action ${offer.inStock ? '' : 'muted'}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${offer.inStock ? 'Finn produkt' : 'Åpne produkt'} ↗</a>
      ${productLinks(offer)}
    </article>`;
  }

  function detailShell(item, content, summary = {}) {
    const saved = state.favorites.has(item.name);
    return `<div class="set-detail-shell">
      <div class="set-detail-hero">
        <div class="detail-art">${setImage(item)}</div>
        <div class="detail-copy"><span class="status ${summary.availableStores === 0 && summary.checked ? 'out' : summary.checked ? '' : 'pending'}">${summary.checked ? summary.availableStores > 0 ? 'På lager nå' : summary.storesWithProducts > 0 ? 'Utsolgt nå' : 'Ingen produkter funnet' : 'Henter live data'}</span><h2>${esc(item.name)}</h2><p>${esc(item.era)}. Pris og lager hentes fra butikkens offentlige produktfeed eller fra strukturerte data på produktets egen side.</p><div class="detail-stats"><div><span>Butikker på lager</span><strong>${summary.checked ? summary.availableStores : '…'}</strong></div><div><span>Butikker utsolgt</span><strong>${summary.checked ? summary.soldoutStores : '…'}</strong></div><div><span>Laveste pris nå</span><strong>${summary.checked ? formatPrice(summary.minPrice) : '…'}</strong></div><div><span>Butikker kontrollert</span><strong>${summary.checked ? summary.storesChecked : '…'}</strong></div></div><button class="button primary full" data-dialog-save="${esc(item.name)}">${saved ? 'Fjern fra favoritter' : 'Følg dette settet'}</button></div>
      </div>
      ${content}
    </div>`;
  }

  function loadingOverview() {
    return `<section class="store-overview"><header class="store-overview-head"><div><p class="kicker">LIVE BUTIKKSJEKK</p><h3>Henter priser og lagerstatus</h3><p>PokéInventar kontakter de konfigurerte produktfeedene. Første oppslag kan ta litt lenger tid; senere oppslag brukes fra en korttids-cache.</p></div><div class="overview-count"><b class="loading-dots">•••</b><span>arbeider</span></div></header><div class="live-loading"><span></span><span></span><span></span></div></section>`;
  }

  function renderDetail(item, payload) {
    const offers = Array.isArray(payload.offers) ? payload.offers.filter(offer => safeUrl(offer.url)) : [];
    const available = offers.filter(offer => offer.inStock);
    const soldout = offers.filter(offer => !offer.inStock);
    const prices = available.map(offer => Number(offer.price)).filter(Number.isFinite);
    const summary = {
      checked: true,
      availableStores: available.length,
      soldoutStores: soldout.length,
      storesWithProducts: offers.length,
      storesChecked: Number(payload.storesChecked || 0),
      minPrice: prices.length ? Math.min(...prices) : null,
      fetchedAt: payload.fetchedAt ? new Date(payload.fetchedAt).toISOString() : new Date().toISOString()
    };
    liveSummaries.set(item.name, summary);
    liveOffers.set(item.name, payload);

    const overview = `<section class="store-overview" aria-label="Live butikkoversikt for ${esc(item.name)}">
      <header class="store-overview-head"><div><p class="kicker">LIVE BUTIKKSJEKK</p><h3>Direkte produktsider hos norske butikker</h3><p>Tilbudene kommer fra butikkens egen feed eller produktmetadata. Hver butikk og hver knapp under peker direkte til den aktuelle produktsiden.</p></div><div class="overview-count"><b>${offers.length}</b><span>butikker med treff</span></div></header>
      <div class="offer-section"><div class="offer-section-title"><h4><span class="status-dot available"></span>På lager</h4><b>${available.length}</b></div>${available.length ? `<div class="offer-list">${available.map(offerRow).join('')}</div>` : `<div class="offer-empty"><span>◌</span><div><b>Ingen live-tilkoblede butikker viser lager akkurat nå</b><p>Dette betyr ikke nødvendigvis at produktet ikke finnes i fysiske butikker.</p></div></div>`}</div>
      <div class="offer-section soldout-section"><div class="offer-section-title"><h4><span class="status-dot soldout"></span>Utsolgt</h4><b>${soldout.length}</b></div>${soldout.length ? `<div class="offer-list">${soldout.map(offerRow).join('')}</div>` : `<div class="offer-empty compact"><b>Ingen utsolgte produktsider ble funnet i de tilgjengelige feedene.</b></div>`}</div>
      ${offers.length ? '' : `<div class="live-warning"><b>Ingen eksakte produkt-URL-er ble funnet.</b><p>${summary.storesChecked} butikker ble forsøkt kontrollert. Butikker uten offentlig feed, blokkerte forespørsler eller uverifiserte domener blir ikke vist som falskt «utsolgt».</p></div>`}
      <p class="inventory-note">Sist kontrollert ${esc(relativeTime(summary.fetchedAt))}. Live-data mellomlagres i ${Number(payload.refreshMinutes || 15)} minutter for å beskytte butikkene mot unødvendig trafikk. Bekreft alltid pris, frakt og lager på produktsiden før kjøp.</p>
    </section>`;

    $('dialogBody').innerHTML = detailShell(item, overview, summary);
    bindImages();
    bindDialogFavorite(item);
    updateLiveStats();
    render();
  }

  function renderDetailError(item, error) {
    const content = `<section class="store-overview"><div class="live-warning error"><b>Live-tjenesten svarte ikke</b><p>${esc(error.message || 'Ukjent feil')}. Start PokéInventar med den medfølgende Node-serveren for å hente faktiske priser og direkte produktsider.</p><code>npm start</code></div></section>`;
    $('dialogBody').innerHTML = detailShell(item, content);
    bindImages();
    bindDialogFavorite(item);
  }

  function bindDialogFavorite(item) {
    const button = document.querySelector('[data-dialog-save]');
    if (button) button.addEventListener('click', () => {
      toggleFavorite(item.name);
      button.textContent = state.favorites.has(item.name) ? 'Fjern fra favoritter' : 'Følg dette settet';
    });
  }

  async function fetchOffers(setName) {
    if (liveOffers.has(setName)) return liveOffers.get(setName);
    if (location.protocol === 'file:') throw new Error('Live API er ikke tilgjengelig når index.html åpnes direkte som en fil');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(`/api/offers?set=${encodeURIComponent(setName)}`, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Live API svarte med status ${response.status}`);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.offers)) throw new Error('Live API returnerte ugyldige data');
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  async function openDetail(name) {
    const item = sets.find(set => set.name === name);
    if (!item) return;
    activeDetailName = name;
    $('dialogBody').innerHTML = detailShell(item, loadingOverview());
    bindImages();
    bindDialogFavorite(item);
    if (!$('detailDialog').open) $('detailDialog').showModal();
    try {
      const payload = await fetchOffers(name);
      if (activeDetailName === name) renderDetail(item, payload);
    } catch (error) {
      if (activeDetailName === name) renderDetailError(item, error);
    }
  }

  async function loadStoreStatuses() {
    if (location.protocol === 'file:') return;
    try {
      const response = await fetch('/api/stores', { headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const statuses = await response.json();
      statuses.forEach(status => storeStatuses.set(status.name, status));
      if (state.view === 'stores') render();
    } catch {}
  }

  function updateLiveStats() {
    const summaries = [...liveSummaries.values()];
    const available = summaries.filter(summary => summary.availableStores > 0).length;
    $('availableCount').textContent = summaries.length ? available : '—';
  }

  function updateFilterCount() {
    const count = Number(state.status !== 'all') + Number(state.era !== 'all') + Number(state.maxPrice !== 'all');
    $('filterCount').hidden = !count;
    $('filterCount').textContent = count;
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker støttes ikke');
    return navigator.serviceWorker.register('./sw.js');
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  async function activateNotifications() {
    const status = $('notificationStatus');
    try {
      const registration = await registerSW();
      if (!('Notification' in window)) throw new Error('Varsler støttes ikke i denne nettleseren.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Tillatelse til varsler ble ikke gitt.');
      localStorage.setItem('pokeinventar:notifications', 'enabled');
      status.textContent = isStandalone() ? 'Varsler er aktivert.' : 'Varsler er tillatt. På iPhone må appen åpnes fra hjemskjermen for Web Push.';
      await registration.showNotification('PokéInventar er klar!', { body: 'Du kan nå følge favorittsett og teste lageralarmer.', icon: 'assets/icon-192.png', badge: 'assets/badge-96.png', tag: 'pokeinventar-ready', data: { url: './#catalog' } });
      $('notifyDialog').close();
    } catch (error) {
      status.textContent = error.message;
    }
  }
  async function testNotification() {
    const status = $('notificationStatus');
    try {
      const registration = await registerSW();
      if (Notification.permission !== 'granted') throw new Error('Aktiver varsler først.');
      const favorite = [...state.favorites][0] || 'Destined Rivals';
      const summary = liveSummaries.get(favorite);
      const priceText = summary?.minPrice ? ` fra ${formatPrice(summary.minPrice)}` : '';
      await registration.showNotification('Lageralarm', { body: `${favorite} er registrert på lager${priceText}.`, icon: 'assets/icon-192.png', badge: 'assets/badge-96.png', tag: 'inventory-test', data: { url: './#catalog' } });
      status.textContent = 'Testvarsel sendt.';
    } catch (error) {
      status.textContent = error.message;
    }
  }

  [...new Set(sets.map(set => set.era))].forEach(era => $('eraFilter').insertAdjacentHTML('beforeend', `<option value="${esc(era)}">${esc(era)}</option>`));
  document.querySelectorAll('.nav-tab').forEach(button => button.addEventListener('click', () => updateView(button.dataset.view)));
  $('browseSets').addEventListener('click', () => updateView('sets'));
  $('browseStores').addEventListener('click', () => updateView('stores'));
  $('search').addEventListener('input', event => { state.query = event.target.value; render(); });
  $('sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
  $('filterToggle').addEventListener('click', () => { $('filterPanel').hidden = !$('filterPanel').hidden; });
  document.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => {
    state.status = button.dataset.status;
    document.querySelectorAll('[data-status]').forEach(item => item.classList.toggle('is-active', item === button));
    updateFilterCount();
    render();
  }));
  $('eraFilter').addEventListener('change', event => { state.era = event.target.value; updateFilterCount(); render(); });
  $('priceFilter').addEventListener('change', event => { state.maxPrice = event.target.value; updateFilterCount(); render(); });
  $('reset').addEventListener('click', () => updateView(state.view));
  $('dialogClose').addEventListener('click', () => { activeDetailName = null; $('detailDialog').close(); });
  $('detailDialog').addEventListener('click', event => { if (event.target === $('detailDialog')) { activeDetailName = null; $('detailDialog').close(); } });
  const openNotify = () => $('notifyDialog').showModal();
  $('notifyTop').addEventListener('click', openNotify);
  $('enableNotifications').addEventListener('click', openNotify);
  $('notifyClose').addEventListener('click', () => $('notifyDialog').close());
  $('confirmNotifications').addEventListener('click', activateNotifications);
  $('testNotification').addEventListener('click', testNotification);
  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('search').focus();
    }
  });

  $('setCount').textContent = sets.length;
  $('storeCount').textContent = stores.length;
  $('storeHeroCount').textContent = stores.length;
  updateLiveStats();
  if (localStorage.getItem('pokeinventar:notifications') === 'enabled') $('notificationStatus').textContent = 'Varsler er aktivert på denne enheten.';
  registerSW().catch(() => {});
  loadStoreStatuses();
  setInterval(loadStoreStatuses, 60_000);
  render();
})();
