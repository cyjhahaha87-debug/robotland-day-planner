const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {gs,login,sheets,context}=require('./store-fixture.cjs');
const teacher=login('T1E2','read-teacher-1234567890','t','선생님'),student=login('A1B2','read-student-1234567890','s','학생');
const call=(action,args={})=>gs({action,token:teacher.token,...args});
const group=gs({action:'createGroup',token:student.token,name:'읽기 조'}).myGroup;
const invite=call('createGroupInvite',{groupId:group.id,newInviteToken:crypto.randomBytes(32).toString('hex')});
const recovery=call('createRecovery',{deviceId:student.user.deviceId,newRecoveryToken:crypto.randomBytes(32).toString('hex')});
// Old deployments may not have a persistent roster or push tables yet. Reads must not create them.
delete sheets.Students;delete sheets.PushSubscriptions;delete sheets.PushJobs;
const snapshot=()=>JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([n,s])=>[n,s.data])));
const before=snapshot();let lockCalls=0,flushCalls=0;
context.LockService.getScriptLock=()=>{lockCalls++;return{tryLock:()=>false,releaseLock(){throw Error('not acquired');}};};
context.SpreadsheetApp.flush=()=>flushCalls++;
for(const [action,args]of [ ['session',{}],['classInfo',{}],['messages',{}],['loadPlan',{}],['groups',{}],['groupPlan',{groupId:group.id}],['staff',{}],['pushStatus',{}],['previewGroupInvite',{inviteToken:invite.inviteToken}],['previewRecovery',{recoveryToken:recovery.recoveryToken}] ])assert.equal(call(action,args).ok,true,action);
assert.equal(lockCalls,0);assert.equal(flushCalls,0);assert.equal(snapshot(),before);
assert.equal(call('messages',{token:'invalid'}).status,401);
assert.equal(gs({action:'staff',token:student.token}).status,403);
assert.equal(call('send',{kind:'notice',messageId:'blocked',text:'must not save'}).code,'STORE_BUSY');assert.equal(snapshot(),before);assert.equal(lockCalls,1);
// Repeated reads of the same table are batched within one request, then forgotten.
let sessionReads=0;const range=sheets.Sessions.getRange.bind(sheets.Sessions);
sheets.Sessions.getRange=(...args)=>{sessionReads++;return range(...args);};
assert.equal(call('groups').ok,true);assert.equal(sessionReads,1);
sheets.Sessions.data=sheets.Sessions.data.filter(r=>r[4]!==teacher.user.deviceId);
assert.equal(call('session').status,401);assert.equal(sessionReads,2,'no authorization cache across requests');
const events=[];context.LockService.getScriptLock=()=>({tryLock:()=>true,releaseLock:()=>events.push('release')});context.SpreadsheetApp.flush=()=>events.push('flush');
assert.equal(login('T1E2','new-teacher-1234567890','new','새 선생님').ok,true);assert.deepEqual(events,['flush','release']);
assert.ok(sheets.Students.data.some(r=>r[1]===student.user.deviceId),'mutation persists legacy roster');
console.log('PASS read concurrency: all 10 reads work under a busy write lock without sheet writes; authorization, batched reads, roster migration, and flush-before-unlock verified.');
