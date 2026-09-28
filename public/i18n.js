(() => {
  'use strict';
  const packs=globalThis.RobotlandAppPacks, languages=['ko','en','zh','ru'];
  let language='ko';
  try { const saved=localStorage.getItem('robotland-language')||localStorage.getItem('robotland-chat-language'); if(languages.includes(saved))language=saved; } catch {}
  const pack=packs[language]||packs.ko, missing=new Set(), attrs=['aria-label','title','placeholder','alt'];
  function translatePart(source){
    const key=source.trim();
    if(!key)return source;
    if(Object.hasOwn(pack.messages,key))return source.slice(0,source.indexOf(key))+pack.messages[key]+source.slice(source.indexOf(key)+key.length);
    if(/[가-힣]/.test(key))missing.add(key);
    return source;
  }
  // Substitute dynamic values only after translating the trusted UI template.
  // This keeps names, messages, codes and other user content unchanged.
  function text(source,values=[]){
    if(source==null)return '';
    source=String(source);
    let translated;
    if(Object.hasOwn(pack.messages,source.trim()))translated=translatePart(source);
    else translated=source.split(/(<[^>]*>)/g).map(part=>part.startsWith('<')?part.replace(/\b(aria-label|title|placeholder|alt)="([^"]*)"/g,(_,key,value)=>key+'="'+translatePart(value)+'"'):translatePart(part)).join('');
    return translated.replace(/⟦(\d+)⟧/g,(match,i)=>i<values.length?String(values[i]??''):match);
  }
  function apiResult(result){
    // Only server-owned error fields are translated, never chat or class data.
    if(result&&typeof result==='object'){
      if(typeof result.error==='string')result.error=text(result.error);
      for(const key of ['push','lastTest'])if(result[key]&&typeof result[key].error==='string')result[key].error=text(result[key].error);
    }
    return result;
  }
  function translateStatic(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes)if(!node.parentElement?.closest('script,style,noscript,#appLanguage'))node.nodeValue=text(node.nodeValue);
    for(const el of root.querySelectorAll('*'))for(const attr of attrs)if(el.hasAttribute(attr))el.setAttribute(attr,text(el.getAttribute(attr)));
  }
  document.documentElement.lang=pack.locale;
  translateStatic(document.documentElement);
  const description=document.querySelector('meta[name="description"]');
  if(description)description.content=text(description.content);
  const manifest=document.querySelector('link[rel="manifest"]');
  if(manifest&&language!=='ko')manifest.href='manifest-'+language+'.webmanifest';
  const selector=document.getElementById('appLanguage');
  selector.value=language;
  const identity=user=>user?{classId:user.classId,deviceId:user.deviceId,role:user.role}:null;
  const sameUser=(a,b)=>JSON.stringify(identity(a))===JSON.stringify(identity(b));
  function setLanguage(next){
    if(!languages.includes(next)||next===language)return;
    const bridge=window.RobotlandClassroom;
    const draft={at:Date.now(),user:identity(bridge?.user),view:document.body.dataset.view,
      room:document.querySelector('[data-room-view][aria-pressed="true"]')?.dataset.roomView,
      staffView:document.querySelector('[data-staff-view][aria-pressed="true"]')?.dataset.staffView,
      scope:window.RobotlandPlan?.getScope(),fields:{}};
    for(const id of ['messageText','messageKind','staffMessageText']){const el=document.getElementById(id);if(el)draft.fields[id]=el.value;}
    try{
      sessionStorage.setItem('robotland-language-draft',JSON.stringify(draft));
      localStorage.setItem('robotland-language',next);
      localStorage.setItem('robotland-chat-language',next);
    }catch{
      selector.value=language;
      const toast=document.getElementById('toast');if(toast){toast.textContent=text('저장 불가 · 화면을 유지해 주세요');toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),4000);}
      return;
    }
    location.reload();
  }
  selector.addEventListener('change',()=>setLanguage(selector.value));
  function syncWorker(){
    if(!('serviceWorker' in navigator))return;
    navigator.serviceWorker.ready.then(reg=>(navigator.serviceWorker.controller||reg.active)?.postMessage({type:'robotland-language',language})).catch(()=>{});
  }
  window.RobotlandI18n={text,apiResult,language,locale:pack.locale,languages,pack,missing,setLanguage};
  document.addEventListener('DOMContentLoaded',()=>{
    let draft=null;
    try{draft=JSON.parse(sessionStorage.getItem('robotland-language-draft')||'null');}catch{}
    if(draft&&Date.now()-draft.at<120000){
      if(['map','plan','chat'].includes(draft.view))document.querySelector('[data-mobile-view="'+draft.view+'"]')?.click();
      let restored=false;
      const restore=()=>{
        const bridge=window.RobotlandClassroom;
        if(restored||!sameUser(draft.user,bridge?.user))return;
        restored=true;
        try{sessionStorage.removeItem('robotland-language-draft');}catch{}
        if(['chat','groups','staff'].includes(draft.room))document.querySelector('[data-room-view="'+draft.room+'"]')?.click();
        if(['overview','talk'].includes(draft.staffView))document.querySelector('[data-staff-view="'+draft.staffView+'"]')?.click();
        for(const [id,value]of Object.entries(draft.fields||{})){
          const el=document.getElementById(id);if(!el)continue;
          if(id==='messageKind'&&value==='notice'&&bridge?.user?.role!=='teacher')continue;
          el.value=value;
        }
        if(draft.scope?.mode==='group'){
          let done=false;
          const restoreGroup=()=>{
            if(done||!sameUser(draft.user,bridge?.user))return;
            const group=window.RobotlandGroup;
            if(group?.id===draft.scope.group?.id){done=true;window.RobotlandGroups.resumePlan();window.removeEventListener('robotland-groups-changed',restoreGroup);}
          };
          window.addEventListener('robotland-groups-changed',restoreGroup);restoreGroup();
        }
      };
      // applyUser also resets composer defaults, so restore after it completes.
      window.addEventListener('robotland-session-changed',()=>queueMicrotask(restore));
      window.RobotlandClassroom?.ready.then(restore);
    }else{try{sessionStorage.removeItem('robotland-language-draft');}catch{}}
    syncWorker();
    if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',syncWorker);
  });
})();
