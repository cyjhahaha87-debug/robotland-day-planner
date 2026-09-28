const assert=require('node:assert/strict'),crypto=require('node:crypto');
const{gs,login,sheets,props,advanceTime}=require('./store-fixture.cjs');
const token=()=>crypto.randomBytes(32).toString('hex');
const a=login('A1B2','student-invite-1234567890','a','조장'),b=login('B1C2','student-other-1234567890','b','다른반'),t=login('T1E2','teacher-invite-1234567890','t','선생님');
const act=(who,action,args={})=>gs({action,token:who.token,...args});
const group=act(a,'createGroup',{name:'탐험조'}).myGroup,foreign=act(b,'createGroup',{name:'다른 반 조'}).myGroup;
function create(who,g=group.id){return act(who,'createGroupInvite',{groupId:g,newInviteToken:token()});}
// Deployed installations lazily receive the new table, without running setup again.
delete sheets.GroupInvites;
const invite=create(a);assert.equal(invite.ok,true);assert.match(invite.inviteToken,/^[a-f0-9]{64}$/);
assert.equal(sheets.GroupInvites.data.length,2);assert.notEqual(sheets.GroupInvites.data[1][0],invite.inviteToken);
assert.equal(sheets.GroupInvites.data[1][0],crypto.createHash('sha256').update(invite.inviteToken).digest('hex'));
assert.ok(invite.expiresAt<=Date.now()+86400000);
assert.equal(create(b).status,403);assert.equal(create(a,foreign.id).status,403);assert.equal(create(t,foreign.id).status,403);assert.equal(create(t).ok,true);
const outsider=login('A1B2','student-outside-1234567890','x','같은반다른조');assert.equal(create(outsider).status,403);
const preview=gs({action:'previewGroupInvite',inviteToken:invite.inviteToken});assert.equal(preview.classId,'class-a');assert.equal(preview.groupId,group.id);
for(const value of['A1B2','T1E2','deviceId','role','code','조장'])assert.ok(!JSON.stringify(preview).includes(value));
function join(name='새 친구',extra={}){return gs({action:'joinGroupInvite',inviteToken:invite.inviteToken,nickname:name,deviceId:'new-invited-1234567890123',newToken:token(),clientKey:'qr',...extra});}
const joinedToken=token();const joined=join('새 친구',{newToken:joinedToken,code:'T1E2',role:'teacher',classId:'class-b',groupId:foreign.id});assert.equal(joined.ok,true);assert.equal(joined.user.role,'student');assert.equal(joined.user.classId,'class-a');assert.equal(joined.myGroup.id,group.id);
assert.equal(join('새 친구',{token:joinedToken}).myGroup.count,2,'same device rejoins without another membership');
assert.equal(join('새 친구',{deviceId:'duplicate-name-1234567890'}).status,409);
const otherGroup=act(outsider,'createGroup',{name:'두번째 조'}).myGroup;
const moved=join('같은반다른조',{deviceId:outsider.user.deviceId,token:outsider.token});assert.equal(moved.myGroup.id,group.id);
assert.equal(sheets.GroupMembers.data.slice(1).filter(r=>r[1]===outsider.user.deviceId).length,1);
const second=create(a);assert.equal(gs({action:'previewGroupInvite',inviteToken:invite.inviteToken}).ok,true,'new QR does not invalidate earlier QR');
const codeRow=sheets.AccessCodes.data.find(r=>r[0]==='A1B2');codeRow[4]=false;assert.equal(join('중지').status,410);codeRow[4]=true;
assert.equal(gs({action:'previewGroupInvite',inviteToken:token()}).status,410);
act(t,'disbandGroup',{groupId:group.id});assert.equal(join('해산').status,410);
const lateGroup=act(a,'createGroup',{name:'시간 제한 조'}).myGroup,late=create(a,lateGroup.id);advanceTime(86400001);assert.equal(gs({action:'previewGroupInvite',inviteToken:late.inviteToken}).status,410);

(async()=>{
  const{handleRequest}=await import('../server/worker.mjs');const original=global.fetch;let sent=[];
  global.fetch=async(_,opts)=>{const data=JSON.parse(opts.body);sent.push(data);return new Response(JSON.stringify({ok:true,user:{role:'student'}}));};
  try{
    const env={SHEETS_API_URL:'https://script.google.com/macros/s/mock/exec',SHEETS_BRIDGE_SECRET:props.BRIDGE_SECRET};
    const call=(path,body,headers={})=>handleRequest(new Request('https://planner.test/api/invites/'+path,{method:'POST',headers:{origin:'https://planner.test','content-type':'application/json',...headers},body:JSON.stringify(body)}),env);
    assert.equal((await call('create',{groupId:group.id})).status,401);
    assert.equal((await call('preview',{inviteToken:'bad'})).status,400);
    assert.equal((await call('preview',{inviteToken:invite.inviteToken},{origin:'https://evil.test'})).status,403);
    assert.equal((await call('preview',{inviteToken:invite.inviteToken,code:'T1E2'})).status,200);assert.equal(sent.at(-1).code,undefined);
    const r=await call('join',{inviteToken:invite.inviteToken,nickname:'학생',deviceId:'test-device-1234567890',role:'teacher',classId:'class-b',groupId:foreign.id,code:'T1E2'});
    assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Lax.*Secure/);
    assert.equal(sent.at(-1).code,undefined);assert.equal(sent.at(-1).role,undefined);assert.equal(sent.at(-1).classId,undefined);assert.equal(sent.at(-1).groupId,undefined);
    // The Apps Script chooses the student code regardless of the ignored input code.
    assert.equal(sent.at(-1).action,'joinGroupInvite');
    console.log('PASS invites: lazy migration, hashed tokens, own-group authorization, student-only joins, class isolation, unique names, reentry, group movement, expiry/disband and HTTP/cookie guards.');
  }finally{global.fetch=original;}
})().catch(e=>{console.error(e);process.exitCode=1;});
