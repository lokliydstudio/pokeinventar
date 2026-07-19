const state = {
  view: 'sets',
  query: '',
  sort: 'smart',
  status: 'all',
  price: 'all',
  saved: new Set(JSON.parse(localStorage.getItem('pokeinventar-saved') || '[]'))
};

const el = (id) => document.getElementById(id);
const cardGrid = el('cardGrid');
const dialog = el('detailDialog');
const fmt = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 });

function slugify(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'og').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hash(value) {
  return [...value].reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
}

function palette(value) {
  return PALETTES[Math.abs(hash(value)) % PALETTES.length];
}

function gradient(value) {
  const [a,b] = palette(value);
  return `linear-gradient(145deg, ${a}, ${b})`;
}

function kroner(value) {
  return value == null ? '—' : `${fmt.format(value)} kr`;
}

function isUpcoming(item) {
  return item.release && new Date(item.release) > new Date('2026-07-19T00:00:00');
}

function statusLabel(item, type='set') {
  if (type === 'set' && isUpcoming(item)) return 'Kommer snart';
  return item.stock > 0 ? 'På lager' : 'Utsolgt';
}

function smartScore(item, type) {
  if (type === 'set') return item.stock * 3 + item.stores * 2 - (item.minPrice || 5000) / 300 + (isUpcoming(item) ? 20 : 0);
  return item.stock * 4 + item.tracked / 6 - (item.minPrice || 5000) / 350;
}

function filteredItems() {
  const source = state.view === 'stores' ? STORES : SETS;
  const type = state.view === 'stores' ? 'store' : 'set';
  let items = source.filter(item => item.name.toLowerCase().includes(state.query.toLowerCase().trim()));

  if (state.view === 'saved') {
    items = SETS.filter(item => state.saved.has(item.name) && item.name.toLowerCase().includes(state.query.toLowerCase().trim()));
  }

  if (state.status !== 'all') {
    items = items.filter(item => {
      if (state.status === 'available') return item.stock > 0;
      if (state.status === 'soldout') return item.stock === 0 && !(type === 'set' && isUpcoming(item));
      if (state.status === 'upcoming') return type === 'set' && isUpcoming(item);
      return true;
    });
  }

  if (state.price !== 'all') {
    items = items.filter(item => {
      if (item.minPrice == null) return false;
      if (state.price === 'under500') return item.minPrice < 500;
      if (state.price === '500to1500') return item.minPrice >= 500 && item.minPrice <= 1500;
      if (state.price === 'over1500') return item.minPrice > 1500;
      return true;
    });
  }

  const sorters = {
    smart: (a,b) => smartScore(b,type) - smartScore(a,type),
    stock: (a,b) => b.stock - a.stock || a.name.localeCompare(b.name,'nb'),
    stores: (a,b) => (type === 'set' ? b.stores-a.stores : b.tracked-a.tracked),
    price: (a,b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity),
    name: (a,b) => a.name.localeCompare(b.name,'nb')
  };
  return items.sort(sorters[state.sort]);
}

function setCard(item) {
  const label = statusLabel(item);
  const statusClass = label === 'Utsolgt' ? 'soldout' : label === 'Kommer snart' ? 'upcoming' : '';
  const saved = state.saved.has(item.name);
  return `
    <article class="inventory-card" tabindex="0" data-kind="set" data-name="${item.name.replace(/"/g,'&quot;')}">
      <div class="thumbnail" style="background:${gradient(item.name)}">
        <div class="thumb-top">
          <span class="status-badge ${statusClass}">${label}</span>
          <button class="save-button ${saved ? 'saved' : ''}" data-save="${item.name.replace(/"/g,'&quot;')}" aria-label="${saved ? 'Fjern fra lagret' : 'Lagre sett'}">${saved ? '♥' : '♡'}</button>
        </div>
        <div class="thumb-symbol"><span></span></div>
        <span class="thumb-caption">Pokémon TCG · Sett</span>
      </div>
      <div class="card-content">
        <div class="card-title-row"><h3>${item.name}</h3><span class="arrow">↗</span></div>
        <div class="card-meta">
          <div class="meta-block"><span>Laveste pris</span><strong>${kroner(item.minPrice)}</strong></div>
          <div class="meta-block"><span>Tilgjengelighet</span><strong>${item.stock > 0 ? `${item.stock} varer` : label}</strong></div>
        </div>
      </div>
    </article>`;
}

