(() => {
 const $=id=>document.getElementById(id);
 let user=null,connected=false,cursor=0,poll=null,messages=[],sending=false;
 let deviceId;try{deviceId=localStorage.getItem('robotland-device-id');if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('robotland-device-id',deviceId);}}catch{deviceId=crypto.randomUUID();}
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,body){const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',signal:AbortSignal.timeout(22000)});const result=await response.json();if(!response.ok||!result.ok){const error=new Error(result.error||'연결을 확인해 주세요.');error.status=response.status;throw error;}return result;}
 function setStatus(text){$('chatStatus').textContent=text;}
 function applyUser(value){
  user=value;window.RobotlandIdentity=value;window.dispatchEvent(new CustomEvent('robotland-session-changed',{detail:value}));
  $('classLogin').hidden=!!user;$('classRoom').hidden=!user;$('classSidebar').hidden=!user;
  if(user){$('className').textContent=user.className;$('memberLabel').textContent=`${user.nickname} · ${user.role==='teacher'?'선생님':'학생'}`;$('messageKind').querySelector('option[value=notice]').disabled=user.role!=='teacher';$('messageKind').value=user.role==='teacher'?'notice':'message';cursor=0;messages=[];renderMessages();startPolling();}
  else{clearTimeout(poll);messages=[];cursor=0;}
 }
 function renderMessages(){
  $('chatEmpty').hidden=messages.length>0;
  const list=$('messageList'),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
  list.innerHTML=messages.map(m=>`<article class="message ${m.deviceId===deviceId?'mine':''} ${m.kind==='notice'?'notice-message':''}"><div class="message-meta"><strong>${esc(m.nickname)}</strong><span>${m.role==='teacher'?'선생님':m.kind==='report'?'상황 보고':'학생'}</span><time>${new Date(m.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}</time></div><p>${esc(m.text).replace(/\n/g,'<br>')}</p></article>`).join('');
  if(nearBottom||messages.at(-1)?.deviceId===deviceId)list.scrollTop=list.scrollHeight;
 }
 async function readMessages(){
  if(!user||!navigator.onLine)return;const currentUser=user;
  try{const result=await api('messages?after='+cursor);if(user!==currentUser)return;const existing=new Set(messages.map(m=>m.id));messages.push(...result.messages.filter(m=>!existing.has(m.id)));messages=messages.slice(-200);cursor=result.cursor;renderMessages();$('pinnedNotice').hidden=!result.notice;if(result.notice){$('noticeText').textContent=result.notice.text;$('noticeBy').textContent=result.notice.nickname+' 선생님';}setStatus('연결됨 · 10초마다 새 소식 확인');}
  catch(error){if(error.status===401){applyUser(null);$('loginFeedback').textContent='접속 기간이 지났어요. 반 코드를 다시 입력해 주세요.';}else setStatus(error.message);}
 }
 function startPolling(){clearTimeout(poll);readMessages().finally(()=>{if(user)poll=setTimeout(startPolling,document.hidden?30000:10000);});}
 $('classLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!connected)return;const button=$('classJoin');button.disabled=true;$('loginFeedback').textContent='반 코드를 확인하고 있어요.';
  try{const result=await api('login',{code:$('classCode').value.trim().toUpperCase(),nickname:$('nickname').value.trim(),deviceId});applyUser(result.user);$('classCode').value='';$('loginFeedback').textContent='';}
  catch(error){$('loginFeedback').textContent=error.message;}finally{button.disabled=!connected;}
 });
 $('classCode').addEventListener('input',()=>{$('classCode').value=$('classCode').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);});
 $('classOptions').addEventListener('click',()=>{const open=$('classSidebar').classList.toggle('options-open');$('classOptions').setAttribute('aria-expanded',String(open));});
 $('classLogout').addEventListener('click',async()=>{try{await api('logout',{});applyUser(null);setStatus('');}catch(error){setStatus(error.message);}});
 async function sendMessage(text,kind){
  if(sending||!text.trim())return;if(!navigator.onLine){setStatus('오프라인에서는 보낼 수 없어요. 작성한 내용은 그대로 두었습니다.');return;}
  sending=true;$('sendMessage').disabled=true;
  try{const result=await api('messages/send',{text,kind,messageId:crypto.randomUUID()});if(!messages.some(m=>m.id===result.message.id))messages.push(result.message);renderMessages();$('messageText').value='';setStatus('전송했어요.');await readMessages();}
  catch(error){setStatus('보내지 못했어요. '+error.message);}finally{sending=false;$('sendMessage').disabled=false;}
 }
 $('messageForm').addEventListener('submit',e=>{e.preventDefault();sendMessage($('messageText').value,$('messageKind').value);});
 for(const button of document.querySelectorAll('[data-report]'))button.addEventListener('click',()=>{$('messageKind').value='report';$('messageText').value=button.dataset.report;$('messageText').focus();});
 $('refreshMessages').addEventListener('click',readMessages);
 $('backupPlan').addEventListener('click',async()=>{try{const plan=window.RobotlandPlan?.snapshot();if(!plan)throw new Error('저장할 계획이 없어요.');$('backupStatus').textContent='시트에 백업 중…';await api('plan/save',{plan});$('backupStatus').textContent='이 기기의 계획을 구글시트에 백업했어요.';}catch(e){$('backupStatus').textContent=e.message;}});
 $('restorePlan').addEventListener('click',async()=>{try{const result=await api('plan');if(!result.plan){$('backupStatus').textContent='이 반·이 기기에 저장된 백업이 없어요.';return;}if(!confirm('현재 기기의 동선을 구글시트 백업으로 바꿀까요?'))return;window.RobotlandPlan.restore(result.plan);$('backupStatus').textContent='백업을 불러왔어요.';}catch(e){$('backupStatus').textContent=e.message;}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)startPolling();});window.addEventListener('online',()=>{if(user)startPolling();});window.addEventListener('offline',()=>setStatus('오프라인 · 메시지 전송은 연결 후 가능합니다.'));
 async function initialize(){
  try{const config=await api('config');connected=config.connected;window.dispatchEvent(new CustomEvent('robotland-backend-ready',{detail:connected}));$('classJoin').disabled=!connected;$('backendNotice').hidden=connected;if(!connected){$('loginFeedback').textContent='Apps Script 연결 전입니다. 지도와 개인 동선은 지금 사용할 수 있어요.';return;}try{const result=await api('session');applyUser(result.user);}catch(e){if(e.status!==401)$('loginFeedback').textContent=e.message;}}
  catch{connected=false;$('classJoin').disabled=true;$('loginFeedback').textContent='서버에 연결할 수 없어요. 저장된 개인 동선은 지도에서 사용할 수 있습니다.';}
 }
 window.RobotlandClassroom={api,applyUser,deviceId,get user(){return user;},get connected(){return connected;}};
 initialize();
})();
