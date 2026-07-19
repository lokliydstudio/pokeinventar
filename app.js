(() => {
  'use strict';
  const {sets, stores} = window.POKE_DATA;
  const state = {
    view: 'sets', query: '', sort: 'smart', status: 'all', era: 'all', maxPrice: 'all',
    favorites: new Set(JSON.parse(localStorage.getItem('pokeinventar:favorites') || '[]'))
  };
  const $ = (id) => document.getElementById(id);
  const grid = $('grid');
  const currency = new Intl.NumberFormat('nb-NO', {style:'currency', currency:'NOK', maximumFractionDigits:0});
  const esc = value => String(value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const initials = name => name.split(/\s+/).map(x=>x[0]).join('').replace(/[^A-Za-zÆØÅæøå]/g,'').slice(0,3).toUpperCase();

  const setImage = (item) => {
    const alt = item.packImageAlt || '';
    const logo = item.logoImage || '';
    return `<img src="${esc(item.packImage)}" data-alt-src="${esc(alt)}" data-logo-src="${esc(logo)}" data-fallback="assets/pack-fallback.svg" alt="Boosterpakke fra ${esc(item.name)}" loading="lazy" referrerpolicy="no-referrer">`;
  };
  function imageFallback(img){
    if(!img.dataset.triedAlt && img.dataset.altSrc){img.dataset.triedAlt='1';img.src=img.dataset.altSrc;return;}
    if(!img.dataset.triedLogo && img.dataset.logoSrc){img.dataset.triedLogo='1';img.src=img.dataset.logoSrc;img.classList.add('logo-fallback');return;}
    img.onerror=null;img.src=img.dataset.fallback;
  }
  window.pokeImageFallback = imageFallback;

  function currentSource(){
    if(state.view === 'stores') return stores;
    if(state.view === 'favorites') return sets.filter(s=>state.favorites.has(s.name));
    return sets;
  }
  function filtered(){
    let list=[...currentSource()];
    const q=state.query.trim().toLocaleLowerCase('nb');
    if(q) list=list.filter(x=>`${x.name} ${x.era||''} ${x.category||''}`.toLocaleLowerCase('nb').includes(q));
    if(state.status !== 'all') list=list.filter(x=>state.status==='available' ? x.inStock>0 : x.inStock===0);
    if(state.view!=='stores' && state.era!=='all') list=list.filter(x=>x.era===state.era);
    if(state.view!=='stores' && state.maxPrice!=='all') list=list.filter(x=>x.minPrice!=null && x.minPrice<=Number(state.maxPrice));
    const sorters={
      smart:(a,b)=>(b.inStock*4+b.products)-(a.inStock*4+a.products) || a.name.localeCompare(b.name,'nb'),
      stock:(a,b)=>b.inStock-a.inStock || b.products-a.products,
      products:(a,b)=>b.products-a.products || b.inStock-a.inStock,
      price:(a,b)=>(a.minPrice??Infinity)-(b.minPrice??Infinity),
      name:(a,b)=>a.name.localeCompare(b.name,'nb')
    };
    return list.sort(sorters[state.sort]);
  }
  function setCard(item){
    const saved=state.favorites.has(item.name);
    return `<article class="inventory-card" tabindex="0" data-kind="set" data-name="${esc(item.name)}">
      <div class="pack-stage">${setImage(item)}<button class="save ${saved?'is-saved':''}" data-save="${esc(item.name)}" aria-label="${saved?'Fjern fra favoritter':'Legg til i favoritter'}">${saved?'♥':'♡'}</button></div>
      <div class="card-info"><span class="status ${item.inStock?'':'out'}">${item.inStock?'På lager':'Ikke på lager'}</span><span class="era">${esc(item.era)}</span><h3>${esc(item.name)}</h3><div class="card-facts"><div><span>Fra</span><strong>${item.minPrice==null?'—':currency.format(item.minPrice)}</strong></div><div><span>Produkter inne</span><strong>${item.inStock} av ${item.products}</strong></div></div></div><span class="card-arrow">↗</span>
    </article>`;
  }
  function storeCard(item){
    return `<article class="inventory-card store-card" tabindex="0" data-kind="store" data-name="${esc(item.name)}">
      <div class="store-top"><div class="store-logo">${esc(initials(item.name)||'PK')}</div><span class="verified ${item.verified?'':'unverified'}">${item.verified?'Kontrollert':'Ny kandidat'}</span></div>
      <h3>${esc(item.name)}</h3><div class="store-category">${esc(item.category)}</div>
      <div class="store-metrics"><div><span>Produkter fulgt</span><strong>${item.products||'–'}</strong></div><div><span>På lager</span><strong>${item.inStock||'–'}</strong></div></div><span class="card-arrow">↗</span>
    </article>`;
  }
  function bindImages(){document.querySelectorAll('.pack-stage img').forEach(img=>img.addEventListener('error',()=>imageFallback(img),{once:false}));}
  function render(){
    const items=filtered();
    grid.innerHTML=items.map(x=>state.view==='stores'?storeCard(x):setCard(x)).join('');
    $('resultCount').textContent=items.length;
    $('empty').hidden=items.length>0;grid.hidden=items.length===0;
    $('favoriteCount').textContent=state.favorites.size;
    bindImages();
    document.querySelectorAll('[data-save]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();toggleFavorite(btn.dataset.save)}));
    document.querySelectorAll('.inventory-card').forEach(card=>{
      const open=()=>openDetail(card.dataset.kind,card.dataset.name);
      card.addEventListener('click',open); card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    });
  }
  function toggleFavorite(name){
    state.favorites.has(name)?state.favorites.delete(name):state.favorites.add(name);
    localStorage.setItem('pokeinventar:favorites',JSON.stringify([...state.favorites]));
    if('setAppBadge' in navigator){state.favorites.size?navigator.setAppBadge(state.favorites.size):navigator.clearAppBadge();}
    render();
  }
  function updateView(view){
    state.view=view;state.query='';state.status='all';state.era='all';state.maxPrice='all';$('search').value='';$('eraFilter').value='all';$('priceFilter').value='all';
    document.querySelectorAll('.nav-tab').forEach(b=>b.classList.toggle('is-active',b.dataset.view===view));
    document.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('is-active',b.dataset.status==='all'));
    const copy={
      sets:['ALLE SETT','Velg etter motiv, pris eller tilgjengelighet','Boosterpakkene vises med original pakkegrafikk der den er tilgjengelig.','Søk etter sett …'],
      stores:['BUTIKKER I NORGE','Finn en forhandler som passer deg','Sorter butikkene som kort etter utvalg og registrert tilgjengelighet.','Søk etter butikk …'],
      favorites:['DINE FAVORITTER','Alt du følger på ett sted','Favoritter lagres på denne enheten og kan brukes til fremtidige lageralarmer.','Søk i favoritter …']
    }[view];
    $('catalogKicker').textContent=copy[0];$('catalogTitle').textContent=copy[1];$('catalogIntro').textContent=copy[2];$('search').placeholder=copy[3];
    $('eraFilterWrap').hidden=view==='stores';
    render();updateFilterCount();$('catalog').scrollIntoView({behavior:'smooth'});
  }
  function openDetail(kind,name){
    const item=(kind==='set'?sets:stores).find(x=>x.name===name);if(!item)return;
    if(kind==='set'){
      $('dialogBody').innerHTML=`<div class="detail-layout"><div class="detail-art">${setImage(item)}</div><div class="detail-copy"><span class="status ${item.inStock?'':'out'}">${item.inStock?'På lager':'Ikke på lager'}</span><h2>${esc(item.name)}</h2><p>${esc(item.era)}. Oversikten er klargjort for å vise butikktilbud og prisendringer fra en egen datatjeneste.</p><div class="detail-stats"><div><span>Produkter fulgt</span><strong>${item.products}</strong></div><div><span>Registrert på lager</span><strong>${item.inStock}</strong></div><div><span>Laveste pris</span><strong>${item.minPrice==null?'—':currency.format(item.minPrice)}</strong></div><div><span>Varsling</span><strong>${state.favorites.has(item.name)?'Følges':'Ikke fulgt'}</strong></div></div><button class="button primary full" data-dialog-save="${esc(item.name)}">${state.favorites.has(item.name)?'Fjern fra favoritter':'Følg dette settet'}</button></div></div>`;
      bindImages();
      document.querySelector('[data-dialog-save]').addEventListener('click',()=>{toggleFavorite(item.name);$('detailDialog').close();});
    }else{
      $('dialogBody').innerHTML=`<div class="detail-copy" style="padding:50px"><span class="verified ${item.verified?'':'unverified'}">${item.verified?'Kontrollert oppføring':'Ny kandidat'}</span><h2>${esc(item.name)}</h2><p>Kategori: ${esc(item.category)}. Denne prototypen registrerer ${item.products||0} produkter og ${item.inStock||0} produkter på lager for butikken.</p><div class="detail-stats"><div><span>Produkter fulgt</span><strong>${item.products||'–'}</strong></div><div><span>På lager</span><strong>${item.inStock||'–'}</strong></div></div><p class="tiny">En produksjonsversjon bør lenke direkte til butikkens egen produktside og hente lagerdata med tillatelse.</p></div>`;
    }
    $('detailDialog').showModal();
  }
  function updateFilterCount(){
    const n=(state.status!=='all')+(state.era!=='all')+(state.maxPrice!=='all');$('filterCount').hidden=!n;$('filterCount').textContent=n;
  }

  async function registerSW(){if(!('serviceWorker' in navigator))throw new Error('Service worker støttes ikke');return navigator.serviceWorker.register('./sw.js');}
  function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;}
  async function activateNotifications(){
    const status=$('notificationStatus');
    try{
      const registration=await registerSW();
      if(!('Notification' in window))throw new Error('Varsler støttes ikke i denne nettleseren.');
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error('Tillatelse til varsler ble ikke gitt.');
      localStorage.setItem('pokeinventar:notifications','enabled');
      status.textContent=isStandalone()?'Varsler er aktivert.':'Varsler er tillatt. På iPhone må appen åpnes fra hjemskjermen for Web Push.';
      await registration.showNotification('PokéInventar er klar!',{body:'Du kan nå følge favorittsett og teste lageralarmer.',icon:'assets/icon-192.png',badge:'assets/badge-96.png',tag:'pokeinventar-ready',data:{url:'./#catalog'}});
      $('notifyDialog').close();
    }catch(err){status.textContent=err.message;}
  }
  async function testNotification(){
    const status=$('notificationStatus');
    try{
      const registration=await registerSW();
      if(Notification.permission!=='granted')throw new Error('Aktiver varsler først.');
      const favorite=[...state.favorites][0]||'Perfect Order';
      await registration.showNotification('Lageralarm',{body:`${favorite} er tilbake på lager fra 85 kr.`,icon:'assets/icon-192.png',badge:'assets/badge-96.png',tag:'inventory-test',data:{url:'./#catalog'}});
      status.textContent='Testvarsel sendt.';
    }catch(err){status.textContent=err.message;}
  }

  [...new Set(sets.map(s=>s.era))].forEach(era=>$('eraFilter').insertAdjacentHTML('beforeend',`<option value="${esc(era)}">${esc(era)}</option>`));
  document.querySelectorAll('.nav-tab').forEach(b=>b.addEventListener('click',()=>updateView(b.dataset.view)));
  $('browseSets').addEventListener('click',()=>updateView('sets'));$('browseStores').addEventListener('click',()=>updateView('stores'));
  $('search').addEventListener('input',e=>{state.query=e.target.value;render()});$('sort').addEventListener('change',e=>{state.sort=e.target.value;render()});
  $('filterToggle').addEventListener('click',()=>{$('filterPanel').hidden=!$('filterPanel').hidden});
  document.querySelectorAll('[data-status]').forEach(b=>b.addEventListener('click',()=>{state.status=b.dataset.status;document.querySelectorAll('[data-status]').forEach(x=>x.classList.toggle('is-active',x===b));updateFilterCount();render()}));
  $('eraFilter').addEventListener('change',e=>{state.era=e.target.value;updateFilterCount();render()});$('priceFilter').addEventListener('change',e=>{state.maxPrice=e.target.value;updateFilterCount();render()});
  $('reset').addEventListener('click',()=>updateView(state.view));
  $('dialogClose').addEventListener('click',()=> $('detailDialog').close());$('detailDialog').addEventListener('click',e=>{if(e.target===$('detailDialog'))$('detailDialog').close()});
  const openNotify=()=> $('notifyDialog').showModal();$('notifyTop').addEventListener('click',openNotify);$('enableNotifications').addEventListener('click',openNotify);$('notifyClose').addEventListener('click',()=> $('notifyDialog').close());
  $('confirmNotifications').addEventListener('click',activateNotifications);$('testNotification').addEventListener('click',testNotification);
  window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('search').focus();}});

  $('setCount').textContent=sets.length;$('storeCount').textContent=stores.length;$('storeHeroCount').textContent=stores.length;$('availableCount').textContent=sets.filter(s=>s.inStock>0).length;
  if(localStorage.getItem('pokeinventar:notifications')==='enabled')$('notificationStatus').textContent='Varsler er aktivert på denne enheten.';
  registerSW().catch(()=>{});render();
})();
