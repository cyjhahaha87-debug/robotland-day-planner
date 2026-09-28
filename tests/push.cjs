const assert=require('node:assert/strict'),crypto=require('node:crypto'),webpush=require('web-push');
const{gs,login,sheets,props,advanceTime}=require('./store-fixture.cjs');
const act=(who,action,args={})=>gs({token:who.token,action,...args});
const vapid=webpush.generateVAPIDKeys();
function sub(id){const pair=crypto.createECDH('prime256v1');pair.generateKeys();return{endpoint:'https://web.push.apple.com/Q'+id,keys:{p256dh:pair.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};}
const a=login('A1B2','push-student-12345678901','a','학생A'),b=login('B1C2','push-student-22345678901','b','학생B'),t=login('T1E2','push-teacher-12345678901','t','선생님');
const sa=sub('a'),sb=sub('b');
assert.equal(act(a,'pushStatus').supported,true);assert.equal(act(a,'pushSubscribe',{subscription:sa}).registered,true);assert.equal(act(b,'pushSubscribe',{subscription:sb}).registered,true);
assert.equal(act(t,'pushStatus').registered,false);assert.ok(!JSON.stringify(act(a,'pushStatus')).includes('endpoint'));
assert.equal(act(a,'send',{text:'학생 공지',kind:'notice',messageId:crypto.randomUUID(),pushEnabled:true}).status,403);
assert.equal(act(a,'send',{text:'대화',kind:'message',messageId:crypto.randomUUID(),pushEnabled:true}).pushJobId,undefined);advanceTime(2001);
assert.equal(act(a,'send',{text:'상황 보고',kind:'report',messageId:crypto.randomUUID(),pushEnabled:true}).pushJobId,undefined);
const messageId=crypto.randomUUID(),notice=act(t,'send',{text:'집합 안내',kind:'notice',messageId,pushEnabled:true});assert.ok(notice.pushJobId);
assert.equal(act(t,'send',{text:'중복 요청',kind:'notice',messageId,pushEnabled:true}).pushJobId,notice.pushJobId);assert.equal(rows('PushJobs').length,1);
const lease=crypto.randomBytes(32).toString('hex'),claim=gs({action:'pushClaim',jobId:notice.pushJobId,leaseKey:lease});assert.equal(claim.targets.length,1);assert.equal(claim.targets[0].subscription.endpoint,sa.endpoint);assert.ok(!JSON.stringify(claim.payload).includes('집합 안내'),'notification payload keeps full notice in the authenticated app');
assert.equal(gs({action:'pushClaim',jobId:notice.pushJobId,leaseKey:crypto.randomBytes(32).toString('hex')}).busy,true);
assert.equal(gs({action:'pushComplete',jobId:notice.pushJobId,leaseKey:'wrong',delivered:[]}).status,409);
assert.equal(gs({action:'pushComplete',jobId:notice.pushJobId,leaseKey:lease,delivered:[claim.targets[0].id]}).ok,true);assert.equal(gs({action:'pushClaim',jobId:notice.pushJobId,leaseKey:lease}).done,true);
const test=act(a,'pushTest');assert.equal(test.delaySeconds,10);assert.equal(act(a,'pushTest').status,429);assert.equal(gs({action:'pushClaim',jobId:test.pushJobId,leaseKey:lease}).waitMs,10000);
advanceTime(10001);const testClaim=gs({action:'pushClaim',jobId:test.pushJobId,leaseKey:lease});assert.equal(testClaim.targets.length,1);assert.equal(testClaim.payload.data.test,true);assert.equal(testClaim.targets[0].subscription.endpoint,sa.endpoint);
gs({action:'pushComplete',jobId:test.pushJobId,leaseKey:lease,delivered:[testClaim.targets[0].id]});gs({action:'pushClaim',jobId:test.pushJobId,leaseKey:lease});assert.equal(act(a,'pushStatus').lastTest.accepted,1);
assert.equal(act(a,'pushRetry',{messageId}).status,403);assert.equal(act(t,'pushRetry',{messageId:'foreign'}).status,404);
// Logging into another class on the same device clears the former subscription.
const moved=login('B1C2',a.user.deviceId,'a','옮긴 학생');assert.equal(rows('PushSubscriptions').some(r=>r[2]===a.user.deviceId),false);
act(moved,'pushSubscribe',{subscription:sa});assert.equal(rows('PushSubscriptions').find(r=>r[2]===a.user.deviceId)[1],'class-b');
act(b,'logout');const all=rows('PushSubscriptions');assert.ok(all.length>0);
advanceTime(2001);const later=act(t,'send',{text:'두번째 공지',kind:'notice',messageId:crypto.randomUUID(),pushEnabled:true});assert.equal(gs({action:'pushClaim',jobId:later.pushJobId,leaseKey:lease}).done,true,'no recipients from other classes or logged-out sessions');
const c=login('A1B2','push-student-32345678901','c','학생C'),sc=sub('c');act(c,'pushSubscribe',{subscription:sc});advanceTime(2001);
const deleted=act(t,'send',{text:'삭제될 공지',kind:'notice',messageId:crypto.randomUUID(),pushEnabled:true});act(t,'deleteNotice',{messageId:deleted.message.id});assert.equal(gs({action:'pushClaim',jobId:deleted.pushJobId,leaseKey:lease}).done,true,'deleted notices are not sent');
function rows(name){return sheets[name].data.slice(1);}

(async()=>{
 const{normalizePushSubscription,validDispatch,queuePushJob,deliverPushJob}=await import('../server/push.mjs');const{handleRequest}=await import('../server/worker.mjs');
 assert.equal(normalizePushSubscription(sa).endpoint,sa.endpoint);for(const endpoint of['http://web.push.apple.com/a','https://localhost/a','https://push.apple.com.evil.test/a','https://127.0.0.1/a','https://user@web.push.apple.com/a','https://web.push.apple.com:8080/a'])assert.throws(()=>normalizePushSubscription({...sa,endpoint}));
 const env={VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,SHEETS_BRIDGE_SECRET:props.BRIDGE_SECRET,SHEETS_API_URL:'https://script.google.com/macros/s/mock/exec'};
 let dispatch;await queuePushJob(crypto.randomUUID(),env,async(url,args)=>{dispatch=args;return new Response(null,{status:202});});assert.equal(validDispatch(dispatch.body,dispatch.headers['x-robotland-push'],env.SHEETS_BRIDGE_SECRET),true);assert.equal(validDispatch(dispatch.body+' ',dispatch.headers['x-robotland-push'],env.SHEETS_BRIDGE_SECRET),false);
 advanceTime(2001);const job=act(t,'send',{text:'발송 재시도',kind:'notice',messageId:crypto.randomUUID(),pushEnabled:true});let calls=0;
 await assert.rejects(deliverPushJob(env,async(action,args)=>gs({action,...args}),job.pushJobId,async()=>{calls++;throw{statusCode:503};}));assert.equal(calls,1);
 await deliverPushJob(env,async(action,args)=>gs({action,...args}),job.pushJobId,async(subscription,payload,options)=>{calls++;assert.equal(subscription.endpoint,sc.endpoint);assert.equal(JSON.parse(payload).data.classId,'class-a');assert.equal(options.contentEncoding,'aes128gcm');});assert.equal(calls,2);
 await deliverPushJob(env,async(action,args)=>gs({action,...args}),job.pushJobId,async()=>{throw new Error('Already delivered');});
 advanceTime(2001);const expired=act(t,'send',{text:'기기 등록 만료',kind:'notice',messageId:crypto.randomUUID(),pushEnabled:true});await deliverPushJob(env,async(action,args)=>gs({action,...args}),expired.pushJobId,async()=>{throw{statusCode:410};});assert.equal(act(c,'pushStatus').registered,false);
 const original=global.fetch;global.fetch=async(_,opts)=>new Response(JSON.stringify(gs(JSON.parse(opts.body))));const queued=[];env.QUEUE_PUSH=async id=>queued.push(id);
 const request=(route,body,who=t)=>handleRequest(new Request('https://planner.test/api/'+route,{method:'POST',headers:{origin:'https://planner.test','content-type':'application/json',cookie:'robotland_session='+who.token},body:JSON.stringify(body)}),env);
 try{
  advanceTime(2001);const r=await request('messages/send',{kind:'notice',text:'서버 연결 확인',messageId:crypto.randomUUID()});const result=await r.json();assert.equal(result.push.queued,true);assert.equal(result.pushJobId,undefined);assert.equal(queued.length,1);
  advanceTime(2001);await request('messages/send',{kind:'message',text:'일반 대화',messageId:crypto.randomUUID()});assert.equal(queued.length,1);
  env.QUEUE_PUSH=async()=>{throw new Error('offline');};advanceTime(2001);const saved=await(await request('messages/send',{kind:'notice',text:'알림 접수 실패여도 저장',messageId:crypto.randomUUID()})).json();assert.equal(saved.ok,true);assert.equal(saved.push.queued,false);assert.equal(saved.message.text,'알림 접수 실패여도 저장');
  assert.equal((await request('push/subscribe',{subscription:{...sa,endpoint:'https://localhost/'}})).status,400);
  assert.equal((await request('push/claim',{jobId:notice.pushJobId})).status,404);
 }finally{global.fetch=original;}
 console.log('PASS push: notice-only jobs, class/device/session isolation, 10-second self test, no endpoint exposure, idempotent jobs and delivery, logout/class change/deletion, private dispatch signatures, SSRF guards, retries and expired subscription cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
