(() => {
  'use strict';
  const $=id=>document.getElementById(id),data=window.MAP_DATA,core=window.PlannerCore;
  const graph=core.createGraph(data),byId=Object.fromEntries(data.attractions.map(p=>[p.id,p]));
  const HALL='lunch-hall',EXIT='exit-meeting';
  const state={stops:[{id:HALL,stay:40},{id:EXIT,stay:0}],pace:1,baseMinutes:4,start:'10:00',returnGate:false,calibration:null,measurements:data.measuredSegments||[],zoom:1,filters:{ride:true,exhibit:false,food:false,stage:false,shop:false},lunchTime:'12:00',mealMinutes:40,exitTime:'13:00'};
  const defaults=JSON.parse(JSON.stringify(state));let planScope='personal',activeGroup=null;
  function storageKey(){if(planScope==='group'&&activeGroup)return 'robotland-group-draft-'+window.RobotlandIdentity.classId+'-'+activeGroup.id;return window.RobotlandIdentity?.classId?'robotland-plan-'+window.RobotlandIdentity.classId:'robotland-onsite-plan-v1';}
  restoreState();normalizeStops();
  let toastTimer,latestPlan;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nameOf=id=>id==='gate'?'출입구 광장':id==='central'?'중앙광장':byId[id]?.name||id;
  function timeAt(offset){const[h,m]=state.start.split(':').map(Number),v=h*60+m+offset;return(v>=1440?`+${Math.floor(v/1440)}일 `:'')+`${String(Math.floor(v/60)%24).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;}
  function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200);}
  function activeReferences(){const refs=state.measurements.map(r=>({...r}));if(state.calibration){const c=state.calibration,i=refs.findIndex(r=>(r.from===c.from&&r.to===c.to)||(r.from===c.to&&r.to===c.from));if(i>=0)refs[i]=c;else refs.push(c);}return refs;}
  function defaultQueue(id){return byId[id]?.category==='ride'?10:0;}
  function defaultRide(id){return byId[id]?.category==='ride'?(window.RIDE_TIMES?.[id]?.minutes||3):0;}
  function timingSource(id){if(byId[id]?.category!=='ride')return '';const v=window.RIDE_TIMES?.[id];return v?'<p class="timing-source"><a href="'+esc(v.url)+'" target="_blank" rel="noopener noreferrer">탑승 영상 '+Math.floor(v.seconds/60)+'분 '+v.seconds%60+'초 ↗</a> · 기본 '+v.minutes+'분</p>':'<p class="timing-source unverified">탑승 영상 미확인 · 이용시간 임시 3분</p>';}
  function toggleStop(id){
    if(id===EXIT){toast('13:00 로봇 앞 원형 공간에서 퇴장 집합합니다');return;}
    if(id===HALL){$('lunchTime').focus();$('lunchTime').scrollIntoView({block:'center'});toast('다목적홀은 점심 필수 방문지예요');return;}
    const i=state.stops.findIndex(s=>s.id===id);
    if(i>=0){state.stops.splice(i,1);toast(`${nameOf(id)}을 동선에서 제외했어요`);}
    else{const stop={id,stay:0,queue:defaultQueue(id),ride:defaultRide(id)};state.stops.splice(state.stops.length-1,0,stop);toast(`${nameOf(id)}을 추가하고 시간을 맞췄어요`);}
    render();
  }
  function normalizeStops(){state.lunchTime='12:00';state.mealMinutes=40;state.exitTime='13:00';state.returnGate=false;state.stops=state.stops.filter(s=>s.id!==EXIT);if(!state.stops.some(s=>s.id===HALL))state.stops.push({id:HALL,stay:40});state.stops.push({id:EXIT,stay:0});}
  function render(){normalizeStops();
    for(const stop of state.stops)stop.stay=stop.id===HALL?(state.mealMinutes||0):(stop.queue||0)+(stop.ride||0);
    latestPlan=core.plan(graph,state.stops,{...state,autoLunch:true});state.stops=latestPlan.stops;const hi=state.stops.findIndex(s=>s.id===HALL),lunchLeg=latestPlan.legs[hi];const exitLeg=latestPlan.legs.at(-1);$('exitStatus').textContent=timeAt(exitLeg.arrival)+' 도착 예상 · '+(exitLeg.late?'집합보다 '+exitLeg.late+'분 늦어요':exitLeg.wait?'집합까지 '+exitLeg.wait+'분 여유':'집합 시각에 도착');$('exitStatus').classList.toggle('late',!!exitLeg.late);
    $('stopCount').textContent=state.stops.length;$('mobileStopCount').textContent=state.stops.length;$('mobileWalk').textContent=latestPlan.walk+'분 이동';$('clearRoute').disabled=state.stops.length===2;$('emptyState').hidden=true;
    $('walkingTotal').innerHTML=`${latestPlan.walk}<small>분</small>`;
    $('finishTime').textContent=state.lunchTime&&state.mealMinutes!==null?timeAt(latestPlan.total):'시간 미정';
    $('departureLabel').textContent=state.start;
    $('summaryCaption').textContent=`대기·이용 ${latestPlan.stay}분${latestPlan.waiting?` · 집합 대기 ${latestPlan.waiting}분`:''}${state.mealMinutes===null?' · 식사시간 미입력':''}`;
    for(const b of document.querySelectorAll('[data-category]'))b.setAttribute('aria-pressed',String(!!state.filters[b.dataset.category]));
    $('phaseHint').textContent='점심 전후는 자동으로 나눠요';
    $('lunchStatus').classList.toggle('late',!!lunchLeg.late);
    $('lunchStatus').textContent=`${timeAt(lunchLeg.arrival)} 도착 예상 · ${!state.lunchTime?'집합 시각 미정':lunchLeg.late?`집합보다 ${lunchLeg.late}분 늦어요`:lunchLeg.wait?`집합까지 ${lunchLeg.wait}분 여유`:'집합 시각에 도착'}${state.mealMinutes===null?' · 식사시간 미정':''}`;
    for(const p of data.attractions){
      const i=state.stops.findIndex(s=>s.id===p.id),pin=$('pin-'+p.id),chip=$('chip-'+p.id);
      pin.classList.toggle('selected',i>=0);chip.classList.toggle('selected',i>=0);pin.hidden=!(state.filters[p.category]||i>=0);chip.hidden=!state.filters[p.category];
      pin.setAttribute('aria-pressed',String(i>=0));chip.setAttribute('aria-pressed',String(i>=0));
      pin.setAttribute('aria-label',p.id===EXIT?'13시 로봇 앞 퇴장 집합 장소':p.id===HALL?'다목적홀 점심 집합 장소':`${p.name}${i>=0?`, ${i+1}번째 방문지, 눌러서 제외`:', 동선에 추가'}`);
      pin.firstChild.textContent=p.id===EXIT?'집':p.id===HALL?'식':i>=0?i+1:'+';chip.querySelector('.chip-symbol').textContent=p.id===EXIT?'집':p.id===HALL?'식':i>=0?'✓':'+';
    }
    $('routeList').innerHTML=state.stops.map((s,i)=>{
      const l=latestPlan.legs[i],isHall=s.id===HALL,isExit=s.id===EXIT,isFixed=isHall||isExit;const facilities=state.stops.filter(x=>x.id!==HALL&&x.id!==EXIT),facilityIndex=facilities.findIndex(x=>x.id===s.id);
      const controls=isExit?`<div class="lunch-detail">13:00 퇴장 집합${l.late?`<br>집합보다 ${l.late}분 늦음`:`<br>집합까지 ${l.wait}분 여유`}</div>`:isHall?`<div class="lunch-detail">${state.lunchTime?`${state.lunchTime} 집합`:'집합 시각 미정'} · 식사 ${state.mealMinutes===null?'시간 미정':`${state.mealMinutes}분`}${l.wait?`<br>집합까지 ${l.wait}분 대기`:''}${l.late?`<br>집합보다 ${l.late}분 늦음`:''}</div>`:`<div class="timing-grid"><label>대기시간<div class="queue-stepper"><button type="button" data-action="queue-minus" aria-label="${esc(nameOf(s.id))} 대기시간 5분 줄이기">−</button><input type="number" data-timing="queue" min="0" max="600" step="1" value="${s.queue||0}" inputmode="numeric" aria-label="${esc(nameOf(s.id))} 대기시간 분"><button type="button" data-action="queue-plus" aria-label="${esc(nameOf(s.id))} 대기시간 5분 늘리기">+</button></div></label><label>이용시간<div class="ride-time"><input type="number" data-timing="ride" min="0" max="120" step="1" value="${s.ride||0}" inputmode="numeric" aria-label="${esc(nameOf(s.id))} 이용시간 분"><span>분</span></div></label></div>`;
      return `<li class="route-stop" data-id="${s.id}"><div class="leg-info">↳ 약 ${l.minutes}분 · ${l.meters}m ${l.measured?'제공 거리':'추정'}</div><div class="stop-card ${isFixed?'lunch-stop':''}"><span class="stop-number">${isExit?'집':isHall?'식':i+1}</span><div class="stop-phase">${isExit?'퇴장 집합 · 마지막 방문지':isHall?'점심 집합 · 필수':i<hi?'점심 전':'점심 후'}</div><div class="stop-title"><h3>${esc(nameOf(s.id))}</h3>${isFixed?'':`<button class="remove-stop" data-action="remove" aria-label="${esc(nameOf(s.id))} 동선에서 삭제">×</button>`}</div><p class="arrival-label">${i>hi&&(!state.lunchTime||state.mealMinutes===null)?"점심 시각·식사시간 입력 후 계산":timeAt(l.arrival)+" 도착 예상"}</p><div class="stop-controls">${controls}${isFixed?'':timingSource(s.id)}${isFixed?'':`<div class="order-buttons"><button data-action="up" aria-label="${esc(nameOf(s.id))} 순서 앞으로" ${facilityIndex===0?'disabled':''}>↑</button><button data-action="down" aria-label="${esc(nameOf(s.id))} 순서 뒤로" ${facilityIndex===facilities.length-1?'disabled':''}>↓</button></div>`}</div></div></li>`;
    }).join('');
    $('returnInfo').hidden=!state.returnGate;
    if(state.returnGate){const l=latestPlan.legs.at(-1);$('returnInfo').textContent=`↩ 출입구 광장까지 약 ${l.minutes}분 · ${l.meters}m ${l.measured?'제공 거리':'추정'}${state.lunchTime&&state.mealMinutes!==null?` · ${timeAt(l.arrival)} 도착 예상`:''}`;}
    const out=[];
    for(const l of latestPlan.legs){const pts=l.points.map(p=>p.join(',')).join(' ');out.push(`<polyline points="${pts}" fill="none" stroke="white" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><polyline points="${pts}" fill="none" stroke="#ed6336" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow)"/>`);}
    for(const s of state.stops){const p=byId[s.id];out.push(`<line x1="${p.access[0]}" y1="${p.access[1]}" x2="${p.marker[0]}" y2="${p.marker[1]}" stroke="#172e43" stroke-width="3" stroke-dasharray="5 6" opacity=".6"/><circle cx="${p.access[0]}" cy="${p.access[1]}" r="6" fill="white" stroke="#ed6336" stroke-width="4"/>`);}
    $('routeLines').innerHTML=out.join('');
    saveState();
    const refs=activeReferences();$('calibrationStatus').textContent=`제공하신 ${refs.length}개 구간의 보행로 거리를 반영했어요.`;
    $('measurementList').innerHTML=refs.map((r,i)=>`<li><span>${i+1}. ${esc(nameOf(r.from))} → ${esc(nameOf(r.to))}</span><b>${r.meters}m</b></li>`).join('');
  }
  function setZoom(zoom,center){const v=$('mapViewport'),c=$('mapCanvas'),x=center?.[0]??(v.scrollLeft+v.clientWidth/2)/c.clientWidth,y=center?.[1]??(v.scrollTop+v.clientHeight/2)/c.clientHeight;state.zoom=Math.max(1,Math.min(5,zoom));c.style.width=`${state.zoom*100}%`;v.scrollLeft=Math.max(0,x*c.clientWidth-v.clientWidth/2);v.scrollTop=Math.max(0,y*c.clientHeight-v.clientHeight/2);$('zoomValue').textContent=Math.round(state.zoom*100)+'%';$('zoomOut').disabled=state.zoom<=1;$('zoomIn').disabled=state.zoom>=5;}
  $('categoryToggles').innerHTML=data.categories.map(c=>`<button type="button" data-category="${c.id}" style="--category-color:${c.color}" aria-pressed="${!!state.filters[c.id]}"><span class="category-dot"></span>${esc(c.name)} <small>${c.count}</small></button>`).join('');
  for(const b of document.querySelectorAll('[data-category]'))b.addEventListener('click',()=>{state.filters[b.dataset.category]=!state.filters[b.dataset.category];render();});
  $('mapPins').innerHTML=data.attractions.map(p=>`<button class="map-pin ${p.kind==='lunch'?'lunch-pin':''}" id="pin-${p.id}" style="left:${p.marker[0]/data.width*100}%;top:${p.marker[1]/data.height*100}%" data-poi="${p.id}" aria-pressed="false"><span>+</span><span class="pin-label">${esc(p.name)}</span></button>`).join('')+`<span class="map-pin gate" style="left:${1630/data.width*100}%;top:${750/data.height*100}%" aria-label="출발 지점 출입구 광장">S</span>`;
  $('facilityChips').innerHTML=data.attractions.map(p=>`<button class="facility-chip" id="chip-${p.id}" data-poi="${p.id}" aria-pressed="false"><span class="chip-symbol">+</span>${esc(p.name)}</button>`).join('');
  for(const c of[$('mapPins'),$('facilityChips')])c.addEventListener('click',e=>{const b=e.target.closest('[data-poi]');if(b)toggleStop(b.dataset.poi);});
  $('routeList').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const id=b.closest('[data-id]').dataset.id,i=state.stops.findIndex(s=>s.id===id);if(b.dataset.action==='remove'){toggleStop(id);return;}if(b.dataset.action.startsWith('queue-')){state.stops[i].queue=Math.max(0,Math.min(600,(state.stops[i].queue||0)+(b.dataset.action==='queue-plus'?5:-5)));render();return;}const facilities=state.stops.filter(s=>s.id!==HALL&&s.id!==EXIT),at=facilities.findIndex(s=>s.id===id),j=at+(b.dataset.action==='up'?-1:1);if(at<0||j<0||j>=facilities.length)return;[facilities[at],facilities[j]]=[facilities[j],facilities[at]];state.stops=facilities;render();const target=$('routeList').querySelector(`[data-id="${id}"] [data-action="${b.dataset.action}"]`);if(target&&!target.disabled)target.focus();toast('방문 순서와 이동시간을 바꿨어요');});
  $('routeList').addEventListener('change',e=>{if(!e.target.matches('input[data-timing]'))return;const input=e.target,s=state.stops.find(s=>s.id===input.closest('[data-id]').dataset.id),field=input.dataset.timing,n=Number(input.value),max=field==='queue'?600:120;if(input.value===''||!Number.isInteger(n)||n<0||n>max){input.reportValidity();input.value=s[field]||0;return;}s[field]=n;render();});
  $('clearRoute').addEventListener('click',()=>{state.stops=[{id:HALL,stay:40},{id:EXIT,stay:0}];render();toast('점심·퇴장 집합을 제외한 방문 동선을 초기화했어요');});
  $('pace').addEventListener('change',()=>{state.pace=Number($('pace').value);render();});
  $('startTime').addEventListener('change',()=>{if(/^\d{2}:\d{2}$/.test($('startTime').value)){state.start=$('startTime').value;render();}else $('startTime').value=state.start;});
  $('lunchTime').addEventListener('change',()=>{state.lunchTime=$('lunchTime').value;render();});
  $('mealDuration').addEventListener('change',()=>{const input=$('mealDuration'),n=Number(input.value);if(input.value===''){state.mealMinutes=null;}else if(Number.isInteger(n)&&n>=0&&n<=240){state.mealMinutes=n;}else{input.reportValidity();input.value=state.mealMinutes??'';return;}state.stops.find(s=>s.id===HALL).stay=state.mealMinutes||0;render();});
  $('baseMinutes').addEventListener('change',()=>{const n=Number($('baseMinutes').value);if(n>=1&&n<=30){state.baseMinutes=n;render();}else $('baseMinutes').value=state.baseMinutes;});
  $('returnGate').addEventListener('change',()=>{state.returnGate=$('returnGate').checked;render();});
  $('zoomIn').addEventListener('click',()=>setZoom(state.zoom+.25));$('zoomOut').addEventListener('click',()=>setZoom(state.zoom-.25));$('zoomFit').addEventListener('click',()=>setZoom(1,[.5,.5]));$('guideMap').addEventListener('error',()=>$('mapError').hidden=false);
  const options=[['gate','출입구 광장'],...data.attractions.map(p=>[p.id,p.name])].map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('');$('measureFrom').innerHTML=options;$('measureTo').innerHTML=options;$('measureTo').value='sky-tower';
  $('calibrationForm').addEventListener('submit',e=>{e.preventDefault();const from=$('measureFrom').value,to=$('measureTo').value,meters=Number($('measureMeters').value);if(from===to){$('calibrationFeedback').textContent='서로 다른 두 지점을 선택해 주세요.';return;}if(!Number.isFinite(meters)||meters<1||meters>10000){$('calibrationFeedback').textContent='1~10,000m 사이 거리를 입력해 주세요.';return;}const refs=activeReferences(),i=refs.findIndex(r=>(r.from===from&&r.to===to)||(r.to===from&&r.from===to));if(i>=0)refs[i]={from,to,meters};else refs.push({from,to,meters});state.measurements=refs;state.calibration=null;$('calibrationFeedback').textContent='거리 반영 완료. 아직 재지 않은 구간은 추정합니다.';render();toast('거리를 반영했어요');});
  $('resetCalibration').addEventListener('click',()=>{state.calibration=null;state.measurements=data.measuredSegments.map(r=>({...r}));$('measureMeters').value='';$('calibrationFeedback').textContent='처음 제공하신 6개 구간의 거리 기준으로 돌아왔어요.';render();});
  function readPlan(){return {stops:state.stops.map((s,i)=>({id:s.id,name:nameOf(s.id),walkingMinutes:latestPlan.legs[i].minutes,meters:latestPlan.legs[i].meters,measured:latestPlan.legs[i].measured,arrival:timeAt(latestPlan.legs[i].arrival),queueMinutes:s.queue||0,rideMinutes:s.ride||0,stayMinutes:s.stay})),walkingMinutes:latestPlan.walk,totalMinutes:latestPlan.total,lunchTime:state.lunchTime||null,mealMinutes:state.mealMinutes,finish:state.lunchTime&&state.mealMinutes!==null?timeAt(latestPlan.total):null,estimateOnly:true};}
  function registerTools(){
    if(!document.modelContext?.registerTool)return;const controller=new AbortController();
    const list=[{name:'read_robotland_plan',title:'로봇랜드 동선 읽기',description:'현재 방문 순서, 점심 집합과 계획용 예상 이동시간을 확인합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>readPlan()},{name:'set_robotland_stops',title:'로봇랜드 방문 순서 변경',description:'시설 ID 목록으로 동선을 교체합니다. lunch-hall이 없으면 필수 점심 장소로 마지막에 추가합니다. 실제 예약은 하지 않습니다.',inputSchema:{type:'object',properties:{ids:{type:'array',items:{type:'string',enum:Object.keys(byId)},uniqueItems:true,maxItems:data.attractions.length}},required:['ids'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='ids')||!Array.isArray(input.ids)||input.ids.length>data.attractions.length||input.ids.some(id=>!Object.hasOwn(byId,id))||new Set(input.ids).size!==input.ids.length)throw new Error('유효한 시설 ID를 중복 없이 입력해 주세요.');const ids=input.ids.includes(HALL)?input.ids:[...input.ids,HALL];state.stops=ids.map(id=>({id,queue:state.stops.find(s=>s.id===id)?.queue??defaultQueue(id),ride:state.stops.find(s=>s.id===id)?.ride??defaultRide(id),stay:id===HALL?state.mealMinutes||0:0}));render();return readPlan();}}];
    for(const tool of list){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:controller.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>controller.abort(),{once:true});
  }

  function restoreState(){
    try{
      const saved=JSON.parse(localStorage.getItem(storageKey())||'null');if(!saved||saved.version!==1)return;
      const validTime=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
      if(validTime(saved.start))state.start=saved.start;if(validTime(saved.lunchTime)||saved.lunchTime==='')state.lunchTime=saved.lunchTime;
      if([1,1.35,.8].includes(saved.pace))state.pace=saved.pace;
      if(saved.mealMinutes===null||(Number.isInteger(saved.mealMinutes)&&saved.mealMinutes>=0&&saved.mealMinutes<=240))state.mealMinutes=saved.mealMinutes;
      if(saved.filters)for(const k of Object.keys(state.filters))if(typeof saved.filters[k]==='boolean')state.filters[k]=saved.filters[k];state.returnGate=saved.returnGate===true;
      if(Array.isArray(saved.stops)&&saved.stops.length<=data.attractions.length){const seen=new Set();const stops=[];for(const s of saved.stops){if(!s||!Object.hasOwn(byId,s.id)||seen.has(s.id))continue;seen.add(s.id);stops.push({id:s.id,queue:Number.isInteger(s.queue)&&s.queue>=0&&s.queue<=600?s.queue:defaultQueue(s.id),ride:Number.isInteger(s.ride)&&s.ride>=0&&s.ride<=120?s.ride:defaultRide(s.id),stay:0});}if(!seen.has(HALL))stops.push({id:HALL,stay:0});state.stops=stops;}
      const point=id=>id==='gate'||Object.hasOwn(byId,id);
      if(Array.isArray(saved.measurements)&&saved.measurements.length<=200){const refs=saved.measurements.filter(r=>r&&point(r.from)&&point(r.to)&&r.from!==r.to&&Number.isFinite(r.meters)&&r.meters>=1&&r.meters<=10000);if(refs.length)state.measurements=refs;}
    }catch{}
  }
  function saveState(){
    try{localStorage.setItem(storageKey(),JSON.stringify({version:1,filters:state.filters,start:state.start,lunchTime:state.lunchTime,mealMinutes:state.mealMinutes,pace:state.pace,autoLunch:true,exitTime:'13:00',returnGate:state.returnGate,stops:state.stops,measurements:state.measurements}));$('saveStatus').textContent='이 기기에 자동 저장';window.dispatchEvent(new CustomEvent('robotland-plan-changed',{detail:{scope:planScope,groupId:activeGroup?.id}}));}catch{$('saveStatus').textContent='저장 불가 · 화면을 유지해 주세요';}
  }
  function setView(view){document.body.dataset.view=view;for(const b of document.querySelectorAll('[data-mobile-view]'))b.setAttribute('aria-selected',String(b.dataset.mobileView===view));}
  for(const button of document.querySelectorAll('[data-mobile-view]'))button.addEventListener('click',()=>setView(button.dataset.mobileView));
  $('mapExtrasToggle').addEventListener('click',()=>{const open=$('mapCard').classList.toggle('extras-open');$('mapExtrasToggle').setAttribute('aria-expanded',String(open));});
  $('mapExtrasClose').addEventListener('click',()=>{$('mapCard').classList.remove('extras-open');$('mapExtrasToggle').setAttribute('aria-expanded','false');});
  $('startTime').value=state.start;$('lunchTime').value=state.lunchTime;$('mealDuration').value=state.mealMinutes??'';$('pace').value=String(state.pace);$('returnGate').checked=state.returnGate;
  const vp=$('mapViewport'),pointers=new Map();let previous=null,pinch=null;
  vp.addEventListener('dragstart',e=>e.preventDefault());vp.addEventListener('selectstart',e=>e.preventDefault());for(const node of vp.querySelectorAll('img,button'))node.draggable=false;
  function touchState(){const all=[...pointers.values()];if(all.length===1){previous=all[0];pinch=null;}else if(all.length===2){pinch={distance:Math.hypot(all[0].x-all[1].x,all[0].y-all[1].y),zoom:state.zoom};previous=null;}else{previous=null;pinch=null;}}
  vp.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});vp.setPointerCapture(e.pointerId);touchState();});
  vp.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const current={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,current);if(pointers.size===1&&previous){vp.scrollLeft-=current.x-previous.x;vp.scrollTop-=current.y-previous.y;previous=current;}else if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()],box=vp.getBoundingClientRect(),cx=(a.x+b.x)/2-box.left,cy=(a.y+b.y)/2-box.top,canvas=$('mapCanvas'),u=(vp.scrollLeft+cx)/canvas.clientWidth,v=(vp.scrollTop+cy)/canvas.clientHeight;setZoom(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance);vp.scrollLeft=u*canvas.clientWidth-cx;vp.scrollTop=v*canvas.clientHeight-cy;}});
  for(const ev of['pointerup','pointercancel','lostpointercapture'])vp.addEventListener(ev,e=>{pointers.delete(e.pointerId);touchState();});
  function connection(){const offline=!navigator.onLine;$('connectionStatus').textContent=offline?'오프라인':'현장 플래너';$('connectionStatus').classList.toggle('offline',offline);}connection();window.addEventListener('online',connection);window.addEventListener('offline',connection);
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>$('offlineStatus').textContent='한 번 열어두면 인터넷 없이도 지도·계획 사용 가능').catch(()=>$('offlineStatus').textContent='오프라인 지도를 준비하지 못했어요. 연결을 유지해 주세요.');
  let previousClass=null;
  function syncInputs(){normalizeStops(); $('startTime').value=state.start;$('lunchTime').value=state.lunchTime;$('mealDuration').value=state.mealMinutes??'';$('pace').value=String(state.pace);$('returnGate').checked=state.returnGate; }
  window.addEventListener('robotland-session-changed',event=>{const next=event.detail?.classId||null;planScope='personal';activeGroup=null;if(previousClass&&previousClass!==next)Object.assign(state,JSON.parse(JSON.stringify(defaults)));renderScope();previousClass=next;restoreState();syncInputs();render();});
  function renderScope(){ $('personalScope').setAttribute('aria-pressed',String(planScope==='personal'));$('groupScope').setAttribute('aria-pressed',String(planScope==='group'));$('planScopeLabel').textContent=planScope==='group'?(activeGroup.name+' · 이 기기의 수정본'):'이 휴대폰의 개인 계획';$('groupPlanTools').hidden=planScope!=='group'; }
  $('personalScope').addEventListener('click',()=>window.RobotlandPlan.setScope('personal'));
  window.RobotlandPlan={getScope:()=>({mode:planScope,group:activeGroup}),setScope:(mode,group=null,remotePlan=null)=>{saveState();planScope=mode==='group'&&group?'group':'personal';activeGroup=planScope==='group'?group:null;Object.assign(state,JSON.parse(JSON.stringify(defaults)));if(remotePlan)localStorage.setItem(storageKey(),JSON.stringify(remotePlan));restoreState();syncInputs();renderScope();render();},snapshot:()=>JSON.parse(localStorage.getItem(storageKey())||'null'),restore:plan=>{if(!plan||plan.version!==1||!Array.isArray(plan.stops))throw new Error('올바른 계획 백업이 아닙니다.');localStorage.setItem(storageKey(),JSON.stringify(plan));restoreState();syncInputs();render();}};
  setView('map');
  function initialZoom(){const portrait=innerHeight>innerWidth;setZoom(portrait?Math.max(1.5,vp.clientHeight/(vp.clientWidth*(1123/2304))):1,[.55,.5]);}
  let wasPortrait=innerHeight>innerWidth;window.addEventListener('resize',()=>{const portrait=innerHeight>innerWidth;if(wasPortrait!==portrait){wasPortrait=portrait;requestAnimationFrame(initialZoom);}});
  render();requestAnimationFrame(initialZoom);registerTools();
})();
