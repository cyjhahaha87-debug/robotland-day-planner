import assert from 'node:assert/strict';

// Model Safari's visual viewport (including pan and safe area), Android's
// resized layout viewport, and a short landscape screen. No production data.
export async function checkKeyboard(page, { staff = false, screenshot } = {}) {
 const input = staff ? 'staffMessageText' : 'messageText';
 const list = staff ? 'staffMessages' : 'messageList';
 const form = staff ? 'staffMessageForm' : 'messageForm';
 const send = staff ? 'sendStaffMessage' : 'sendMessage';
 const cases = [
  {name:'iphone',width:393,full:852,height:360,top:24,safe:59},
  {name:'small',width:320,full:568,height:260,top:0,safe:0},
  {name:'android',width:360,full:740,height:280,top:0,safe:0,layout:true},
  {name:'landscape',width:667,full:375,height:200,top:0,safe:0}
 ];
 for (const c of cases) {
  await page.setViewportSize({width:c.width,height:c.full});
  await page.waitForTimeout(40);
  await page.evaluate(safe => {
   document.documentElement.style.setProperty('--safe-top',safe+'px');
   document.documentElement.style.setProperty('--safe-bottom','34px');
  },c.safe);
  await page.locator('#'+input).fill('키보드 검증\n두 번째 줄\n세 번째 줄\n네 번째 줄');
  await page.locator('#'+input).focus();
  await page.evaluate(({list,staff})=>{
   if(!staff)document.getElementById('pinnedNotice').open=true;
   const el=document.getElementById(list);el.scrollTop=el.scrollHeight;
  },{list,staff});
  await page.waitForTimeout(40);
  if(c.layout)await page.setViewportSize({width:c.width,height:c.height});
  else await page.evaluate(c=>{
   Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>c.height});
   Object.defineProperty(visualViewport,'offsetTop',{configurable:true,get:()=>c.top});
   visualViewport.dispatchEvent(new Event('resize'));
  },c);
  await page.waitForTimeout(80);
  const b=await page.evaluate(({input,list,form,send})=>{
   const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
   const el=document.getElementById(list);
   return{keyboard:document.body.dataset.chatKeyboard,list:rect(list),form:rect(form),input:rect(input),send:rect(send),font:getComputedStyle(document.getElementById(input)).fontSize,bottomGap:el.scrollHeight-el.scrollTop-el.clientHeight,overflow:document.documentElement.scrollWidth-innerWidth};
  },{input,list,form,send});
  const label=(staff?'staff':'class')+' '+c.name+' '+JSON.stringify(b);
  assert.equal(b.keyboard,'true',label);
  assert.ok(b.list.height >= (c.height-Math.max(0,c.safe-c.top))*0.52,label+' usable timeline');
  assert.ok(b.list.top>=c.top-1 && b.form.bottom<=c.top+c.height+1,label+' within visual viewport');
  assert.ok(b.list.bottom<=b.form.top+1,label+' composer does not overlap messages');
  assert.ok(b.send.top>=b.input.top-1 && b.send.bottom<=b.input.bottom+1,label+' send shares input row');
  assert.ok(b.input.height<=66 && parseFloat(b.font)>=16,label+' bounded input, no iOS focus zoom');
  assert.ok(b.bottomGap<2,label+' latest message remains visible');
  assert.ok(b.overflow<=1,label+' no horizontal overflow');
  if(c.name==='iphone' && screenshot)await page.screenshot({path:screenshot,clip:{x:0,y:0,width:c.width,height:c.top+c.height}});
  // Moving focus to Send must not restore all menus above the still-open keyboard.
  await page.locator('#'+send).focus();await page.waitForTimeout(40);
  assert.equal(await page.evaluate(()=>document.body.dataset.chatKeyboard),'true');
  // Scrolling back through older messages must survive visual-viewport panning.
  await page.evaluate(list=>{document.getElementById(list).scrollTop=0;},list);
  await page.waitForTimeout(40);
  await page.evaluate(()=>visualViewport.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(40);
  assert.equal(await page.locator('#'+list).evaluate(el=>el.scrollTop),0,'reading older messages is preserved');
  await page.locator('#'+input).focus();
  if(c.layout)await page.setViewportSize({width:c.width,height:c.full});
  else await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(()=>document.body.dataset.chatKeyboard),'false',c.name+' native keyboard dismissal restores navigation even while input stays focused');
  await page.locator('.mobile-nav').waitFor({state:c.name==='landscape'?'hidden':'visible'});
  await page.locator('#'+input).blur();
 }
 await page.evaluate(()=>{
  document.documentElement.style.removeProperty('--safe-top');document.documentElement.style.removeProperty('--safe-bottom');
  document.getElementById('pinnedNotice').open=false;
 });
 await page.setViewportSize({width:320,height:568});
}
