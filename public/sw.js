const CACHE='robotland-onsite-v6';
const FILES=['./','./index.html','./styles.css','./groups.css','./data.js','./ride-times.js','./core.js','./app-lunch.js','./classroom.js','./groups.js','./manifest.webmanifest','./app-icon.svg','./robotland-guide.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('robotland-onsite-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));return;}
 const names=['styles.css','groups.css','data.js','ride-times.js','core.js','app-lunch.js','classroom.js','groups.js','manifest.webmanifest','app-icon.svg','robotland-guide.png'];
 if(names.some(name=>url.pathname.endsWith('/'+name)))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
