// Start npm run dev first. All API calls are intercepted; no production data is used.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {handleRequest} from '../server/worker.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {gs,login,props}=require('./store-fixture.cjs'),student=login('A1B2','flow-student-1234567890','flow','요청 테스트');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4317',env={SHEETS_API_URL:'https://script.google.com/macros/s/test/exec',SHEETS_BRIDGE_SECRET:props.BRIDGE_SECRET};
const calls=[],errors=[];let active=0,max=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(String(url),env.SHEETS_API_URL);const args=JSON.parse(options.body);calls.push(args.action);max=Math.max(max,++active);try{await new Promise(r=>setTimeout(r,40));return new Response(JSON.stringify(gs(args)));}finally{active--;}};
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
try{
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 await ctx.addCookies([{name:'robotland_session',value:student.token,url:base,httpOnly:true,sameSite:'Lax'}]);
 await ctx.route('**/api/**',async route=>{const r=route.request(),body=r.postData(),response=await handleRequest(new Request(r.url(),{method:r.method(),headers:await r.allHeaders(),...(body?{body}:{})}),env);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});});
 await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.waitForFunction(()=>document.getElementById('recoveryStatus').textContent.includes('준비됐어요'));
 assert.equal(calls.filter(a=>a==='registerRecovery').length,1);assert.equal(max,1);
 await page.clock.install();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 await new Promise(r=>setTimeout(r,150));const hiddenCount=calls.length;await page.clock.runFor(65000);assert.equal(calls.length,hiddenCount,'hidden page stops polling');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});for(let i=0;i<8;i++){document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));}});
 await new Promise(r=>setTimeout(r,700));
 assert.equal(calls.filter(a=>a==='registerRecovery').length,1,'foreground events do not rewrite recovery credentials');
 assert.equal(calls.slice(hiddenCount).filter(a=>a==='session').length,1,'foreground session checks coalesce');
 assert.equal(calls.slice(hiddenCount).filter(a=>a==='groups').length,1,'foreground group checks coalesce');
 assert.equal(max,1);assert.equal(await page.evaluate(()=>RobotlandIdentity.deviceId),student.user.deviceId);assert.deepEqual(errors,[]);
 console.log('PASS request flow: serial startup, hidden polling stop, repeated foreground checks coalesced, one recovery registration and retained identity.');
}finally{await browser.close();globalThis.fetch=originalFetch;}
