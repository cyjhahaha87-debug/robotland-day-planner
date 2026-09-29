(() => {
  'use strict'; const T = window.RobotlandI18n.text;
  const $ = id => document.getElementById(id), bridge = window.RobotlandClassroom;
  const map = window.MAP_DATA, viewport = $('mapViewport'), canvas = $('mapCanvas');
  const palette = ['#176c9b', '#9b3e73', '#4e741f', '#9a501d', '#5c50a8', '#087b74'];
  let user = bridge.user, groups = [], members = [], mine = null, supported = false, memberSupported = false;
  let visible = true, choosing = false, kind = 'member', draft = null, selected = null, saving = false, epoch = 0;
  const gestures = new Map();
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const age = p => Math.max(0, Math.floor((Date.now() - p.updatedAt) / 60000));
  const ageLabel = p => age(p) === 0 ? T("방금") : age(p) + T("분 전");
  const timeLabel = p => new Date(p.updatedAt).toLocaleTimeString(window.RobotlandI18n.locale, {hour:'2-digit', minute:'2-digit', hour12:false});
  const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= map.width && p.y >= 0 && p.y <= map.height && Number.isFinite(p.updatedAt) && age(p) < 1440;
  const teacherName = name => T("⟦0⟧ 선생님", [name]);
  function nearest(p) {
    const place = map.attractions.reduce((best, next) => Math.hypot(next.marker[0] - p.x, next.marker[1] - p.y) < Math.hypot(best.marker[0] - p.x, best.marker[1] - p.y) ? next : best);
    return place.name + T(" 근처");
  }
  function color(id) { return palette[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length]; }
  let feedbackTimer;
  function feedback(text) { clearTimeout(feedbackTimer);$('pingFeedback').textContent = text;if(text)feedbackTimer=setTimeout(()=>{$('pingFeedback').textContent='';},5000); }
  function canPlace(type = kind) { return !!user && !user.staffOnly && navigator.onLine && !saving && (type === 'member' ? memberSupported : supported && !!mine); }
  function pins() {
    return groups.map(g => ({...g, key:'g:'+g.id, kind:'group', own:g.id === mine?.id, badge:T("조"), color:color(g.id)}))
      .concat(members.map(p => ({...p, name:p.role === 'teacher' ? teacherName(p.name) : p.name, key:'m:'+p.id, kind:'member', own:p.mine, badge:p.role === 'teacher' ? T("교사") : T("개인"), color:p.role === 'teacher' ? '#a54814' : '#087b74'})))
      .filter(p => valid(p.location));
  }
  function stopChoosing() { choosing = false; draft = null; gestures.clear(); viewport.classList.remove('picking-location'); render(); }
  function render() {
    $('placeGroupPing').disabled = !canPlace('group');
    $('placeMemberPing').disabled = !canPlace('member');
    $('placeGroupPing').textContent = choosing && kind === 'group' ? T("위치 선택 중") : T("우리 조 위치 찍기");
    $('placeMemberPing').textContent = choosing && kind === 'member' ? T("위치 선택 중") : user?.role === 'teacher' ? T("교사 위치 찍기") : T("내 위치 찍기");
    $('placeGroupPing').setAttribute('aria-pressed', String(choosing && kind === 'group'));
    $('placeMemberPing').setAttribute('aria-pressed', String(choosing && kind === 'member'));
    $('toggleGroupPings').disabled = !user || user.staffOnly;
    $('toggleGroupPings').setAttribute('aria-pressed', String(visible));
    $('locationHint').textContent = !user || user.staffOnly ? T("반에 입장하면 개인 위치를 공유할 수 있어요.") :
      !navigator.onLine ? T("오프라인 · 마지막으로 받은 위치입니다.") :
      !memberSupported ? T("개인 위치 공유는 저장소 업데이트 후 사용할 수 있어요.") :
      user.role === 'teacher' ? T("교사 위치: 같은 반 전체") :
      !mine ? T("개인 위치: 본인·같은 반 교사") :
      T("개인 위치: 같은 조·교사 / 조 위치: 같은 반 전체");
    const list = pins();
    $('groupLocationPins').hidden = !visible || !user || user.staffOnly;
    $('groupLocationPins').innerHTML = list.map(p => `<button type="button" class="group-location-pin ${p.own ? 'my-location' : ''} ${p.kind === 'member' ? 'member-location-pin' : ''} ${age(p.location) >= 10 ? 'old-location' : ''}" data-location-key="${esc(p.key)}" ${p.kind === 'group' ? 'data-group-location' : 'data-member-location'}="${esc(p.id)}" style="left:${p.location.x / map.width * 100}%;top:${p.location.y / map.height * 100}%;--pin-color:${p.color}" aria-label="${esc(T("⟦0⟧ · ⟦1⟧ · ⟦2⟧", [p.name, p.badge, ageLabel(p.location)]))}" draggable="false"><span class="location-dot">${esc(p.badge)}</span><span class="location-label">${esc(p.name)}<small>${esc(timeLabel(p.location))} · ${esc(ageLabel(p.location))}${age(p.location) >= 10 ? esc(T(" · 오래됨")) : ''}</small></span></button>`).join('');
    $('pingConfirm').hidden = !choosing;
    $('confirmGroupPing').disabled = !draft || !canPlace();
    $('confirmGroupPing').textContent = saving ? T("공유 중…") : T("여기에 표시");
    $('cancelGroupPing').disabled = saving;
    const name = kind === 'group' ? mine?.name : user?.role === 'teacher' ? teacherName(user.nickname) : user?.nickname;
    $('pingCandidateLabel').textContent = draft ? name + ' · ' + nearest(draft) + T("에 표시할까요?") : T("지도에서 지금 있는 곳을 짧게 눌러주세요. 확대·이동도 가능합니다.");
    $('locationDraft').hidden = !choosing || !draft;
    if (draft) { $('locationDraft').style.left = draft.x / map.width * 100 + '%'; $('locationDraft').style.top = draft.y / map.height * 100 + '%'; }
    const pin = list.find(p => p.key === selected);
    $('pingDetails').hidden = choosing || !pin;
    if (pin) {
      $('pingDetailText').textContent = T("⟦0⟧ · ⟦1⟧\n⟦2⟧ (⟦3⟧) · ⟦4⟧ 표시⟦5⟧", [pin.name, nearest(pin.location), timeLabel(pin.location), ageLabel(pin.location), pin.location.updatedBy, age(pin.location) >= 10 ? T("\n10분 이상 지난 위치예요. 지금 위치와 다를 수 있습니다.") : '']);
      $('clearGroupPing').hidden = !(pin.own || (pin.kind === 'group' && user?.role === 'teacher'));
      $('clearGroupPing').disabled = saving || !navigator.onLine;
    }
  }
  function chooseAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(), x = (clientX - rect.left) / rect.width * map.width, y = (clientY - rect.top) / rect.height * map.height;
    if (x < 0 || y < 0 || x > map.width || y > map.height) return;
    draft = {x:Math.round(x), y:Math.round(y)}; feedback(''); render();
  }
  function start(type) {
    if (!canPlace(type)) return;
    kind = type; choosing = true; draft = null; selected = null; visible = true;
    viewport.classList.add('picking-location'); feedback(''); render();
  }
  $('placeGroupPing').addEventListener('click', () => start('group'));
  $('placeMemberPing').addEventListener('click', () => start('member'));
  $('cancelGroupPing').addEventListener('click', stopChoosing);
  $('toggleGroupPings').addEventListener('click', () => { visible = !visible; render(); });
  viewport.addEventListener('pointerdown', e => {
    if (!choosing) return;
    if (gestures.size) for (const gesture of gestures.values()) gesture.multi = true;
    gestures.set(e.pointerId, {x:e.clientX, y:e.clientY, moved:false, multi:gestures.size > 0});
  }, true);
  viewport.addEventListener('pointermove', e => { const gesture = gestures.get(e.pointerId); if (gesture && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 8) gesture.moved = true; }, true);
  viewport.addEventListener('pointerup', e => { const gesture = gestures.get(e.pointerId); gestures.delete(e.pointerId); if (choosing && gesture && !gesture.moved && !gesture.multi) chooseAt(e.clientX, e.clientY); }, true);
  viewport.addEventListener('pointercancel', e => gestures.delete(e.pointerId), true);
  viewport.addEventListener('click', e => { if (choosing) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  viewport.addEventListener('keydown', e => { if (!choosing || e.key !== 'Enter') return; const rect = viewport.getBoundingClientRect(); chooseAt(rect.left + rect.width / 2, rect.top + rect.height / 2); e.preventDefault(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !saving) { stopChoosing(); selected = null; render(); } });
  $('confirmGroupPing').addEventListener('click', async () => {
    if (!canPlace() || !draft) return;
    const requestEpoch = epoch, type = kind, groupId = mine?.id, point = {...draft}; saving = true; render();
    try {
      const result = await bridge.api(type === 'member' ? 'member-location' : 'group-location', type === 'member' ? point : {groupId, ...point});
      if (requestEpoch !== epoch) return;
      window.RobotlandGroups.apply(result); stopChoosing();
      selected = null;
      feedback(type === 'group' ? T("우리 조 위치를 같은 반에 공유했어요.") : user.role === 'teacher' ? T("교사 위치를 같은 반에 공유했어요.") : mine ? T("내 위치를 같은 조와 교사에게 공유했어요.") : T("내 위치를 같은 반 교사에게 공유했어요."));
    } catch (error) {
      if (requestEpoch !== epoch) return;
      feedback(error.status === 404 ? T("위치 저장소 업데이트가 필요해요. 선생님께 알려주세요.") : T("표시하지 못했어요. ") + error.message);
      if (error.status === 403) window.RobotlandGroups.refresh();
    } finally { if (requestEpoch === epoch) { saving = false; render(); } }
  });
  function focusPin(key, center) {
    const pin = pins().find(p => p.key === key); if (!pin) return;
    selected = key; visible = true; stopChoosing();
    document.querySelector('.mobile-nav [data-mobile-view="map"]').click();
    if (center) requestAnimationFrame(() => viewport.scrollTo({left:pin.location.x / map.width * canvas.clientWidth - viewport.clientWidth / 2, top:pin.location.y / map.height * canvas.clientHeight - viewport.clientHeight / 2}));
    render();
  }
  $('groupLocationPins').addEventListener('click', e => { const pin = e.target.closest('[data-location-key]'); if (pin) focusPin(pin.dataset.locationKey, false); });
  document.addEventListener('click', e => { const button = e.target.closest('[data-focus-location]'); if (button) focusPin('g:'+button.dataset.focusLocation, true); });
  $('closePingDetails').addEventListener('click', () => { selected = null; render(); });
  $('clearGroupPing').addEventListener('click', async () => {
    const pin = pins().find(p => p.key === selected);
    if (!pin || saving || !navigator.onLine || !(pin.own || (pin.kind === 'group' && user?.role === 'teacher'))) return;
    const requestEpoch = epoch; saving = true; render();
    try {
      const result = await bridge.api(pin.kind === 'member' ? 'member-location/clear' : 'group-location/clear', pin.kind === 'member' ? {} : {groupId:pin.id});
      if (requestEpoch !== epoch) return;
      window.RobotlandGroups.apply(result); selected = null; feedback(T("위치 표시를 지웠어요."));
    } catch (error) { if (requestEpoch === epoch) feedback(error.message); }
    finally { if (requestEpoch === epoch) { saving = false; render(); } }
  });
  window.addEventListener('robotland-groups-changed', e => {
    const old = mine?.id; user = e.detail.user; groups = e.detail.groups; members = e.detail.memberLocations || []; mine = e.detail.myGroup;
    supported = !!e.detail.locationsSupported; memberSupported = !!e.detail.memberLocationsSupported;
    if (old !== mine?.id) { epoch++; saving = false; stopChoosing(); }
    render();
  });
  window.addEventListener('robotland-session-changed', e => { epoch++; user = e.detail; groups = []; members = []; mine = null; supported = memberSupported = false; selected = null; saving = false; stopChoosing(); feedback(''); });
  window.addEventListener('offline', render);
  window.addEventListener('online', () => { render(); if (user) window.RobotlandGroups.refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); if (user) window.RobotlandGroups.refresh(); } });
  setInterval(() => { if (!document.hidden) render(); }, 60000);
  render();
})();
