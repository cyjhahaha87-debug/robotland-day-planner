(() => {
  'use strict';
  const $=id=>document.getElementById(id),bridge=window.RobotlandClassroom,dialog=$('pushDialog');
  const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const installed=()=>!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
  const capable=()=>('Notification' in window)&&('PushManager' in window)&&('serviceWorker' in navigator);
  let registered=false,storeReady=false,busy=false,config=null,epoch=0,timer,historyEntry=false,lastNotice='',sync=Promise.resolve();
  const text=value=>$('pushFeedback').textContent=value;
  function render(){
    const user=bridge.user,needsInstall=apple&&!installed(),allowed=!!user&&!user.staffOnly;
    $('pushDestination').textContent=allowed?user.className+' · '+user.nickname:'반에 입장한 뒤 공지 알림을 켜주세요.';
    $('pushDescription').textContent=needsInstall?'아이폰 홈 화면에 추가한 로봇랜드 앱을 열어주세요. 그 앱에서 알림을 허용합니다.':'선생님 공지만 이 기기로 받습니다. 일반 대화와 상황 보고는 알림으로 보내지 않아요.';
    $('pushState').textContent=registered?'공지 알림 켜짐':!capable()?'이 환경에서는 알림을 지원하지 않아요.':Notification.permission==='denied'?'기기 설정에서 알림 허용이 필요해요.':!config?.pushReady||!storeReady?'공지 알림 연결 준비 중':'공지 알림 꺼짐';
    $('enablePush').disabled=busy||!allowed||needsInstall||!capable()||!config?.pushReady||!storeReady||Notification.permission==='denied';
    $('enablePush').hidden=registered;
    $('testPush').hidden=!registered;$('disablePush').hidden=!registered;
    $('testPush').disabled=busy||!navigator.onLine;$('disablePush').disabled=busy;
    $('testPush').textContent=apple?'이 아이폰에 시험 알림':'이 기기에 시험 알림';
    $('refreshPush').disabled=busy;
    $('pushDeniedHelp').hidden=!capable()||Notification.permission!=='denied';
  }
  async function registration(){return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('앱을 새로고침한 뒤 다시 시도하세요.')),12000))]);}
  async function refresh(rebind=false){
    const current=epoch;registered=false;storeReady=false;render();
    try{
      if(!config){const r=await fetch('/api/config',{signal:AbortSignal.timeout(12000)});config=await r.json();}
      if(!bridge.user||bridge.user.staffOnly||!config.pushReady||current!==epoch)return;
      const state=await bridge.api('push/status');if(current!==epoch)return;storeReady=state.supported===true;registered=state.registered===true;
      if(capable()&&Notification.permission==='granted'&&(!apple||installed())){
        const sub=await(await registration()).pushManager.getSubscription();if(current!==epoch)return;
        if(sub&&!registered&&rebind){const r=await bridge.api('push/subscribe',{subscription:sub.toJSON()});if(current!==epoch)return;registered=r.registered;}
        if(!sub)registered=false;
      }else registered=false;
      if(state.lastTest&&Date.now()-state.lastTest.createdAt<180000){if(state.lastTest.state==='done')text(state.lastTest.accepted?'시험 알림을 푸시 서비스에 전달했어요. 아이폰 알림 화면에서도 확인해 주세요.':'알림 등록이 바뀌었어요. 알림을 다시 켠 뒤 시험해 주세요.');else if(state.lastTest.error)text(state.lastTest.error);}
    }catch(error){if(current===epoch)text(error.status===404?'선생님이 알림 기능을 연결 중이에요. 연결 후 다시 열어주세요.':error.message||'인터넷 연결을 확인해 주세요.');}
    finally{if(current===epoch)render();}
  }
  function scheduleRefresh(rebind=false){sync=sync.catch(()=>{}).then(()=>refresh(rebind));return sync;}
  async function enable(){
    if(busy)return;busy=true;render();text('알림 허용을 확인하고 있어요.');
    const current=epoch;
    try{
      // Permission prompt must be requested directly from the user's tap on iOS.
      const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(permission!=='granted'){text('알림을 허용하면 공지를 받을 수 있어요.');return;}
      const reg=await registration();let sub=await reg.pushManager.getSubscription();if(current!==epoch)return;
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(config.pushPublicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))});
      if(current!==epoch)return;const result=await bridge.api('push/subscribe',{subscription:sub.toJSON()});if(current!==epoch)return;registered=result.registered;text('이 기기에서 우리 반 공지를 받도록 설정했어요. 시험 알림으로 확인해 보세요.');
    }catch(error){text(error.message||'알림 등록을 마치지 못했어요. 다시 시도해 주세요.');}
    finally{busy=false;render();}
  }
  $('enablePush').addEventListener('click',enable);
  $('testPush').addEventListener('click',async()=>{
    if(busy)return;busy=true;render();text('이 기기에 보낼 시험 알림을 준비하고 있어요.');
    try{const r=await bridge.api('push/test',{});if(!r.push?.queued)throw new Error(r.push?.error||'시험 알림을 접수하지 못했어요.');text('시험 알림을 접수했어요. 지금 홈 화면으로 나가 화면을 잠가주세요. 약 10초 뒤 이 기기에만 보냅니다.');clearTimeout(timer);timer=setTimeout(()=>{if(!document.hidden)scheduleRefresh();},18000);}
    catch(error){text(error.message);}finally{busy=false;render();}
  });
  $('disablePush').addEventListener('click',async()=>{
    if(busy)return;busy=true;render();
    try{await bridge.api('push/unsubscribe',{});registered=false;const sub=await(await registration()).pushManager.getSubscription();if(sub)await sub.unsubscribe();text('이 기기의 공지 알림을 껐어요.');}
    catch(error){text(error.message);}finally{busy=false;render();}
  });
  $('refreshPush').addEventListener('click',()=>{config=null;text('');scheduleRefresh(true);});
  function open(){if(dialog.open)return;dialog.showModal();history.pushState({...history.state,robotlandPush:true},'');historyEntry=true;scheduleRefresh();}
  function close(){if(dialog.open)dialog.close();}
  $('openPush').addEventListener('click',open);$('closePush').addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(historyEntry&&history.state?.robotlandPush){historyEntry=false;history.back();}else historyEntry=false;$('openPush').focus();});
  window.addEventListener('popstate',()=>{historyEntry=false;close();});
  window.addEventListener('robotland-session-changed',()=>{epoch++;clearTimeout(timer);lastNotice='';$('pushSendFeedback').hidden=true;text('');registered=false;storeReady=false;render();scheduleRefresh(true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dialog.open)scheduleRefresh(true);});
  window.addEventListener('robotland-notice-sent',e=>{
    lastNotice=e.detail.message.id;const failed=e.detail.push?.queued===false;
    $('pushSendFeedback').hidden=!failed;$('pushSendText').textContent=failed?'공지는 등록됐지만 푸시 요청이 접수되지 않았어요.':'';
  });
  $('retryNoticePush').addEventListener('click',async()=>{
    const b=$('retryNoticePush');b.disabled=true;
    try{const r=await bridge.api('push/retry',{messageId:lastNotice});if(!r.push?.queued)throw new Error('알림 접수가 지연되고 있어요. 잠시 후 다시 시도하세요.');$('pushSendText').textContent='실패한 공지 알림을 다시 요청했어요.';}
    catch(error){$('pushSendText').textContent=error.message;}finally{b.disabled=false;}
  });
  async function openNotice(data){
    await bridge.ready;if(data.test){open();text('시험 알림을 눌러 앱으로 돌아왔어요. 아이폰에서 알림 수신과 열기가 확인됐습니다.');return;}
    if(!bridge.user||bridge.user.classId!==data.classId){open();text('현재 접속한 반과 다른 반의 공지입니다. 해당 반에 입장한 뒤 확인해 주세요.');return;}
    document.querySelector('.mobile-nav [data-mobile-view="chat"]').click();document.querySelector('[data-room-view="chat"]').click();$('refreshMessages').click();
  }
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='robotland-open-notice')openNotice(e.data.data);});
  const search=new URLSearchParams(location.search);
  if(search.has('notice')||search.has('pushTest')){const data={noticeId:search.get('notice')||'',classId:search.get('class')||'',test:search.get('pushTest')==='1'};search.delete('notice');search.delete('class');search.delete('pushTest');history.replaceState(history.state,'',location.pathname+(search.size?'?'+search.toString():'')+location.hash);openNotice(data);}
  bridge.ready.then(()=>scheduleRefresh(true));render();
})();
