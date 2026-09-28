import {createRequire} from 'node:module';import assert from 'node:assert/strict';import fs from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const base=process.env.APP_URL||'http://127.0.0.1:4317',errors=[],sent=[],published=[];
let role='teacher';
const user=()=>({classId:'preview-class',className:'점심 식당',role,nickname:'학생',deviceId:'preview-device-1234567890',recoverySupported:false});
const group={id:'group-one',name:'출입구 광장',code:'G1A2',count:2,members:['학생','선생님'],mine:true,location:{x:1000,y:400,updatedAt:Date.now()},revision:1};
const messages=[{id:'msg-one',sequence:1,classId:'preview-class',deviceId:'someone-else',role:'student',nickname:'학생',kind:'message',text:'우리 반 <hello> ⟦0⟧',createdAt:Date.now()}];
const plan={version:1,stops:[{id:'sky-tower',queue:10,ride:3},{id:'lunch-hall',stay:40},{id:'exit-meeting',stay:0}],start:'10:00',pace:1,lunchTime:'12:00',mealMinutes:40};
const classes=[{id:'preview-class',name:'점심 식당',teachers:['선생님'],memberCount:2,groups:[{...group,plan,updatedAt:Date.now()}]}];
async function mock(route){
 const path=new URL(route.request().url()).pathname;
 let value={ok:true},status=200;
 if(path==='/api/config')value={ok:true,connected:true,pushReady:false};
 else if(path==='/api/session')value={ok:true,user:user()};
 else if(path==='/api/groups')value={ok:true,groups:[group],myGroup:group,people:[{nickname:'학생',role:'student',deviceId:'student-one',groupId:group.id}],locationsSupported:true,memberManagementSupported:true,recoverySupported:true};
 else if(path==='/api/messages')value={ok:true,messages,notice:null,noticeIds:[],cursor:1,noticeDeletionSupported:true};
 else if(path==='/api/class/codes')value={ok:true,studentCode:'A1B2',teacherCode:'T1C2'};
 else if(path==='/api/group-plan')value={ok:true,plan,revision:1,updatedBy:'학생',updatedAt:Date.now()};
 else if(path==='/api/group-plan/save'){published.push(route.request().postDataJSON());value={ok:true,revision:2,updatedBy:'학생',updatedAt:Date.now()};}
 else if(path==='/api/staff')value={ok:true,classes,messages:[{id:'staff-one',classId:'preview-class',nickname:'선생님',text:'공지 · 대화',createdAt:Date.now()}],updatedAt:Date.now()};
 else if(path==='/api/groups/create'){value={ok:false,error:'같은 이름의 조가 있어요. 다른 이름을 입력하세요.'};status=400;}
 else if(path==='/api/messages/send'){sent.push(route.request().postDataJSON());value={ok:true,message:{...messages[0],id:'sent',text:sent.at(-1).text}};}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
}
async function ready(page){await page.waitForFunction(()=>window.RobotlandClassroom?.user&&window.RobotlandGroup);await page.waitForFunction(()=>document.getElementById('openWordChat').textContent.length>0);}
async function change(page,lang){await page.selectOption('#appLanguage',lang);await page.waitForFunction(l=>window.RobotlandI18n?.language===l,lang);await ready(page);}
async function layout(page){
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page overflow '+width);
  for(const id of ['appLanguage','openShare','openPush','installHelp','sendMessage']){
   const b=await page.locator('#'+id).boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=width+1,id+' fits '+width);
   assert.equal(await page.locator('#'+id).evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,id+' text fits '+width);
  }
 }
}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/api/**',mock);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base);await ready(page);
 for(const lang of ['en','zh','ru','ko']){
  await change(page,lang);
  assert.equal(await page.evaluate(()=>document.documentElement.lang),{en:'en',zh:'zh-CN',ru:'ru',ko:'ko-KR'}[lang]);
  const T=key=>page.evaluate(k=>RobotlandI18n.text(k),key);
  await page.locator('.mobile-nav [data-mobile-view="chat"]').click();
  assert.equal(await page.locator('#className').textContent(),'점심 식당','class name preserved');
  assert.equal(await page.locator('.message p').first().textContent(),'우리 반 <hello> ⟦0⟧','message preserved');
  await page.locator('[data-room-view="groups"]').click();
  assert.equal(await page.locator('#myGroupName').textContent(),'출입구 광장','group name preserved');
  await page.locator('#newGroupName').fill('중복 테스트');
  await page.locator('#createGroupButton').click();
  await page.waitForFunction(()=>document.getElementById('groupStatus').textContent.length>0);
  assert.equal(await page.locator('#groupStatus').textContent(),await T('같은 이름의 조가 있어요. 다른 이름을 입력하세요.'));
  await page.locator('[data-room-view="staff"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-staff-group]'));
  await page.locator('[data-staff-group]').click();
  assert.ok((await page.locator('#staffGroupStops').textContent()).includes(await T('스카이타워')));
  await page.locator('#closeStaffGroup').click();
  await page.locator('[data-staff-view="talk"]').click();
  assert.ok((await page.locator('#staffMessages').textContent()).includes('공지 · 대화'));
  await page.locator('#staffMessageText').fill('교사 입력 그대로');
  await page.locator('[data-room-view="chat"]').click();
  await page.locator('[data-report]').first().click();
  assert.equal(await page.locator('#messageText').inputValue(),await T('이동 중입니다.'));
  await page.locator('#messageText').fill('우리 반 ⟦1⟧ draft');
  await page.locator('#openWordChat').click();
  await page.locator('#wordChatTemplate').waitFor({state:'visible'});
  assert.equal(await page.locator('#wordChatLanguage').inputValue(),lang);
  await page.selectOption('#wordChatTemplate','waiting');
  await page.selectOption('#wordChat-place','sky-tower');
  await page.locator('#insertWordChat').click();
  await page.waitForFunction(()=>!history.state?.robotlandWordChat);
  const draft=await page.locator('#messageText').inputValue();assert.ok(draft.startsWith('우리 반 ⟦1⟧ draft'));
  await page.locator('.mobile-nav [data-mobile-view="map"]').click();
  await page.locator('#toggleRestrooms').click();
  await page.selectOption('#restroomSelect','2');
  await page.locator('#closeRestrooms').click();
  await page.locator('#mapExtrasToggle').click();
  if(await page.locator('#chip-sky-tower').getAttribute('aria-pressed')!=='true')await page.locator('#chip-sky-tower').click();
  await page.locator('#mapExtrasClose').click();
  await page.locator('.mobile-nav [data-mobile-view="plan"]').click();
  assert.ok((await page.locator('#routeList').textContent()).includes(await T('스카이타워')));
  const saved=await page.evaluate(()=>RobotlandPlan.snapshot());
  await page.locator('.mobile-nav [data-mobile-view="chat"]').click();
  await layout(page);
  await page.reload();await ready(page);
  assert.deepEqual(await page.evaluate(()=>RobotlandPlan.snapshot()),saved,'route persists on ordinary reload');
  // An ordinary reload need not preserve draft; language change does.
  await page.locator('.mobile-nav [data-mobile-view="chat"]').click();
  await page.locator('#messageText').fill(draft);
  const next={en:'zh',zh:'ru',ru:'ko',ko:'en'}[lang];await change(page,next);
  assert.equal(await page.locator('#messageText').inputValue(),draft,'draft survives language change');
  assert.equal(await page.evaluate(()=>document.body.dataset.view),'chat');
  assert.deepEqual(await page.evaluate(()=>RobotlandPlan.snapshot()),saved);
 }
 console.log('PASS four languages: UI, map names, groups, staff overview, API errors, phrase composer, unmodified user content, preserved route/draft and 320/390px headers.');
 console.log('MISSING',await page.evaluate(()=>Array.from(RobotlandI18n.missing)));
 assert.deepEqual(await page.evaluate(()=>Array.from(RobotlandI18n.missing)),[]);
 // Group draft scope survives a language change.
 await page.locator('[data-room-view="groups"]').click();
 await page.locator('#editGroupPlan').click();
 await page.waitForFunction(()=>RobotlandPlan.getScope().mode==='group');
 await change(page,'ru');await page.waitForFunction(()=>RobotlandPlan.getScope().mode==='group');
 assert.equal(await page.evaluate(()=>RobotlandPlan.getScope().group.id),'group-one');
 await page.locator('#publishGroupPlan').click();await page.waitForFunction(()=>document.getElementById('groupPlanStatus').textContent.includes('2'));
 assert.equal(published.at(-1).baseRevision,1,'language change retains conflict revision');
 await page.setViewportSize({width:844,height:390});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'landscape width');
 await page.setViewportSize({width:390,height:844});
 await page.locator('.mobile-nav [data-mobile-view="chat"]').click();
 await page.locator('[data-room-view="chat"]').click();
 await page.waitForTimeout(200);
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/앱언어팩-러시아어.png'});
 await change(page,'en');
 await page.locator('[data-room-view="groups"]').click();
 await page.waitForTimeout(200);
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/앱언어팩-영어.png'});
 // Cached language files and translated UI work without network.
 const offline=await browser.newContext({viewport:{width:390,height:844}});
 const offlinePage=await offline.newPage();offlinePage.on('pageerror',e=>errors.push(e.stack));
 await offline.route('**/api/**',mock);await offlinePage.goto(base);
 await offlinePage.evaluate(()=>navigator.serviceWorker.ready);await offlinePage.reload();
 await offlinePage.waitForFunction(()=>!!navigator.serviceWorker.controller);await ready(offlinePage);
 await change(offlinePage,'ru');
 await offlinePage.waitForFunction(async()=>await(await(await caches.open('robotland-preferences')).match('/__app-language'))?.text()==='ru');
 await offline.setOffline(true);await offlinePage.reload();
 await offlinePage.waitForFunction(()=>RobotlandI18n?.language==='ru');
 assert.equal(await offlinePage.locator('#sendMessage').textContent(),'Отправить');
 for(const l of ['en','zh','ru'])assert.equal(await offlinePage.evaluate(async lang=>(await fetch('/app-'+lang+'.js')).status,l),200);
 assert.equal(await offlinePage.evaluate(async()=>(await fetch('/manifest-ru.webmanifest')).status),200);
 console.log('PASS group scope retention, landscape layout, service worker language preference and offline packs.');
 assert.deepEqual(errors,[]);assert.equal(sent.length,0);
}finally{await browser.close();}
