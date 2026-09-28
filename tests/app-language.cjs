const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../public/',langs=['ko','en','zh','ru'];
const code=file=>fs.readFileSync(root+file,'utf8');
const packs={};for(const lang of langs){const s={};vm.runInNewContext(code('app-'+lang+'.js'),s);packs[lang]=s.RobotlandAppPacks[lang];}
const ids=s=>[...s.matchAll(/⟦(\d+)⟧/g)].map(m=>m[1]).sort().join();
const data={window:{}};vm.runInNewContext(code('data.js'),data);
for(const lang of langs){
 const pack=packs[lang];
 assert.deepEqual(Object.keys(pack.messages).sort(),Object.keys(packs.ko.messages).sort(),lang+' catalog');
 for(const [key,value]of Object.entries(pack.messages)){assert.ok(value.trim());assert.equal(ids(value),ids(key),lang+' placeholders '+key);}
 for(const place of data.window.MAP_DATA.attractions)assert.ok(pack.places[place.id],lang+' place '+place.id);
 const select={value:'',addEventListener(){}};
 const context={RobotlandAppPacks:packs,window:{},localStorage:{getItem:k=>k==='robotland-language'?lang:null},document:{documentElement:{querySelectorAll:()=>[]},createTreeWalker:()=>({nextNode:()=>false}),querySelector:()=>null,getElementById:id=>id==='appLanguage'?select:null,addEventListener(){}},NodeFilter:{SHOW_TEXT:4}};
 vm.runInNewContext(code('i18n.js'),context);const api=context.window.RobotlandI18n,T=api.text;
 assert.equal(api.language,lang);
 assert.equal(T('보내기'),pack.messages['보내기']);
 const userText='우리 반 <hello> ⟦0⟧';
 assert.ok(T('⟦0⟧을 추가하고 시간을 맞췄어요',[userText]).includes(userText),'dynamic content is not rescanned');
 const html=T('<button data-id="sky-tower" aria-label="⟦0⟧ 동선에서 삭제">보내기</button>',['이름 &lt;x&gt;']);
 assert.ok(html.includes('data-id="sky-tower"'));assert.ok(html.includes('이름 &lt;x&gt;'));
 assert.ok(html.includes('>'+pack.messages['보내기']+'</button>'));
 const result={ok:false,error:'반을 찾을 수 없어요.',message:{text:'반을 찾을 수 없어요.'},className:'점심 식당',push:{error:'요청을 찾을 수 없어요.'}};
 api.apiResult(result);assert.equal(result.error,pack.messages['반을 찾을 수 없어요.']);assert.equal(result.message.text,'반을 찾을 수 없어요.');assert.equal(result.className,'점심 식당');assert.equal(result.push.error,pack.messages['요청을 찾을 수 없어요.']);
 assert.equal(T('unknown'), 'unknown');
}
// Every translated application template is present in the four packs.
for(const file of ['app-lunch.js','classroom.js','groups.js','pings.js','staff.js','share.js','invites.js','push.js','recovery.js','restrooms.js']){
 for(const m of code(file).matchAll(/\bT\(("(?:\\.|[^"\\])*")/g)){
  const source=JSON.parse(m[1]);
  if(Object.hasOwn(packs.ko.messages,source.trim()))continue;
  for(const fragment of source.split(/(<[^>]*>)/g)){
   const parts=fragment.startsWith('<')?[...fragment.matchAll(/\b(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map(x=>x[1]):[fragment];
   for(const part of parts)if(/[가-힣]/.test(part))assert.ok(Object.hasOwn(packs.ko.messages,part.trim()),file+': '+part);
  }
 }
}
(async()=>{
 for(const lang of langs){
  const handlers={},shown=[];
  const scope={URL,URLSearchParams,Response,RobotlandAppPacks:packs,
   caches:{open:async()=>({match:async()=>new Response(lang)})},
   self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,options)=>shown.push({title,options})}}};
  vm.runInNewContext(code('sw.js'),scope);
  let work;handlers.push({data:{json:()=>({data:{test:true}})},waitUntil:p=>work=p});await work;
  assert.equal(shown[0].title,lang==='ko'?'로봇랜드 새 공지':packs[lang].notifications.testTitle);
  assert.equal(shown[0].options.data.url,'/?pushTest=1');
 }
 console.log('PASS app language: '+Object.keys(packs.en.messages).length+' keys, four matching catalogs, facility coverage, template coverage, placeholder safety, user-content preservation, API error and notification localization.');
})().catch(error=>{console.error(error);process.exitCode=1;});
