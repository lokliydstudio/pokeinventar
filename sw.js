const CACHE='pokeinventar-v3';
const LOCAL=['./','./index.html','./styles.css','./data.js','./app.js','./manifest.webmanifest','./assets/favicon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/pack-fallback.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(LOCAL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response;})));
});
self.addEventListener('push',event=>{
  let data={title:'PokéInventar',body:'Et sett du følger har endret lagerstatus.',url:'./#catalog'};
  try{data={...data,...event.data.json()}}catch(_){if(event.data)data.body=event.data.text()}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'assets/icon-192.png',badge:'assets/badge-96.png',tag:data.tag||'inventory-update',data:{url:data.url}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'./';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if('focus' in client){client.navigate(target);return client.focus();}}return clients.openWindow(target);}));
});
