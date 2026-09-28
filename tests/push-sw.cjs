const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const handlers={},shown=[],messages=[],opened=[];let focused=0,closed=0,windows=[];
const context=vm.createContext({URL,URLSearchParams,self:{location:{origin:'https://robotland-trip.netlify.app'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)}}});
vm.runInContext(fs.readFileSync(__dirname+'/../public/sw.js','utf8'),context);
async function event(name,data){let promise;handlers[name]({...data,waitUntil:p=>promise=p});await promise;}
(async()=>{
await event('push',{data:{json:()=>({title:'반 공지',body:'공지 확인',tag:'robotland-1',data:{classId:'class-a',noticeId:'notice-a',url:'https://evil.test/'}})}});
assert.equal(shown.length,1);assert.equal(shown[0].options.renotify,false);assert.equal(shown[0].options.data.url,'/?notice=notice-a&class=class-a');
await event('notificationclick',{notification:{data:shown[0].options.data,close:()=>closed++}});assert.equal(opened[0],'https://robotland-trip.netlify.app/?notice=notice-a&class=class-a');
windows=[{url:'https://robotland-trip.netlify.app/',focus:async()=>focused++,postMessage:value=>messages.push(value)}];await event('notificationclick',{notification:{data:{test:true,url:'https://evil.test'},close:()=>closed++}});assert.equal(focused,1);assert.equal(messages[0].type,'robotland-open-notice');assert.equal(opened.length,1);
await event('push',{data:{json:()=>{throw new Error('malformed')}}});assert.equal(shown[1].title,'로봇랜드 새 공지');assert.equal(closed,2);
console.log('PASS notification worker: visible notification, stable replacement tag, same-origin opening, existing-app focus and malformed payload fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
