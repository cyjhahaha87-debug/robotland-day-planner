(() => {
  'use strict';const T=window.RobotlandI18n.text;
  const $ = id => document.getElementById(id), bridge = window.RobotlandClassroom;
  const map = window.MAP_DATA, viewport = $('mapViewport'), canvas = $('mapCanvas');
  const palette = ['#176c9b', '#9b3e73', '#4e741f', '#9a501d', '#5c50a8', '#087b74'];
  let user = bridge.user, groups = [], mine = null, supported = false;
  let visible = true, choosing = false, draft = null, selected = null, saving = false, epoch = 0;
  const gestures = new Map();
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const age = p => Math.max(0, Math.floor((Date.now() - p.updatedAt) / 60000));
  const ageLabel = p => age(p) === 0 ? T("방금") : age(p) + T("분 전");
  const timeLabel = p => new Date(p.updatedAt).toLocaleTimeString(window.RobotlandI18n.locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= map.width && p.y >= 0 && p.y <= map.height && Number.isFinite(p.updatedAt) && age(p) < 1440;
  function nearest(p) {
    const place = map.attractions.reduce((best, next) => Math.hypot(next.marker[0] - p.x, next.marker[1] - p.y) < Math.hypot(best.marker[0] - p.x, best.marker[1] - p.y) ? next : best);
    return place.name + T(" 근처");
  }
  function color(id) { return palette[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length]; }
  function feedback(text) { $('pingFeedback').textContent = text; }
  function canPlace() { return !!user && !!mine && supported && navigator.onLine && !saving; }
  function stopChoosing() {
    choosing = false; draft = null; gestures.clear(); viewport.classList.remove('picking-location'); render();
  }
  function render() {
    $('placeGroupPing').disabled = !canPlace();
    $('placeGroupPing').textContent = choosing ? T("위치 선택 중") : T("우리 조 위치 찍기");
    $('placeGroupPing').setAttribute('aria-pressed', String(choosing));
    $('toggleGroupPings').disabled = !user;
    $('toggleGroupPings').setAttribute('aria-pressed', String(visible));
    $('locationHint').textContent = !user ? T("반 입장 후 조에 가입하면 위치를 공유할 수 있어요.") :
      !navigator.onLine ? T("오프라인 · 마지막으로 받은 위치입니다.") :
      !supported ? T("조 위치 공유를 준비하고 있어요.") :
      !mine ? T("같은 반의 조 위치를 볼 수 있어요. 조에 가입하면 내 위치를 찍을 수 있습니다.") :
      mine.name + T(" · 지도에서 직접 표시 · 20초마다 갱신");
    const pins = groups.filter(g => valid(g.location));
    $('groupLocationPins').hidden = !visible || !user;
    $('groupLocationPins').innerHTML = pins.map(g => T("<button type=\"button\" class=\"group-location-pin ⟦0⟧ ⟦1⟧\" data-group-location=\"⟦2⟧\" style=\"left:⟦3⟧%;top:⟦4⟧%;--pin-color:⟦5⟧\" aria-label=\"⟦6⟧ 위치, ⟦7⟧, ⟦8⟧\" draggable=\"false\"><span class=\"location-dot\">조</span><span class=\"location-label\">⟦9⟧<small>⟦10⟧ · ⟦11⟧⟦12⟧</small></span></button>",[g.id === mine?.id ? 'my-location' : '',age(g.location) >= 10 ? 'old-location' : '',esc(g.id),g.location.x / map.width * 100,g.location.y / map.height * 100,color(g.id),esc(g.name),esc(nearest(g.location)),ageLabel(g.location),esc(g.name),timeLabel(g.location),ageLabel(g.location),age(g.location) >= 10 ? T(" · 오래됨") : ''])).join('');
    $('pingConfirm').hidden = !choosing;
    $('confirmGroupPing').disabled = !draft || !canPlace();
    $('confirmGroupPing').textContent = saving ? T("공유 중…") : T("여기에 표시");
    $('cancelGroupPing').disabled = saving;
    $('pingCandidateLabel').textContent = draft ? mine.name + ' · ' + nearest(draft) + T("에 표시할까요?") : T("지도에서 지금 있는 곳을 짧게 눌러주세요. 확대·이동도 가능합니다.");
    $('locationDraft').hidden = !choosing || !draft;
    if (draft) { $('locationDraft').style.left = draft.x / map.width * 100 + '%'; $('locationDraft').style.top = draft.y / map.height * 100 + '%'; }
    const group = groups.find(g => g.id === selected && valid(g.location));
    $('pingDetails').hidden = choosing || !group;
    if (group) {
      $('pingDetailText').textContent = T("⟦0⟧ · ⟦1⟧\n⟦2⟧ (⟦3⟧) · ⟦4⟧ 표시⟦5⟧",[group.name,nearest(group.location),timeLabel(group.location),ageLabel(group.location),group.location.updatedBy,age(group.location) >= 10 ? T("\n10분 이상 지난 위치예요. 지금 위치와 다를 수 있습니다.") : '']);
      $('clearGroupPing').hidden = !(mine?.id === group.id || user?.role === 'teacher');
      $('clearGroupPing').disabled = saving || !navigator.onLine;
    }
  }
  function chooseAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(), x = (clientX - rect.left) / rect.width * map.width, y = (clientY - rect.top) / rect.height * map.height;
    if (x < 0 || y < 0 || x > map.width || y > map.height) return;
    draft = { x: Math.round(x), y: Math.round(y) }; feedback(''); render();
  }
  $('placeGroupPing').addEventListener('click', () => {
    if (!canPlace()) return;
    choosing = true; draft = null; selected = null; visible = true;
    viewport.classList.add('picking-location'); feedback(''); render();
  });
  $('cancelGroupPing').addEventListener('click', stopChoosing);
  $('toggleGroupPings').addEventListener('click', () => { visible = !visible; render(); });
  viewport.addEventListener('pointerdown', e => {
    if (!choosing) return;
    if (gestures.size) for (const gesture of gestures.values()) gesture.multi = true;
    gestures.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false, multi: gestures.size > 0 });
  }, true);
  viewport.addEventListener('pointermove', e => {
    const gesture = gestures.get(e.pointerId);
    if (gesture && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 8) gesture.moved = true;
  }, true);
  viewport.addEventListener('pointerup', e => {
    const gesture = gestures.get(e.pointerId); gestures.delete(e.pointerId);
    if (choosing && gesture && !gesture.moved && !gesture.multi) chooseAt(e.clientX, e.clientY);
  }, true);
  viewport.addEventListener('pointercancel', e => gestures.delete(e.pointerId), true);
  viewport.addEventListener('click', e => { if (choosing) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  viewport.addEventListener('keydown', e => {
    if (!choosing || e.key !== 'Enter') return;
    const rect = viewport.getBoundingClientRect(); chooseAt(rect.left + rect.width / 2, rect.top + rect.height / 2); e.preventDefault();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !saving) { stopChoosing(); selected = null; render(); } });
  $('confirmGroupPing').addEventListener('click', async () => {
    if (!canPlace() || !draft) return;
    const requestEpoch = epoch, groupId = mine.id, point = { ...draft }; saving = true; render();
    try {
      const result = await bridge.api('group-location', { groupId, ...point });
      if (requestEpoch !== epoch) return;
      window.RobotlandGroups.apply(result); stopChoosing(); selected = groupId;
      feedback(T("우리 조 위치를 같은 반에 공유했어요."));
    } catch (error) {
      feedback(error.status === 404 ? T("위치 저장소 업데이트가 필요해요. 선생님께 알려주세요.") : T("표시하지 못했어요. ") + error.message);
      if (error.status === 403) window.RobotlandGroups.refresh();
    } finally { saving = false; render(); }
  });
  function focusGroup(id, center) {
    const group = groups.find(g => g.id === id && valid(g.location)); if (!group) return;
    selected = id; visible = true; stopChoosing();
    document.querySelector('.mobile-nav [data-mobile-view="map"]').click();
    if (center) requestAnimationFrame(() => viewport.scrollTo({ left: group.location.x / map.width * canvas.clientWidth - viewport.clientWidth / 2, top: group.location.y / map.height * canvas.clientHeight - viewport.clientHeight / 2 }));
    render();
  }
  $('groupLocationPins').addEventListener('click', e => { const pin = e.target.closest('[data-group-location]'); if (pin) focusGroup(pin.dataset.groupLocation, false); });
  document.addEventListener('click', e => { const button = e.target.closest('[data-focus-location]'); if (button) focusGroup(button.dataset.focusLocation, true); });
  $('closePingDetails').addEventListener('click', () => { selected = null; render(); });
  $('clearGroupPing').addEventListener('click', async () => {
    if (!selected || saving || !navigator.onLine) return;
    const requestEpoch = epoch, groupId = selected; saving = true; render();
    try {
      const result = await bridge.api('group-location/clear', { groupId });
      if (requestEpoch !== epoch) return;
      window.RobotlandGroups.apply(result); selected = null; feedback(T("위치 표시를 지웠어요."));
    } catch (error) { feedback(error.message); }
    finally { saving = false; render(); }
  });
  window.addEventListener('robotland-groups-changed', e => {
    const old = mine?.id; user = e.detail.user; groups = e.detail.groups; mine = e.detail.myGroup; supported = !!e.detail.locationsSupported;
    if (old !== mine?.id) { epoch++; stopChoosing(); }
    render();
  });
  window.addEventListener('robotland-session-changed', e => {
    epoch++; user = e.detail; groups = []; mine = null; supported = false; selected = null; saving = false; stopChoosing(); feedback('');
  });
  window.addEventListener('offline', render);
  window.addEventListener('online', () => { render(); if (user) window.RobotlandGroups.refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); if (user) window.RobotlandGroups.refresh(); } });
  setInterval(() => { if (!document.hidden) render(); }, 60000);
  render();
})();
