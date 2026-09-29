import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {once} from 'node:events';import {createRequire} from 'node:module';
import {handleRequest} from '../server/worker.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {gs,login,props,sheets}=require('./store-fixture.cjs');
const teacher=login('T1E2','mobile-teacher-1234567890','teacher','담임');
const teacher2=login('T1E2','mobile-teacher2-123456789','teacher2','보조 교사');
const student=login('A1B2','mobile-student-1234567890','student','조 없는 학생');
const other=login('A1B2','mobile-other-1234567890','other','다른 학생');
const group=gs({action:'createGroup',token:other.token,name:'다른 조'}).myGroup;
const invite=gs({action:'createGroupInvite',token:teacher.token,groupId:group.id,newInviteToken:'b'.repeat(64)});
for(const [who,x]of [[teacher,600],[teacher2,900],[other,1200]])assert.equal(gs({action:'setMemberLocation',token:who.token,x,y:500}).ok,true);
assert.equal(gs({action:'send',token:teacher.token,kind:'notice',messageId:'mobile-notice-123456789',text:'긴 공지 확인: 점심 집합 장소와 시간을 꼭 확인하세요. '.repeat(16)}).ok,true);
for(let i=0;i<8;i++)sheets.Messages.appendRow(['mobile-message-'+i,Date.now()+i+1,'class-a',other.user.deviceId,'student',JSON.stringify('다른 학생'),'message',JSON.stringify('채팅 내용 '+i+' · 도착하면 알려주세요.'),Date.now()]);
let dropNextEntry=false;
const originalFetch=globalThis.fetch,requests=[],errors=[],publicDir=path.resolve('public');
const env={SHEETS_API_URL:'https://script.google.com/macros/s/test/exec',SHEETS_BRIDGE_SECRET:props.BRIDGE_SECRET,CLIENT_IP:'mobile-test',ASSETS:{async fetch(request){
 const name=decodeURIComponent(new URL(request.url).pathname.slice(1))||'index.html',file=path.resolve(publicDir,name);
 if(!file.startsWith(publicDir+path.sep)||!fs.existsSync(file))return new Response('Not found',{status:404});
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
 return new Response(fs.readFileSync(file),{headers:{'content-type':type+'; charset=utf-8'}});
}}};
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith(env.SHEETS_API_URL)){const args=JSON.parse(options.body);requests.push(args.action);const result=gs(args);if(dropNextEntry&&args.action==='joinGroupInvite'&&result.ok){dropNextEntry=false;throw new Error('Simulated lost entry response');}return new Response(JSON.stringify(result));}
 return originalFetch(url,options);
};
const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const response=await handleRequest(new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){errors.push(error.stack);res.writeHead(500);res.end('error');}});
server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const screenshotDir=process.env.MOBILE_SCREENSHOT_DIR;if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
async function pageFor(who,lang='ko',size={width:320,height:568}){
 const ctx=await browser.newContext({viewport:size,serviceWorkers:'block'});
 await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
 await ctx.addInitScript(lang=>localStorage.setItem('robotland-language',lang),lang);
 if(who)await ctx.addCookies([{name:'robotland_session',value:who.token,url:base,httpOnly:true,sameSite:'Lax'}]);
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.stack));await page.goto(base);await page.evaluate(()=>RobotlandClassroom.ready);
 return{ctx,page};
}
async function bounds(page){return page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};};return{list:rect('messageList'),form:rect('messageForm'),nav:document.querySelector('.mobile-nav').getBoundingClientRect().top,empty:rect('chatEmpty'),notice:rect('pinnedNotice'),bodyWidth:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight};});}
try{
 // A teacher needs no group to post their own pin; students receive it through the normal group poll.
 const t=await pageFor(teacher);await t.page.locator('#placeMemberPing').waitFor({state:'visible'});await t.page.waitForFunction(()=>!document.getElementById('placeMemberPing').disabled);
 assert.equal(await t.page.locator('#placeGroupPing').isDisabled(),true);
 await t.page.locator('#placeMemberPing').click();await t.page.locator('#mapViewport').focus();await t.page.keyboard.press('Enter');await t.page.locator('#confirmGroupPing').click();await t.page.waitForFunction(()=>document.getElementById('pingFeedback').textContent.includes('공유했어요'));
 assert.ok(gs({action:'groups',token:student.token}).memberLocations.some(p=>p.name==='담임'));
 if(screenshotDir)await t.page.screenshot({path:path.join(screenshotDir,'teacher-ping.png')});
 await t.ctx.close();
 for(const lang of ['ko','en','zh','ru']){
  const {ctx,page}=await pageFor(student,lang);await page.waitForFunction(()=>!document.getElementById('placeMemberPing').disabled);
  assert.equal(await page.locator('#placeGroupPing').isDisabled(),true);
  assert.equal(await page.locator('[data-member-location]').count(),2,'ungrouped student sees class teachers, not another student');
  await page.locator('#placeMemberPing').click();await page.locator('#mapViewport').focus();await page.keyboard.press('Enter');await page.locator('#confirmGroupPing').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-member-location]').length===3);
  const result=gs({action:'groups',token:teacher.token});assert.ok(result.memberLocations.some(p=>p.name==='조 없는 학생'));
  assert.equal(gs({action:'groups',token:other.token}).memberLocations.some(p=>p.name==='조 없는 학생'),false);
  await page.locator('.mobile-nav [data-mobile-view="chat"]').click();await page.waitForFunction(()=>document.querySelectorAll('#messageList .message').length>=8);
  for(const size of [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:568,height:320}]){
   await page.setViewportSize(size);await page.waitForTimeout(60);const b=await bounds(page);
   assert.ok(b.list.height>=95,lang+' timeline height '+JSON.stringify(b));
   assert.ok(b.form.top>=b.list.bottom-1,lang+' composer does not cover messages');
   assert.ok(b.form.bottom<=b.height,lang+' composer stays onscreen');
   assert.ok(b.bodyWidth<=b.width+1,lang+' no horizontal overflow');
   if(size.width===320){
    assert.ok(b.notice.height<=45,'collapsed notice leaves room for messages');
    if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,lang+'-small-chat.png')});
   }
  }
  await page.setViewportSize({width:320,height:568});await page.locator('#pinnedNotice summary').click();
  const expanded=await bounds(page);assert.ok(expanded.list.height>=95,'expanded notice stays bounded');
  assert.ok(await page.locator('#noticeText').textContent());await page.locator('#pinnedNotice summary').click();
  await page.locator('#openWordChat').click();await page.waitForFunction(()=>!document.getElementById('insertWordChat').disabled);await page.locator('#insertWordChat').click();
  assert.ok(await page.locator('#messageText').inputValue(),'word chat still inserts a draft');
  if(lang==='ko'){
   await page.waitForFunction(()=>!history.state?.robotlandWordChat);await page.waitForTimeout(150);
   await page.locator('#messageText').fill('키보드 확인');await page.locator('#messageText').focus();
   await page.evaluate(()=>{document.getElementById('messageText').focus();Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>300});visualViewport.dispatchEvent(new Event('resize'));});
   await page.waitForTimeout(60);
   assert.equal(await page.evaluate(()=>document.body.dataset.chatKeyboard),'true');
   const keyboard=await bounds(page);assert.ok(keyboard.form.bottom<=301,'composer stays above keyboard');assert.ok(keyboard.list.height>=95,'keyboard leaves a usable timeline');
   if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'keyboard-layout.png')});
   await page.evaluate(()=>{delete visualViewport.height;document.getElementById('messageText').blur();visualViewport.dispatchEvent(new Event('resize'));});
  }
  assert.deepEqual(await page.evaluate(()=>[...RobotlandI18n.missing]),[],lang+' all UI strings translated');
  // Own pin removal never removes a teacher or another student.
  await page.locator('.mobile-nav [data-mobile-view="map"]').click();const own=gs({action:'groups',token:student.token}).memberLocations.find(p=>p.mine);
  await page.locator('[data-member-location="'+own.id+'"]').dispatchEvent('click');await page.locator('#clearGroupPing').click();await page.waitForFunction(()=>document.querySelectorAll('[data-member-location]').length===2);
  await ctx.close();console.log('PASS mobile '+lang+': ungrouped personal pin, class teacher visibility, bounded notice, composer and word chat at four screen sizes');
 }
 // Fresh group QR entry registers recovery in the same write and reuses returned group state.
 const fresh=await pageFor(null);requests.length=0;await fresh.page.goto(base+'/#join='+invite.inviteToken);await fresh.page.evaluate(()=>RobotlandClassroom.ready);
 await fresh.page.locator('#inviteNickname').fill('새 초대 학생');await fresh.page.locator('#joinInvitation').click();await fresh.page.waitForFunction(()=>RobotlandClassroom.user?.nickname==='새 초대 학생');await fresh.page.waitForTimeout(200);
 assert.equal(requests.filter(x=>x==='joinGroupInvite').length,1);assert.equal(requests.filter(x=>x==='registerRecovery').length,0);
 assert.equal(requests.filter(x=>x==='groups').length,0,'QR uses returned group state without re-reading it');
 assert.ok(await fresh.page.evaluate(()=>JSON.parse(localStorage.getItem('robotland-student-recovery-v1')).token));
 assert.equal(await fresh.page.locator('#placeMemberPing').isDisabled(),false,'initial group snapshot survives session events');
 await fresh.ctx.close();
 const retry=await pageFor(null);await retry.page.goto(base+'/#join='+invite.inviteToken);await retry.page.evaluate(()=>RobotlandClassroom.ready);
 await retry.page.locator('#inviteNickname').fill('응답 누락 학생');dropNextEntry=true;await retry.page.locator('#joinInvitation').click();
 await retry.page.waitForFunction(()=>document.getElementById('inviteFeedback').textContent.includes('지금 서버'));
 assert.equal(await retry.page.evaluate(()=>RobotlandClassroom.user),null);
 await retry.page.locator('#joinInvitation').click();await retry.page.waitForFunction(()=>RobotlandClassroom.user?.nickname==='응답 누락 학생');
 assert.equal(sheets.Students.data.filter(r=>r[2]===JSON.stringify('응답 누락 학생')).length,1);
 await retry.ctx.close();assert.deepEqual(errors,[]);console.log('PASS browser fast entry: one join write, inline recovery, no redundant group request, usable initial pin controls');
}finally{await browser.close();server.close();globalThis.fetch=originalFetch;}