function storeCard(item) {
  const initials = item.name.split(/\s+/).map(w => w[0]).join('').slice(0,3).toUpperCase();
  const max = Math.max(...STORES.map(s => s.stock));
  return `
    <article class="inventory-card store-card" tabindex="0" data-kind="store" data-name="${item.name.replace(/"/g,'&quot;')}">
      <div class="thumbnail" style="background:${gradient(item.name)}">
        <div class="thumb-top"><span class="status-badge ${item.stock ? '' : 'soldout'}">${item.stock ? 'Har varer' : 'Utsolgt'}</span></div>
        <div class="store-monogram">${initials}</div>
        <span class="thumb-caption">Norsk nettbutikk</span>
      </div>
      <div class="card-content">
        <div class="card-title-row"><h3>${item.name}</h3><span class="arrow">↗</span></div>
        <div class="card-meta">
          <div class="meta-block"><span>På lager</span><strong>${item.stock} varer</strong></div>
          <div class="meta-block"><span>Fra</span><strong>${kroner(item.minPrice)}</strong></div>
        </div>
        <div class="progress" aria-label="Relativ lagerbeholdning"><span style="width:${Math.max(3,item.stock/max*100)}%"></span></div>
      </div>
    </article>`;
}

function render() {
  const items = filteredItems();
  const isStore = state.view === 'stores';
  cardGrid.innerHTML = items.map(item => isStore ? storeCard(item) : setCard(item)).join('');
  el('resultCount').textContent = items.length;
  el('emptyState').hidden = items.length > 0;
  cardGrid.hidden = items.length === 0;
  el('savedCount').textContent = state.saved.size;

  document.querySelectorAll('[data-save]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    toggleSaved(button.dataset.save);
  }));

  document.querySelectorAll('.inventory-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.kind, card.dataset.name));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(card.dataset.kind, card.dataset.name); } });
  });
}

function toggleSaved(name) {
  state.saved.has(name) ? state.saved.delete(name) : state.saved.add(name);
  localStorage.setItem('pokeinventar-saved', JSON.stringify([...state.saved]));
  render();
}

function updateView(view) {
  state.view = view;
  state.status = 'all';
  state.price = 'all';
  state.query = '';
  el('searchInput').value = '';
  document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('[data-status]').forEach(button => button.classList.toggle('active', button.dataset.status === 'all'));
  document.querySelectorAll('[data-price]').forEach(button => button.classList.toggle('active', button.dataset.price === 'all'));

  const copy = {
    sets: ['ALLE SETT','Utforsk samlingen','Kortene er rangert etter tilgjengelighet, butikkdekning og pris.','Søk etter sett …'],
    stores: ['NORSKE BUTIKKER','Finn en forhandler','Se hvem som har størst utvalg, flest varer inne og lavest startpris.','Søk etter butikk …'],
    saved: ['DIN SAMLING','Lagrede favoritter','Sett du har lagret på denne enheten, samlet på ett sted.','Søk i lagrede sett …']
  }[view];
  el('sectionEyebrow').textContent = copy[0];
  el('sectionTitle').textContent = copy[1];
  el('sectionDescription').textContent = copy[2];
  el('searchInput').placeholder = copy[3];
  const upcomingChip = document.querySelector('[data-status="upcoming"]');
  if (upcomingChip) upcomingChip.hidden = view === 'stores';
  render();
}

function seededOffers(item) {
  if (!item.stock) return [];
  const sorted = [...STORES].filter(s => s.stock > 0).sort((a,b) => Math.abs(hash(item.name+a.name)) - Math.abs(hash(item.name+b.name)));
  const count = Math.min(6, Math.max(3, Math.min(item.stores || 4, 6)));
  const products = ['Sleeved Booster','Booster Bundle','Elite Trainer Box','Collection Box','Booster Box','Tin'];
  return sorted.slice(0,count).map((store,index) => ({
    store,
    product: products[Math.abs(hash(item.name+index)) % products.length],
    price: Math.round(((item.minPrice || 399) * (1 + index * .12) + (Math.abs(hash(store.name)) % 35)) * 10) / 10
  })).sort((a,b) => a.price-b.price);
}

