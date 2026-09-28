const COOKIE='robotland_session';
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});
const encoder=new TextEncoder();
async function fingerprint(value,secret){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function getCookie(request){return(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
function sessionCookie(token,url,clear=false){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:604800}${url.hostname==='127.0.0.1'||url.hostname==='localhost'?'':'; Secure'}`;}
async function bridge(env,action,args,request){
 if(!env.SHEETS_API_URL||!env.SHEETS_BRIDGE_SECRET)return{ok:false,error:'구글시트 API 연결을 준비하고 있어요. 동선은 이 기기에 저장됩니다.',status:503};
 const url=new URL(env.SHEETS_API_URL);
 if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw new Error('Invalid Sheets endpoint');
 const ip=env.CLIENT_IP||request.headers.get('cf-connecting-ip')||'local-preview';
 const clientKey=await fingerprint(ip,env.SHEETS_BRIDGE_SECRET);
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.SHEETS_BRIDGE_SECRET,action,clientKey,...args}),redirect:'follow',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Sheets gateway unavailable');
 const result=await response.json();if(!result||typeof result.ok!=='boolean')throw new Error('Unexpected Sheets response');return result;
}
export async function handleRequest(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(url.pathname==='/api/config'&&request.method==='GET')return json({ok:true,connected:!!(env.SHEETS_API_URL&&env.SHEETS_BRIDGE_SECRET),storage:'google-sheets',pushReady:false});
 const routes={
  '/api/invites/create':['POST','createGroupInvite'], '/api/invites/preview':['POST','previewGroupInvite'], '/api/invites/join':['POST','joinGroupInvite'],
  '/api/staff/enter':['POST','staffEnterClass'], '/api/staff/login':['POST','staffLogin'], '/api/staff':['GET','staff'], '/api/staff/send':['POST','staffSend'],
  '/api/login':['POST','login'], '/api/session':['GET','session'], '/api/logout':['POST','logout'],
  '/api/messages/delete':['POST','deleteNotice'], '/api/messages':['GET','messages'], '/api/messages/send':['POST','send'],
  '/api/plan':['GET','loadPlan'], '/api/plan/save':['POST','savePlan'],
  '/api/classes/create':['POST','createClass'], '/api/class':['GET','classInfo'],
  '/api/members/remove':['POST','removeClassMember'],
  '/api/groups':['GET','groups'], '/api/groups/create':['POST','createGroup'], '/api/groups/join':['POST','joinGroup'], '/api/groups/leave':['POST','leaveGroup'],
  '/api/groups/assign':['POST','assignMember'], '/api/groups/disband':['POST','disbandGroup'],
  '/api/group-location':['POST','setGroupLocation'], '/api/group-location/clear':['POST','clearGroupLocation'],
  '/api/group-plan':['GET','groupPlan'], '/api/group-plan/save':['POST','saveGroupPlan'],
 };
 const route=routes[url.pathname];if(!route)return json({ok:false,error:'요청을 찾을 수 없어요.'},404);
 if(request.method!==route[0])return json({ok:false,error:'지원하지 않는 요청이에요.'},405,{'allow':route[0]});
 if(request.method!=='GET'&&(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'))return json({ok:false,error:'같은 앱에서 다시 시도해 주세요.'},403);
 try{
  let input={};
  if(request.method==='POST'){
   if(!request.headers.get('content-type')?.includes('application/json'))return json({ok:false,error:'잘못된 요청 형식이에요.'},415);
   const raw=await request.text();if(raw.length>45000)return json({ok:false,error:'저장할 내용이 너무 커요.'},413);input=JSON.parse(raw);
   if(!input||typeof input!=='object'||Array.isArray(input))return json({ok:false,error:'잘못된 요청이에요.'},400);
  }
  const action=route[1],args={};
  if(action==='previewGroupInvite'){if(!/^[a-f0-9]{64}$/.test(input.inviteToken||''))return json({ok:false,error:'올바른 초대 QR을 열어주세요.'},400);const result=await bridge(env,action,{inviteToken:input.inviteToken},request);return json(result,result.ok?200:(result.status||400));}
  if(action==='login'||action==='createClass'||action==='staffLogin'||action==='joinGroupInvite'){
   const code=String(input.code||'').toUpperCase().trim(),nickname=String(input.nickname||'').trim();
   if((action==='login'||action==='staffLogin')&&(!/^[A-Z0-9]{4}$/.test(code)||!/[A-Z]/.test(code)||!/[0-9]/.test(code)))return json({ok:false,error:'영문과 숫자가 섞인 4자리 코드를 입력해 주세요.'},400);
   if(nickname.length<1||nickname.length>20||/[\x00-\x1f<>]/.test(nickname))return json({ok:false,error:'표시 이름은 1~20자로 입력해 주세요.'},400);
   if(!/^[a-zA-Z0-9-]{20,64}$/.test(input.deviceId||''))return json({ok:false,error:'기기 정보를 확인할 수 없어요.'},400);
   const token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
   Object.assign(args,{code,nickname,deviceId:input.deviceId,newToken:token});
   if(action==='joinGroupInvite'){if(!/^[a-f0-9]{64}$/.test(input.inviteToken||''))return json({ok:false,error:'올바른 초대 QR을 열어주세요.'},400);args.inviteToken=input.inviteToken;delete args.code;}
   if(action==='createClass'){
    const enrollmentCode=String(input.enrollmentCode||'').trim().toUpperCase(),className=String(input.className||'').trim();
    if((!getCookie(request)&&!/^[A-Z0-9]{4}$/.test(enrollmentCode))||!className||className.length>40||!/^[-a-zA-Z0-9]{20,64}$/.test(input.requestId||''))return json({ok:false,error:'교사용 개설코드와 반 이름을 확인해 주세요.'},400);
    Object.assign(args,{enrollmentCode,className,requestId:input.requestId,token:getCookie(request)});
   }
   const result=await bridge(env,action,args,request);if(!result.ok)return json(result,result.status||400);
   return json(result,200,{'set-cookie':sessionCookie(token,url)});
  }
  const token=getCookie(request);if(!/^[a-f0-9]{64}$/.test(token))return json({ok:false,error:'반 코드를 입력해 주세요.',code:'LOGIN_REQUIRED'},401);
  args.token=token;
  if(action==='createGroupInvite'){args.groupId=String(input.groupId||'');if(!/^[-a-zA-Z0-9]{10,64}$/.test(args.groupId))return json({ok:false,error:'초대할 조를 선택하세요.'},400);args.newInviteToken=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  if(action==='send'){
   const text=String(input.text||'').trim(),kind=input.kind;
   if(!['message','report','notice'].includes(kind)||!text||text.length>1000)return json({ok:false,error:'내용은 1~1,000자로 입력해 주세요.'},400);
   if(!/^[a-zA-Z0-9-]{20,64}$/.test(input.messageId||''))return json({ok:false,error:'메시지 식별자를 확인할 수 없어요.'},400);
   Object.assign(args,{text,kind,messageId:input.messageId});
  }
  if(action==='staffEnterClass'){args.classId=String(input.classId||'');if(!/^[-a-zA-Z0-9]{2,64}$/.test(args.classId))return json({ok:false,error:'입장할 반을 선택하세요.'},400);}
  if(action==='staffSend'){args.text=String(input.text||'').trim();args.messageId=String(input.messageId||'');args.referenceClassId=String(input.referenceClassId||'');args.referenceGroupId=String(input.referenceGroupId||'');if(args.text.length>1000||(!args.text&&!args.referenceClassId)||!/^[-a-zA-Z0-9]{20,64}$/.test(args.messageId)||args.referenceClassId.length>64||args.referenceGroupId.length>64)return json({ok:false,error:'공유할 내용을 확인해 주세요.'},400);}
  if(action==='deleteNotice'){args.messageId=String(input.messageId||'');if(!/^[a-zA-Z0-9-]{20,64}$/.test(args.messageId))return json({ok:false,error:'삭제할 공지를 선택하세요.'},400);}
  if(action==='messages')args.after=Math.max(0,Number(url.searchParams.get('after'))||0);
  if(action==='savePlan'||action==='saveGroupPlan'){
   if(!input.plan||typeof input.plan!=='object'||Array.isArray(input.plan)||JSON.stringify(input.plan).length>35000)return json({ok:false,error:'저장할 계획을 확인해 주세요.'},400);
   args.plan=input.plan;
  }
  if(action==='createGroup'){args.name=String(input.name||'').trim();if(!args.name||args.name.length>20)return json({ok:false,error:'조 이름은 1~20자로 입력해 주세요.'},400);}
  if(action==='joinGroup'){args.groupId=String(input.groupId||'');if(!/^[a-zA-Z0-9-]{10,64}$/.test(args.groupId))return json({ok:false,error:'조를 목록에서 선택해 주세요.'},400);}
  if(['assignMember','disbandGroup'].includes(action)){args.groupId=input.groupId===null?null:String(input.groupId||'');args.deviceId=String(input.deviceId||'');}
  if(action==='setGroupLocation'||action==='clearGroupLocation'){args.groupId=String(input.groupId||'');if(!/^[a-zA-Z0-9-]{10,64}$/.test(args.groupId))return json({ok:false,error:'현재 조를 확인해 주세요.'},400);if(action==='setGroupLocation'){if(!Number.isInteger(input.x)||!Number.isInteger(input.y)||input.x<0||input.x>2304||input.y<0||input.y>1123)return json({ok:false,error:'안내도 안에서 위치를 선택하세요.'},400);args.x=input.x;args.y=input.y;}}
  if(action==='removeClassMember'){args.deviceId=String(input.deviceId||'');if(!/^[a-zA-Z0-9-]{20,64}$/.test(args.deviceId))return json({ok:false,error:'정리할 입장 기록을 선택하세요.'},400);}
  if(action==='groupPlan')args.groupId=url.searchParams.get('groupId')||'';
  if(action==='saveGroupPlan'){args.groupId=String(input.groupId||'');if(!/^[a-zA-Z0-9-]{10,64}$/.test(args.groupId))return json({ok:false,error:'편집할 조를 다시 선택하세요.'},400);args.baseRevision=input.baseRevision;if(!Number.isInteger(args.baseRevision)||args.baseRevision<0)return json({ok:false,error:'조 동선을 먼저 불러와 주세요.'},400);}
  const result=await bridge(env,action,args,request);
  return json(result,result.ok?200:(result.status||400),action==='logout'?{'set-cookie':sessionCookie('',url,true)}:{});
 }catch(error){console.error('Robotland API request failed:',error.name);return json({ok:false,error:'지금 서버에 연결하지 못했어요. 휴대폰의 계획은 그대로 유지됩니다.'},502);}
}
