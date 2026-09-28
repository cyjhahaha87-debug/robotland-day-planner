(() => {
 const $=id=>document.getElementById(id);
 let user=null,connected=false,cursor=0,poll=null,messages=[],sending=false,sessionEpoch=0,noticeDeletionSupported=false;
 const sessionSyncKey='robotland-session-sync';
 function announceSession(){try{localStorage.setItem(sessionSyncKey,crypto.randomUUID());}catch{}}
 async function syncSession(){const current=sessionEpoch;try{const result=await api('session');if(current!==sessionEpoch)return;if(!user||user.classId!==result.user.classId||user.nickname!==result.user.nickname||user.deviceId!==result.user.deviceId||user.role!==result.user.role)applyUser(result.user);}catch(error){if(current!==sessionEpoch)return;if(error.status===401&&user){applyUser(null);$('loginFeedback').textContent='로그인이 종료됐어요. 반 코드로 다시 입장하세요.';}}}
 window.addEventListener('storage',e=>{if(e.key===sessionSyncKey&&connected)syncSession();});
 let deviceId;try{deviceId=localStorage.getItem('robotland-device-id');if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('robotland-device-id',deviceId);}}catch{deviceId=crypto.randomUUID();}
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,body){const requestEpoch=sessionEpoch;const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',signal:AbortSignal.timeout(22000)});const result=await response.json();if(requestEpoch!==sessionEpoch){const e=new Error('접속 정보가 바뀌었어요. 현재 반에서 다시 시도하세요.');e.staleSession=true;throw e;}if(!response.ok||!result.ok){const error=new Error(result.error||'연결을 확인해 주세요.');error.status=response.status;throw error;}return result;}
 function setStatus(text){$('chatStatus').textContent=text;}
 function applyUser(value){
  sessionEpoch++;noticeDeletionSupported=false;clearTimeout(poll);user=value;window.RobotlandIdentity=value;window.dispatchEvent(new CustomEvent('robotland-session-changed',{detail:value}));
  $('classLogin').hidden=!!user;$('classRoom').hidden=!user;$('classSidebar').hidden=!user;
  if(user){$('className').textContent=user.className;$('memberLabel').textContent=`${user.nickname} · ${user.role==='teacher'?'선생님':'학생'}`;$('messageKind').querySelector('option[value=notice]').disabled=user.role!=='teacher';$('messageKind').value=user.role==='teacher'?'notice':'message';cursor=0;messages=[];renderMessages();startPolling();}
  else{clearTimeout(poll);messages=[];cursor=0;closeSettings();}
 }
 function renderMessages(){
  $('chatEmpty').hidden=messages.length>0;
  const list=$('messageList'),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
  list.innerHTML=messages.map(m=>`<article class="message ${m.deviceId===deviceId?'mine':''} ${m.kind==='notice'?'notice-message':''}"><div class="message-meta"><strong>${esc(m.nickname)}</strong><span>${m.role==='teacher'?'선생님':m.kind==='report'?'상황 보고':'학생'}</span><time>${new Date(m.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}</time></div><p>${esc(m.text).replace(/\n/g,'<br>')}</p>${m.kind==='notice'&&user?.role==='teacher'&&noticeDeletionSupported?`<button type="button" class="delete-notice" data-delete-notice="${esc(m.id)}">공지 삭제</button>`:''}</article>`).join('');
  if(nearBottom||messages.at(-1)?.deviceId===deviceId)list.scrollTop=list.scrollHeight;
 }
 async function readMessages(){
  if(!user||!navigator.onLine)return;const currentUser=user;
  try{const result=await api('messages?after='+cursor);if(user!==currentUser)return;noticeDeletionSupported=!!result.noticeDeletionSupported;if(Array.isArray(result.noticeIds)){const ids=new Set(result.noticeIds);messages=messages.filter(m=>m.kind!=='notice'||ids.has(m.id));}const existing=new Set(messages.map(m=>m.id));messages.push(...result.messages.filter(m=>!existing.has(m.id)));messages=messages.slice(-200);cursor=result.cursor;renderMessages();$('pinnedNotice').hidden=!result.notice;if(result.notice){$('noticeText').textContent=result.notice.text;$('noticeBy').textContent=result.notice.nickname+' 선생님';}setStatus('연결됨 · 10초마다 새 소식 확인');}
  catch(error){if(user!==currentUser)return;if(error.status===401)await syncSession();else setStatus(error.message);}
 }
 function startPolling(){clearTimeout(poll);const current=sessionEpoch;readMessages().finally(()=>{if(user&&current===sessionEpoch)poll=setTimeout(startPolling,document.hidden?30000:10000);});}
 $('classLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!connected)return;const button=$('classJoin');button.disabled=true;$('loginFeedback').textContent='반 코드를 확인하고 있어요.';
  try{const result=await api('login',{code:$('classCode').value.trim().toUpperCase(),nickname:$('nickname').value.trim(),deviceId});applyUser(result.user);announceSession();$('classCode').value='';$('loginFeedback').textContent='';}
  catch(error){$('loginFeedback').textContent=error.message;}finally{button.disabled=!connected;}
 });
 $('classCode').addEventListener('input',()=>{$('classCode').value=$('classCode').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);});
 const settingsDialog=$('classSettingsDialog');let settingsHistory=false;
 function openSettings(){if(settingsDialog.open||!user)return;settingsDialog.showModal();$('classOptions').setAttribute('aria-expanded','true');history.pushState({...history.state,robotlandSettings:true},'');settingsHistory=true;}
 function closeSettings(){if(settingsDialog.open)settingsDialog.close();}
 $('classOptions').addEventListener('click',openSettings);$('closeClassSettings').addEventListener('click',closeSettings);
 settingsDialog.addEventListener('cancel',e=>{e.preventDefault();closeSettings();});
 settingsDialog.addEventListener('click',e=>{if(e.target!==settingsDialog)return;const r=settingsDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSettings();});
 settingsDialog.addEventListener('close',()=>{$('classOptions').setAttribute('aria-expanded','false');if(settingsHistory&&history.state?.robotlandSettings){settingsHistory=false;history.back();}else settingsHistory=false;$('classOptions').focus();});
 window.addEventListener('popstate',()=>{settingsHistory=false;closeSettings();});
 $('classLogout').addEventListener('click',async()=>{try{await api('logout',{});applyUser(null);announceSession();setStatus('');}catch(error){setStatus(error.message);}});
 async function sendMessage(text,kind){
  if(sending||!text.trim())return;if(!navigator.onLine){setStatus('오프라인에서는 보낼 수 없어요. 작성한 내용은 그대로 두었습니다.');return;}
  sending=true;$('sendMessage').disabled=true;
  try{const result=await api('messages/send',{text,kind,messageId:crypto.randomUUID()});if(!messages.some(m=>m.id===result.message.id))messages.push(result.message);renderMessages();$('messageText').value='';setStatus('전송했어요.');await readMessages();}
  catch(error){setStatus('보내지 못했어요. '+error.message);}finally{sending=false;$('sendMessage').disabled=false;}
 }
 $('messageForm').addEventListener('submit',e=>{e.preventDefault();sendMessage($('messageText').value,$('messageKind').value);});
 for(const button of document.querySelectorAll('[data-report]'))button.addEventListener('click',()=>{$('messageKind').value='report';$('messageText').value=button.dataset.report;$('messageText').focus();});
 $('refreshMessages').addEventListener('click',readMessages);
 $('messageList').addEventListener('click',async e=>{const b=e.target.closest('[data-delete-notice]');if(!b||user?.role!=='teacher'||!noticeDeletionSupported)return;if(!confirm('이 공지를 우리 반에서 삭제할까요?'))return;b.disabled=true;try{const result=await api('messages/delete',{messageId:b.dataset.deleteNotice});messages=messages.filter(m=>m.id!==result.deletedId);renderMessages();await readMessages();setStatus('공지를 삭제했어요. 다른 기기에도 다음 새로고침 때 반영됩니다.');}catch(error){setStatus(error.message);}finally{b.disabled=false;}});
 $('backupPlan').addEventListener('click',async()=>{try{const plan=window.RobotlandPlan?.snapshot();if(!plan)throw new Error('저장할 계획이 없어요.');$('backupStatus').textContent='시트에 백업 중…';await api('plan/save',{plan});$('backupStatus').textContent='이 기기의 계획을 구글시트에 백업했어요.';}catch(e){$('backupStatus').textContent=e.message;}});
 $('restorePlan').addEventListener('click',async()=>{try{const result=await api('plan');if(!result.plan){$('backupStatus').textContent='이 반·이 기기에 저장된 백업이 없어요.';return;}if(!confirm('현재 기기의 동선을 구글시트 백업으로 바꿀까요?'))return;window.RobotlandPlan.restore(result.plan);$('backupStatus').textContent='백업을 불러왔어요.';}catch(e){$('backupStatus').textContent=e.message;}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&connected)syncSession().then(()=>{if(user)startPolling();});});window.addEventListener('online',()=>{if(connected)syncSession().then(()=>{if(user)startPolling();});});window.addEventListener('offline',()=>setStatus('오프라인 · 메시지 전송은 연결 후 가능합니다.'));
 async function initialize(){
  try{const config=await api('config');connected=config.connected;window.dispatchEvent(new CustomEvent('robotland-backend-ready',{detail:connected}));$('classJoin').disabled=!connected;$('backendNotice').hidden=connected;if(!connected){$('loginFeedback').textContent='Apps Script 연결 전입니다. 지도와 개인 동선은 지금 사용할 수 있어요.';return;}try{const result=await api('session');applyUser(result.user);}catch(e){if(e.status!==401)$('loginFeedback').textContent=e.message;}}
  catch{connected=false;$('classJoin').disabled=true;$('loginFeedback').textContent='서버에 연결할 수 없어요. 저장된 개인 동선은 지도에서 사용할 수 있습니다.';}
 }
 window.RobotlandClassroom={api,applyUser,announceSession,openSettings,deviceId,get user(){return user;},get connected(){return connected;}};
 initialize();
})();