function openDetail(kind, name) {
  const item = (kind === 'store' ? STORES : SETS).find(x => x.name === name);
  if (!item) return;
  const [a,b] = palette(item.name);
  if (kind === 'set') {
    const offers = seededOffers(item);
    const releaseText = item.release ? new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'long',year:'numeric'}).format(new Date(item.release+'T12:00:00')) : null;
    el('dialogContent').innerHTML = `
      <div class="dialog-hero" style="background:linear-gradient(145deg,${a},${b})">
        <span class="eyebrow">${statusLabel(item).toUpperCase()}</span>
        <h2>${item.name}</h2>
        <p>${releaseText ? `Lansering ${releaseText}` : 'Forseglede Pokémon TCG-produkter i norske butikker'}</p>
      </div>
      <div class="dialog-body">
        <div class="dialog-stats">
          <div><span>På lager</span><strong>${item.stock}</strong></div>
          <div><span>Fra</span><strong>${kroner(item.minPrice)}</strong></div>
          <div><span>Butikker fulgt</span><strong>${item.stores}</strong></div>
        </div>
        <h3>${offers.length ? 'Butikkeksempler' : 'Ingen varer på lager'}</h3>
        <div class="offer-list">
          ${offers.map(o => `<div class="offer"><div class="offer-name"><strong>${o.store.name}</strong><span>${o.product}</span></div><span class="offer-price">${kroner(o.price)}</span><a href="https://pokesnag.no/sett/${slugify(item.name)}" target="_blank" rel="noreferrer">Se kilde ↗</a></div>`).join('') || '<p style="color:var(--muted)">Lagre settet for å finne det raskt når lagerstatusen endres.</p>'}
        </div>
        <div class="demo-note"><strong>Prototype:</strong> Settnavn, total lagerstatus, startpris og butikkdekning er hentet fra snapshotet. Koblingen mellom et bestemt sett og butikkene i eksempellisten er illustrativ og må erstattes med en live datakilde før publisering.</div>
      </div>`;
  } else {
    el('dialogContent').innerHTML = `
      <div class="dialog-hero" style="background:linear-gradient(145deg,${a},${b})">
        <span class="eyebrow">NORSK NETTBUTIKK</span>
        <h2>${item.name}</h2>
        <p>${item.stock ? `${item.stock} produkter på lager i snapshotet` : 'Ingen registrerte varer på lager i snapshotet'}</p>
      </div>
      <div class="dialog-body">
        <div class="dialog-stats">
          <div><span>På lager</span><strong>${item.stock}</strong></div>
          <div><span>Fra</span><strong>${kroner(item.minPrice)}</strong></div>
          <div><span>Produkter fulgt</span><strong>${item.tracked}</strong></div>
        </div>
        <h3>Butikkoversikt</h3>
        <p style="color:var(--muted);line-height:1.65">Åpne kildesiden for å se den detaljerte produktlisten og bekrefte dagens priser og lagerstatus.</p>
        <a class="primary-button" style="display:inline-block;text-decoration:none;margin-top:8px" href="https://pokesnag.no/butikker" target="_blank" rel="noreferrer">Se hos PokéSnag ↗</a>
      </div>`;
  }
  dialog.showModal();
}

function updateFilterBadge() {
  const count = (state.status !== 'all' ? 1 : 0) + (state.price !== 'all' ? 1 : 0);
  el('filterBadge').hidden = count === 0;
  el('filterBadge').textContent = count;
}

document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => updateView(button.dataset.view)));
el('searchInput').addEventListener('input', e => { state.query = e.target.value; render(); });
el('sortSelect').addEventListener('change', e => { state.sort = e.target.value; render(); });
el('filterToggle').addEventListener('click', () => {
  const filters = el('filters');
  filters.hidden = !filters.hidden;
  el('filterToggle').setAttribute('aria-expanded', String(!filters.hidden));
});
document.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => {
  state.status = button.dataset.status;
  document.querySelectorAll('[data-status]').forEach(b => b.classList.toggle('active', b === button));
  updateFilterBadge(); render();
}));
document.querySelectorAll('[data-price]').forEach(button => button.addEventListener('click', () => {
  state.price = button.dataset.price;
  document.querySelectorAll('[data-price]').forEach(b => b.classList.toggle('active', b === button));
  updateFilterBadge(); render();
}));
el('resetFilters').addEventListener('click', () => updateView(state.view));
el('dialogClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
el('exploreButton').addEventListener('click', () => { updateView('sets'); el('browser').scrollIntoView({behavior:'smooth'}); });
el('randomButton').addEventListener('click', () => {
  const available = SETS.filter(s => s.stock > 0);
  const item = available[Math.floor(Math.random()*available.length)];
  openDetail('set', item.name);
});
el('themeToggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('pokeinventar-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
});
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); el('searchInput').focus(); }
  if (e.key === 'Escape' && dialog.open) dialog.close();
});

if (localStorage.getItem('pokeinventar-theme') === 'dark') document.documentElement.classList.add('dark');
el('setTotal').textContent = SETS.length;
el('storeTotal').textContent = STORES.length;
el('availableTotal').textContent = SETS.filter(s => s.stock > 0).length;
render();
