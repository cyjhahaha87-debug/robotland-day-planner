const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const scope={AbortSignal,setTimeout};vm.runInNewContext(fs.readFileSync(__dirname+'/../public/request-client.js','utf8'),scope);
const create=scope.RobotlandRequests.create,ok=value=>({status:200,ok:true,json:async()=>({ok:true,value})});
const gate=()=>{let release;const promise=new Promise(r=>release=r);return{promise,release};};
test('overlapping reads coalesce, writes serialize, and reads after writes stay fresh',async()=>{
 const held=gate(),calls=[];let active=0,max=0;
 const api=create({epoch:()=>0,fetch:async(path,options)=>{calls.push([path,options.method]);max=Math.max(max,++active);if(calls.length===1)await held.promise;active--;return ok(calls.length);}});
 const a=api('groups'),b=api('groups');assert.equal(a,b);
 const write=api('groups/join',{groupId:'g'}),after=api('groups');
 assert.notEqual(a,after);await Promise.resolve();assert.equal(calls.length,1);held.release();
 assert.deepEqual((await Promise.all([a,b,write,after])).map(r=>r.value),[1,1,2,3]);assert.equal(max,1);
 assert.deepEqual(calls,[['/api/groups','GET'],['/api/groups/join','POST'],['/api/groups','GET']]);
});
test('identity change cancels queued writes before sending and discards pending results',async()=>{
 const held=gate();let epoch=0,count=0;
 const api=create({epoch:()=>epoch,fetch:async()=>{count++;await held.promise;return ok();}});
 const read=api('groups'),write=api('messages/send',{text:'wrong class'});
 const settled=Promise.allSettled([read,write]);await Promise.resolve();epoch++;held.release();
 for(const r of await settled){assert.equal(r.status,'rejected');assert.equal(r.reason.staleSession,true);}assert.equal(count,1);
 assert.equal((await api('session')).ok,true);
});
test('only explicit lock rejections retry once, preserving write body',async()=>{
 for(const result of [{ok:false,code:'STORE_BUSY'},{ok:false,error:'요청이 많아요. 잠시 후 다시 시도해 주세요.'}]){
  const bodies=[],pauses=[];const api=create({epoch:()=>0,sleep:async ms=>pauses.push(ms),random:()=>0,fetch:async(_,o)=>{bodies.push(o.body);return bodies.length===1?{status:503,ok:false,json:async()=>result}:ok();}});
  assert.equal((await api('messages/send',{messageId:'fixed-id'})).ok,true);assert.deepEqual(bodies,[bodies[0],bodies[0]]);assert.deepEqual(pauses,[800]);
 }
 for(const failure of [401,429,500,503,'timeout']){let count=0;const api=create({epoch:()=>0,fetch:async()=>{count++;if(failure==='timeout')throw Error('timeout');return{status:failure,ok:false,json:async()=>({ok:false,error:'failure'})};}});await assert.rejects(api('messages/send',{}));assert.equal(count,1);}
 let count=0;const api=create({epoch:()=>0,sleep:async()=>{},fetch:async()=>{count++;return{status:503,ok:false,json:async()=>({ok:false,code:'STORE_BUSY'})};}});await assert.rejects(api('groups'),{status:503});assert.equal(count,2);
});
