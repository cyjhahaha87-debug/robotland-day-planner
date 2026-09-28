if(typeof importScripts==='function')importScripts('app-ko.js','app-en.js','app-zh.js','app-ru.js');
const CACHE='robotland-onsite-v9';
const FILES=['./app-ko.js','./app-en.js','./app-zh.js','./app-ru.js','./i18n.js','./i18n-data.js','./i18n.css','./manifest-en.webmanifest','./manifest-zh.webmanifest','./manifest-ru.webmanifest','./chat-phrases.js','./word-chat.js','./word-chat.css','./chat-ko.json','./chat-en.json','./chat-zh.json','./chat-ru.json','./','./index.html','./styles.css','./groups.css','./pings.css','./pings.js','./install.js','./staff.js','./staff.css','./share.js','./invites.js','./qrcode.js','./share.css','./mobile-safe.css','./recovery.css','./recovery.js','./restrooms.css','./restrooms.js','./push.css','./push.js','./app-icon-192.png','./app-icon-512.png','./app-qr.png','./data.js','./ride-times.js','./core.js','./app-lunch.js','./classroom.js','./groups.js','./manifest.webmanifest','./app-icon.svg','./robotland-guide.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('robotland-onsite-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));return;}
 const names=['app-ko.js','app-en.js','app-zh.js','app-ru.js','i18n.js','i18n-data.js','i18n.css','manifest-en.webmanifest','manifest-zh.webmanifest','manifest-ru.webmanifest','chat-phrases.js','word-chat.js','word-chat.css','chat-ko.json','chat-en.json','chat-zh.json','chat-ru.json','styles.css','groups.css','pings.css','pings.js','install.js','staff.js','staff.css','share.js','invites.js','qrcode.js','share.css','mobile-safe.css','recovery.css','recovery.js','restrooms.css','restrooms.js','push.css','push.js','app-icon-192.png','app-icon-512.png','app-qr.png','data.js','ride-times.js','core.js','app-lunch.js','classroom.js','groups.js','manifest.webmanifest','app-icon.svg','robotland-guide.png'];
 if(names.some(name=>url.pathname.endsWith('/'+name)))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});

self.addEventListener('message',event=>{
 if(event.data?.type!=='robotland-language'||!['ko','en','zh','ru'].includes(event.data.language))return;
 event.waitUntil(caches.open('robotland-preferences').then(cache=>cache.put('/__app-language',new Response(event.data.language))));
});
async function noticeLanguage(){
 try{const saved=await(await caches.open('robotland-preferences')).match('/__app-language');return saved?await saved.text():'ko';}catch{return 'ko';}
}
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 const data=payload.data||{},safe={classId:String(data.classId||''),noticeId:String(data.noticeId||''),test:data.test===true};
 const search=new URLSearchParams(safe.test?{pushTest:'1'}:{notice:safe.noticeId,class:safe.classId});
 event.waitUntil((async()=>{
 const language=await noticeLanguage(),pack=globalThis.RobotlandAppPacks?.[language]?.notifications;
 const title=language!=='ko'&&pack?(safe.test?pack.testTitle:pack.title):String(payload.title||'로봇랜드 새 공지');
 const body=language!=='ko'&&pack?(safe.test?pack.testBody:pack.body):String(payload.body||'앱을 열어 공지를 확인해 주세요.');
 await self.registration.showNotification(title.slice(0,80),{body:body.slice(0,200),tag:String(payload.tag||'robotland-notice').slice(0,100),icon:'/app-icon-192.png',badge:'/app-icon-192.png',renotify:false,data:{...safe,url:'/?'+search.toString()}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const data=event.notification.data||{};
 // Build the target locally so a payload can never navigate to another site.
 const search=new URLSearchParams(data.test?{pushTest:'1'}:{notice:String(data.noticeId||''),class:String(data.classId||'')});
 const url=new URL('/?'+search.toString(),self.location.origin).href;
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=windows.find(c=>new URL(c.url).origin===self.location.origin);if(client){await client.focus();client.postMessage({type:'robotland-open-notice',data});}else await self.clients.openWindow(url);})());
});
