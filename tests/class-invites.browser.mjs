import {createRequire} from 'node:module';
import {once} from 'node:events';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {handleRequest} from '../server/worker.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {gs,login,sheets,props}=require('./store-fixture.cjs');
const teacher=login('T1E2','qr-teacher-device-1234567890','teacher','담임');
const originalFetch=globalThis.fetch,requests=[],errors=[],publicDir=path.resolve('public');
const env={SHEETS_API_URL:'https://script.google.com/macros/s/test/exec',SHEETS_BRIDGE_SECRET:props.BRIDGE_SECRET,CLIENT_IP:'qr-test',ASSETS:{async fetch(request){
 const name=decodeURIComponent(new URL(request.url).pathname.slice(1))||'index.html',file=path.resolve(publicDir,name);
 if(!file.startsWith(publicDir+path.sep)||!fs.existsSync(file))return new Response('Not found',{status:404});
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
 return new Response(fs.readFileSync(file),{headers:{'content-type':type+'; charset=utf-8'}});
}}};
let holdClass=null;
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith(env.SHEETS_API_URL)){
  const args=JSON.parse(options.body);if(args.action==='classInfo'&&holdClass)await holdClass;
  return new Response(JSON.stringify(gs(args)),{headers:{'content-type':'application/json'}});
 }
 return originalFetch(url,options);
};
const server=http.createServer(async(req,res)=>{try{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
 const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
 if(req.url.startsWith('/api/'))requests.push({path:req.url,body:body.length?JSON.parse(body):null});
 const response=await handleRequest(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){errors.push(error.stack);res.writeHead(500);res.end('test server error');}});
server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
async function context(lang='ko',signedIn=false){
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
 await ctx.route('https://fonts.googleapis.com/**',route=>route.abort());await ctx.route('https://fonts.gstatic.com/**',route=>route.abort());
 await ctx.addInitScript(lang=>localStorage.setItem('robotland-language',lang),lang);
 if(signedIn)await ctx.addCookies([{name:'robotland_session',value:teacher.token,url:base,httpOnly:true,sameSite:'Lax'}]);
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.stack));return{ctx,page};
}
async function ready(page){await page.waitForFunction(()=>window.RobotlandClassroom?.connected);await page.evaluate(()=>RobotlandClassroom.ready);}
async function shownQr(page){await page.waitForFunction(()=>document.getElementById('shareAppUrl').value.includes('#class='));}
async function fits(page){for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(await page.locator('#shareDialog .share-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}}
try{
 for(const lang of ['ko','en','zh','ru']){
  const {ctx,page}=await context(lang,true);await page.goto(base);await ready(page);
  // The teacher has no group, but can still invite the entire class.
  assert.equal(await page.evaluate(()=>RobotlandGroups.myGroup),null);
  await page.evaluate(()=>{window.qrValues=[];const original=window.qrcode;window.qrcode=(...args)=>{const qr=original(...args),add=qr.addData;qr.addData=(value,...rest)=>{qrValues.push(value);return add(value,...rest);};return qr;};});
  await page.locator('#openShare').click();await page.locator('#shareModeClass').click();await shownQr(page);
  const invitation=await page.locator('#shareAppUrl').inputValue();
  assert.equal(invitation,'https://robotland-trip.netlify.app/#class=A1B2');
  assert.deepEqual(await page.evaluate(()=>qrValues),[invitation],'QR encodes the student invitation');
  assert.ok(!(await page.locator('#shareDialog').innerText()).includes('T1E2'),'teacher secret is absent');
  assert.ok((await page.locator('#shareDescription').textContent()).includes('2학년 3반'));
  assert.equal(await page.locator('#appShareQr').evaluate(async img=>{await img.decode();return img.naturalWidth>0;}),true);
  await fits(page);
  if(process.env.QR_SCREENSHOT_DIR){fs.mkdirSync(process.env.QR_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.QR_SCREENSHOT_DIR,lang+'-teacher-qr.png')});}
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveShareQr').click()]);
  assert.equal(await download.failure(),null);assert.ok(download.suggestedFilename().endsWith('.png'));
  await page.locator('#closeShare').click();await page.waitForFunction(()=>!history.state?.robotlandShare);
  await page.locator('.mobile-nav [data-mobile-view="chat"]').click();await page.locator('#classOptions').click();
  await page.locator('#shareClassInvite').click();await shownQr(page);
  await page.locator('#closeShare').click();assert.equal(await page.locator('#classSettingsDialog').evaluate(el=>el.open),true,'closing nested QR retains settings');
  await page.locator('#closeClassSettings').click();await page.waitForFunction(()=>!history.state?.robotlandSettings);
  // A teacher can scan their QR safely: no role change before explicit join.
  const loginCount=requests.filter(r=>r.path==='/api/login').length;
  await page.goto(base+'/#class=A1B2');await ready(page);await page.locator('#inviteNickname').waitFor();
  assert.equal(await page.evaluate(()=>RobotlandClassroom.user.role),'teacher');
  assert.equal(requests.filter(r=>r.path==='/api/login').length,loginCount);
  assert.equal(await page.locator('#joinInvitation').textContent(),await page.evaluate(()=>RobotlandI18n.text('학생으로 반 입장')));
  await page.locator('#closeInvite').click();assert.equal(await page.evaluate(()=>RobotlandClassroom.user.role),'teacher');
  await ctx.close();
  // A new student scans the exact generated link and joins through the real existing backend.
  const student=await context(lang);await student.page.goto(base+new URL(invitation).hash);await ready(student.page);
  if(process.env.QR_SCREENSHOT_DIR)await student.page.screenshot({path:path.join(process.env.QR_SCREENSHOT_DIR,lang+'-student-join.png')});
  await student.page.locator('#inviteNickname').fill('학생 '+lang);await student.page.locator('#joinInvitation').click();
  await student.page.waitForFunction(()=>RobotlandClassroom.user?.role==='student'&&!document.getElementById('inviteDialog').open);
  assert.equal(await student.page.evaluate(()=>RobotlandClassroom.user.classId),'class-a');
  assert.equal(await student.page.evaluate(()=>RobotlandGroups.myGroup),null,'class invitation does not assign a group');
  assert.equal(await student.page.evaluate(()=>location.hash),'');
  assert.equal(requests.filter(r=>r.path==='/api/login').at(-1).body.code,'A1B2');
  await student.page.locator('#openShare').click();assert.equal(await student.page.locator('#shareModeClass').isVisible(),false);
  assert.deepEqual(await student.page.evaluate(()=>[...RobotlandI18n.missing]),[],'all visible strings are translated');
  await student.ctx.close();console.log('PASS class QR '+lang+': teacher without group, QR payload/download, settings, mobile layout, explicit student join, role and class isolation');
 }
 const {ctx,page}=await context('ko',true);await page.goto(base);await ready(page);
 // Expired student codes never produce a usable QR.
 const row=sheets.AccessCodes.data.find(r=>r[0]==='A1B2');row[4]=false;
 await page.locator('#openShare').click();await page.locator('#shareModeClass').click();
 await page.waitForFunction(()=>document.getElementById('shareFeedback').textContent.length>0);
 assert.equal(await page.locator('#shareAppUrl').inputValue(),'');assert.equal(await page.locator('#saveShareQr').isVisible(),false);
 row[4]=true;await page.locator('#closeShare').click();await page.waitForFunction(()=>!history.state?.robotlandShare);
 // An in-flight QR response must not reappear after logout.
 let release;holdClass=new Promise(resolve=>release=resolve);
 await page.locator('#openShare').click();await page.locator('#shareModeClass').click();
 await page.evaluate(()=>RobotlandClassroom.applyUser(null));release();holdClass=null;
 await page.waitForFunction(()=>document.getElementById('shareDialog').getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('#shareModeClass').isVisible(),false);assert.equal(await page.locator('#shareAppUrl').inputValue(),'https://robotland-trip.netlify.app/');
 await ctx.close();
 const invalid=await context();await invalid.page.goto(base+'/#class=bad!');await ready(invalid.page);
 assert.equal(await invalid.page.locator('#joinInvitation').isDisabled(),true);
 await invalid.page.goto(base+'/#class=A9Z8');await ready(invalid.page);await invalid.page.locator('#inviteNickname').fill('오류 학생');await invalid.page.locator('#joinInvitation').click();
 await invalid.page.waitForFunction(()=>document.getElementById('inviteFeedback').textContent.includes('코드가 틀렸거나'));
 assert.equal(await invalid.page.evaluate(()=>RobotlandClassroom.user),null);assert.equal(await invalid.page.locator('#inviteNickname').inputValue(),'오류 학생');
 await invalid.ctx.close();
 // Existing group QR still joins both the class and group.
 const group=gs({action:'createGroup',token:teacher.token,name:'QR 조'}).myGroup;
 const groupInvite=gs({action:'createGroupInvite',token:teacher.token,groupId:group.id,newInviteToken:'c'.repeat(64)});
 assert.equal(groupInvite.ok,true);
 const invited=await context();await invited.page.goto(base+'/#join='+groupInvite.inviteToken);await ready(invited.page);
 await invited.page.waitForFunction(()=>!document.getElementById('joinInvitation').disabled);
 await invited.page.locator('#inviteNickname').fill('조 초대 학생');await invited.page.locator('#joinInvitation').click();
 await invited.page.waitForFunction(()=>RobotlandGroups.myGroup&&!document.getElementById('inviteDialog').open);
 assert.equal(await invited.page.evaluate(()=>RobotlandGroups.myGroup.id),group.id);await invited.ctx.close();
 assert.deepEqual(errors,[]);console.log('PASS class QR failure paths, stale response suppression, existing group invite regression; no production requests');
} finally {await browser.close();server.close();server.closeAllConnections();globalThis.fetch=originalFetch;}
