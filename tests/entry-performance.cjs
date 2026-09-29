const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {gs,login,sheets,props,context}=require('./store-fixture.cjs');
const key=()=>crypto.randomBytes(32).toString('hex');
const teacher=login('T1E2','entry-teacher-1234567890','teacher','담임');
const group=gs({action:'createGroup',token:teacher.token,name:'입장 조'}).myGroup;
const invitation=gs({action:'createGroupInvite',token:teacher.token,groupId:group.id,newInviteToken:key()});
// One mistyping device cannot block all other devices using the same school IP.
for(let i=0;i<10;i++)assert.equal(login('Z9Z9','wrong-entry-1234567890','school','오입력').ok,false);
assert.equal(login('A1B2','wrong-entry-1234567890','school','오입력').status,429);
assert.equal(login('A1B2','normal-entry-1234567890','school','다른 학생').ok,true);
assert.equal(gs({action:'joinGroupInvite',inviteToken:invitation.inviteToken,newToken:key(),nickname:'초대 학생',deviceId:'invited-entry-1234567890',clientKey:'school'}).ok,true);
// Rotating device IDs still encounters a bounded aggregate IP limit.
for(let i=0;i<100;i++)login('Z9Z9','rotating-entry-device-'+i,'abuse-ip','오입력');
assert.equal(login('A1B2','fresh-entry-1234567890','abuse-ip','차단 확인').status,429);
// The exact same secret attempt can recover the response; a new attempt cannot impersonate it.
const attempt={action:'joinGroupInvite',inviteToken:invitation.inviteToken,newToken:key(),recoveryToken:key(),entryExpiresAt:Date.now()+600000,nickname:'응답 복구',deviceId:'retry-entry-1234567890',clientKey:'school'};
const first=gs(attempt);assert.equal(first.ok,true);assert.equal(first.recoveryRegistered,true);
const snapshot=JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k,s])=>[k,s.data])));
const again=gs(attempt);assert.equal(again.ok,true);assert.equal(again.myGroup.count,first.myGroup.count);
assert.equal(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k,s])=>[k,s.data]))),snapshot,'replay performs no duplicate writes');
assert.equal(gs({...attempt,newToken:key()}).status,409);
assert.equal(gs({...attempt,entryExpiresAt:context.Date.now()-1}).status,409);
assert.equal(gs({action:'resumeRecovery',recoveryToken:attempt.recoveryToken,deviceId:attempt.deviceId,newToken:key()}).ok,true);
// Request-scoped hashes must not cache credentials or sheet data across requests.
let digests=0;const original=context.Utilities.computeDigest;context.Utilities.computeDigest=(...args)=>{digests++;return original(...args);};
assert.equal(gs({action:'groups',token:teacher.token}).ok,true);assert.ok(digests<=2);
assert.equal(gs({action:'logout',token:teacher.token}).ok,true);assert.equal(gs({action:'groups',token:teacher.token}).status,401);
(async()=>{
 const {handleRequest}=await import('../server/worker.mjs'),fetcher=global.fetch,sent=[];
 global.fetch=async(_,opts)=>{const args=JSON.parse(opts.body);sent.push(args);return new Response(JSON.stringify({ok:true,user:{role:'student'}}));};
 const env={SHEETS_API_URL:'https://script.google.com/macros/s/test/exec',SHEETS_BRIDGE_SECRET:props.BRIDGE_SECRET};
 const body={code:'A1B2',nickname:'동일 요청',deviceId:'http-entry-1234567890',entryToken:key(),entryTime:Date.now(),recoveryToken:key()};
 const call=input=>handleRequest(new Request('https://test.local/api/login',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json'},body:JSON.stringify(input)}),env);
 try{
  const a=await call(body),b=await call(body);assert.equal(a.status,200);assert.equal(a.headers.get('set-cookie'),b.headers.get('set-cookie'));
  await call({...body,nickname:'다른 이름'});assert.notEqual(sent[0].newToken,sent[2].newToken);
  assert.equal((await call({...body,entryTime:Date.now()-610000})).status,400);
  assert.equal(sent[0].recoveryToken,body.recoveryToken);assert.equal(sent[0].entryToken,undefined);
 }finally{global.fetch=fetcher;}
 console.log('PASS fast entry: shared Wi-Fi isolation and aggregate rate limit, atomic recovery registration, bounded secret retry, no duplicate writes, fresh authorization and deterministic bridge cookies.');
})().catch(e=>{console.error(e);process.exitCode=1;});
