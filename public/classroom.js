(() => {
 const T=window.RobotlandI18n.text;
 const $=id=>document.getElementById(id);
 let entryBootstrap=null,initialGroups=null,configData=null;
 let user=null,connected=false,cursor=0,poll=null,messages=[],sending=false,sessionEpoch=0,noticeDeletionSupported=false;
 const sessionSyncKey='robotland-session-sync';
 function announceSession(){try{localStorage.setItem(sessionSyncKey,crypto.randomUUID());}catch{}}
 const entry=window.RobotlandEntry.create({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)}});
 const recoveryKey='robotland-student-recovery-v1';let syncing=null,recoveryRegistration=null,recoveryRegisteredEpoch=-1,recoveryRegisteredAt=0,pollGeneration=0;
 function storedRecovery(){try{return JSON.parse(localStorage.getItem(recoveryKey)||'null');}catch{return null;}}
 function clearRecovery(){try{localStorage.removeItem(recoveryKey);}catch{}}
 function pending(text=T("접속 정보를 확인하고 있어요…"),retry=false){$('classLoading').hidden=false;$('classLoadingText').textContent=text;$('retrySession').hidden=!retry;$('classLogin').hidden=true;}
 function registerRecovery(){
  if(recoveryRegisteredEpoch===sessionEpoch&&Date.now()-recoveryRegisteredAt<6*3600000)return Promise.resolve();
  if(recoveryRegistration?.epoch===sessionEpoch)return recoveryRegistration.promise;
  const current=sessionEpoch,job={epoch:current};
  job.promise=performRecoveryRegistration().finally(()=>{if(recoveryRegistration===job)recoveryRegistration=null;});recoveryRegistration=job;return job.promise;
 }
 async function performRecoveryRegistration(){const current=sessionEpoch;const who=user;if(!who||who.role!=='student'||!who.recoverySupported)return;try{let record=storedRecovery();if(!record||record.classId!==who.classId||record.deviceId!==who.deviceId)record={classId:who.classId,deviceId:who.deviceId,token:[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('')};localStorage.setItem(recoveryKey,JSON.stringify(record));await api('recovery/register',{recoveryToken:record.token});if(current===sessionEpoch){recoveryRegisteredEpoch=current;recoveryRegisteredAt=Date.now();}if(user===who)$('recoveryStatus').textContent=T("이 기기는 자동 재입장이 준비됐어요.");}catch{if(user===who)$('recoveryStatus').textContent=T("자동 재입장을 준비하지 못했어요. 필요하면 선생님께 재입장 QR을 받아주세요.");}}
 async function recover(){const saved=storedRecovery()||entry.pendingRecovery();if(!saved||!/^[a-f0-9]{64}$/.test(saved.token))return null;try{return await api('recovery/resume',{recoveryToken:saved.token,deviceId:saved.deviceId});}catch(e){if([400,401,403,404,410].includes(e.status)){clearRecovery();return null;}throw e;}}
 function syncSession(){if(syncing)return syncing;syncing=(async()=>{const current=sessionEpoch;try{let result;try{result=await api('session');}catch(e){if(e.status!==401)throw e;result=await recover();}if(current!==sessionEpoch)return;if(result){if(!user||user.classId!==result.user.classId||user.nickname!==result.user.nickname||user.deviceId!==result.user.deviceId||user.role!==result.user.role||user.recoverySupported!==result.user.recoverySupported)applyUser(result.user);else{$('classLoading').hidden=true;registerRecovery();}}else{applyUser(null);$('loginFeedback').textContent=T("처음 입장할 때는 반 코드와 이름을 입력하세요. 기존 학생은 선생님께 재입장 QR을 받아주세요.");}}catch(error){if(current!==sessionEpoch)return;if(!user)pending(T("연결이 느리거나 잠시 끊겼어요. 접속 정보를 아직 확인하지 못했습니다."),true);else setStatus(T("연결 확인 중 · 현재 접속과 작성 내용은 유지됩니다."));}})().finally(()=>syncing=null);return syncing;}
 window.addEventListener('storage',e=>{if(e.key===sessionSyncKey&&connected)syncSession();});
 let deviceId;try{deviceId=localStorage.getItem('robotland-device-id');if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('robotland-device-id',deviceId);}}catch{deviceId=crypto.randomUUID();}
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const request=window.RobotlandRequests.create({fetch:(...args)=>fetch(...args),epoch:()=>sessionEpoch,translate:T});
 async function api(path,body){
  const entering=(path==='login'||path==='invites/join')&&body;
  if(entering)body=entry.prepare(path,body);
  try{const result=window.RobotlandI18n.apiResult(await request(path,body));if(entering){const ready=entry.complete(body,result);entryBootstrap={...result,recoveryRegistered:ready};}return result;}
  catch(error){if(entering&&!error.status&&!error.staleSession)error.message=T("입장 응답이 늦어요. 같은 버튼을 다시 누르면 이어서 확인합니다.");throw error;}
 }
 function setStatus(text){$('chatStatus').textContent=text;}
 function applyUser(value){
  const bootstrap=entryBootstrap?.user===value?entryBootstrap:null;entryBootstrap=null;initialGroups=bootstrap?.groups?bootstrap:null;
  sessionEpoch++;if(bootstrap?.recoveryRegistered){recoveryRegisteredEpoch=sessionEpoch;recoveryRegisteredAt=Date.now();$('recoveryStatus').textContent=T("이 기기는 자동 재입장이 준비됐어요.");}pollGeneration++;$('classLoading').hidden=true;if(value?.deviceId){deviceId=value.deviceId;try{localStorage.setItem('robotland-device-id',deviceId);}catch{}}noticeDeletionSupported=false;clearTimeout(poll);user=value;window.RobotlandIdentity=value;window.dispatchEvent(new CustomEvent('robotland-session-changed',{detail:value}));
  $('classLogin').hidden=!!user;$('classRoom').hidden=!user;$('classSidebar').hidden=!user;
  if(user){$('className').textContent=user.className;$('memberLabel').textContent=`${user.nickname} · ${user.role==='teacher'?T("선생님"):T("학생")}`;$('messageKind').querySelector('option[value=notice]').disabled=user.role!=='teacher';$('messageKind').value=user.role==='teacher'?'notice':'message';cursor=0;messages=[];renderMessages();startPolling();}
  else{clearTimeout(poll);messages=[];cursor=0;closeSettings();}
  if(user?.role==='student')registerRecovery();else if(user){clearRecovery();$('recoveryStatus').textContent=T("선생님은 교사 입장코드와 이름으로 다시 들어올 수 있어요.");}
  try{if(user){localStorage.setItem('robotland-last-role',user.role);if(user.role==='teacher')localStorage.setItem('robotland-teacher-name',user.nickname);}else if(localStorage.getItem('robotland-last-role')==='teacher'){document.querySelector('.teacher-login').open=true;$('staffLoginName').value=localStorage.getItem('robotland-teacher-name')||'';}}catch{}
 }
 function renderMessages(){
  $('chatEmpty').hidden=messages.length>0;
  const list=$('messageList'),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
  list.innerHTML=messages.map(m=>`<article class="message ${m.deviceId===deviceId?'mine':''} ${m.kind==='notice'?'notice-message':''}"><div class="message-meta"><strong>${esc(m.nickname)}</strong><span>${m.role==='teacher'?T("선생님"):m.kind==='report'?T("상황 보고"):T("학생")}</span><time>${new Date(m.createdAt).toLocaleTimeString(window.RobotlandI18n.locale,{hour:'2-digit',minute:'2-digit',hour12:false})}</time></div><p>${esc(m.text).replace(/\n/g,'<br>')}</p>${m.kind==='notice'&&user?.role==='teacher'&&noticeDeletionSupported?T("<button type=\"button\" class=\"delete-notice\" data-delete-notice=\"⟦0⟧\">공지 삭제</button>",[esc(m.id)]):''}</article>`).join('');
  if(nearBottom||messages.at(-1)?.deviceId===deviceId)list.scrollTop=list.scrollHeight;
 }
 async function readMessages(){
  if(!user||user.staffOnly||!navigator.onLine)return;const currentUser=user;
  try{const result=await api('messages?after='+cursor);if(user!==currentUser)return;noticeDeletionSupported=!!result.noticeDeletionSupported;if(Array.isArray(result.noticeIds)){const ids=new Set(result.noticeIds);messages=messages.filter(m=>m.kind!=='notice'||ids.has(m.id));}const existing=new Set(messages.map(m=>m.id));messages.push(...result.messages.filter(m=>!existing.has(m.id)));messages=messages.slice(-200);cursor=result.cursor;renderMessages();$('pinnedNotice').hidden=!result.notice;if(result.notice){$('noticeText').textContent=result.notice.text;$('noticePreview').textContent=result.notice.text.replace(/\s+/g,' ');$('noticeBy').textContent=result.notice.nickname+T(" 선생님");}setStatus(T("연결됨 · 10초마다 새 소식 확인"));}
  catch(error){if(user!==currentUser)return;if(error.status===401)await syncSession();else setStatus(error.message);}
 }
 function startPolling(){clearTimeout(poll);const generation=++pollGeneration,current=sessionEpoch;if(document.hidden||!navigator.onLine||!user||user.staffOnly)return;readMessages().finally(()=>{if(generation===pollGeneration&&user&&!user.staffOnly&&current===sessionEpoch&&!document.hidden&&navigator.onLine)poll=setTimeout(startPolling,10000+Math.floor(Math.random()*1500));});}
 $('classLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!connected)return;const button=$('classJoin');button.disabled=true;$('loginFeedback').textContent=T("반 코드를 확인하고 있어요.");
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
 $('classLogout').addEventListener('click',async()=>{if(!confirm(user?.role==='teacher'?T("로그아웃할까요? 교사 입장코드와 이름으로 다시 들어올 수 있어요."):T("이 기기에서 로그아웃할까요? 조 소속은 유지됩니다. 선생님의 재입장 QR로 다시 들어올 수 있어요.")))return;try{await api('logout',{});clearRecovery();if(user?.role!=='teacher'){deviceId=crypto.randomUUID();try{localStorage.setItem('robotland-device-id',deviceId);}catch{}}applyUser(null);announceSession();setStatus('');}catch(error){setStatus(error.message);}});
 async function sendMessage(text,kind){
  if(sending||!text.trim())return;if(!navigator.onLine){setStatus(T("오프라인에서는 보낼 수 없어요. 작성한 내용은 그대로 두었습니다."));return;}
  sending=true;$('sendMessage').disabled=true;
  try{const result=await api('messages/send',{text,kind,messageId:crypto.randomUUID()});if(!messages.some(m=>m.id===result.message.id))messages.push(result.message);renderMessages();if(result.message.kind==='notice')window.dispatchEvent(new CustomEvent('robotland-notice-sent',{detail:result}));$('messageText').value='';setStatus(T("전송했어요."));await readMessages();}
  catch(error){setStatus(T("보내지 못했어요. ")+error.message);}finally{sending=false;$('sendMessage').disabled=false;}
 }
 $('messageForm').addEventListener('submit',e=>{e.preventDefault();sendMessage($('messageText').value,$('messageKind').value);});
 for(const button of document.querySelectorAll('[data-report]'))button.addEventListener('click',()=>{$('messageKind').value='report';$('messageText').value=T(button.dataset.report);$('messageText').focus();});
 $('refreshMessages').addEventListener('click',readMessages);
 $('messageList').addEventListener('click',async e=>{const b=e.target.closest('[data-delete-notice]');if(!b||user?.role!=='teacher'||!noticeDeletionSupported)return;if(!confirm(T("이 공지를 우리 반에서 삭제할까요?")))return;b.disabled=true;try{const result=await api('messages/delete',{messageId:b.dataset.deleteNotice});messages=messages.filter(m=>m.id!==result.deletedId);renderMessages();await readMessages();setStatus(T("공지를 삭제했어요. 다른 기기에도 다음 새로고침 때 반영됩니다."));}catch(error){setStatus(error.message);}finally{b.disabled=false;}});
 $('backupPlan').addEventListener('click',async()=>{try{const plan=window.RobotlandPlan?.snapshot();if(!plan)throw new Error(T("저장할 계획이 없어요."));$('backupStatus').textContent=T("시트에 백업 중…");await api('plan/save',{plan});$('backupStatus').textContent=T("이 기기의 계획을 구글시트에 백업했어요.");}catch(e){$('backupStatus').textContent=e.message;}});
 $('restorePlan').addEventListener('click',async()=>{try{const result=await api('plan');if(!result.plan){$('backupStatus').textContent=T("이 반·이 기기에 저장된 백업이 없어요.");return;}if(!confirm(T("현재 기기의 동선을 구글시트 백업으로 바꿀까요?")))return;window.RobotlandPlan.restore(result.plan);$('backupStatus').textContent=T("백업을 불러왔어요.");}catch(e){$('backupStatus').textContent=e.message;}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){pollGeneration++;clearTimeout(poll);return;}if(connected)syncSession().then(()=>{if(user)startPolling();});});window.addEventListener('online',()=>{if(connected)syncSession().then(()=>{if(user)startPolling();});});window.addEventListener('offline',()=>setStatus(T("오프라인 · 메시지 전송은 연결 후 가능합니다.")));
 async function initialize(){
  if(!user)pending();$('retrySession').disabled=true;
  try{const config=configData=await api('config');connected=config.connected;window.dispatchEvent(new CustomEvent('robotland-backend-ready',{detail:connected}));$('classJoin').disabled=!connected;$('backendNotice').hidden=connected;if(!connected){applyUser(null);$('loginFeedback').textContent=T("지도와 개인 동선을 먼저 이용하세요. 반 연결은 준비 중입니다.");return;}await syncSession();}
  catch{if(!user)pending(T("접속 정보를 아직 확인하지 못했어요. 인터넷 연결을 확인하고 다시 눌러주세요."),true);}
  finally{$('retrySession').disabled=false;}
 }
 $('retrySession').addEventListener('click',initialize);
 window.RobotlandClassroom={api,applyUser,announceSession,openSettings,get deviceId(){return deviceId;},get initialGroups(){return initialGroups;},get config(){return configData;},get user(){return user;},get connected(){return connected;}};
 window.RobotlandClassroom.ready=initialize();
})();
