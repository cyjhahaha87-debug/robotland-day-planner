(() => {
  'use strict';
  const $ = id => document.getElementById(id), bridge = window.RobotlandClassroom;
  const appUrl = 'https://robotland-trip.netlify.app/';
  const dialog = $('shareDialog'), nativeButton = $('shareApp');
  let activeUrl = appUrl, mode = 'app', sharing = false, historyEntry = false, generation = 0, groupKey = '';
  const invites = new Map();
  nativeButton.hidden = typeof navigator.share !== 'function';
  function currentGroup() { return bridge.user && !bridge.user.staffOnly ? window.RobotlandGroups?.myGroup : null; }
  function key() { return currentGroup() ? bridge.user.classId + ':' + currentGroup().id + ':' + bridge.user.deviceId : ''; }
  function ready(value) {
    activeUrl = value; $('shareAppUrl').value = value;
    $('copyAppUrl').disabled = !value; nativeButton.disabled = !value || sharing;
    $('saveShareQr').hidden = !value; $('appShareQr').hidden = !value;
  }
  function markMode(next) {
    mode = next; $('shareModeApp').setAttribute('aria-pressed', String(next === 'app'));
    $('shareModeGroup').setAttribute('aria-pressed', String(next === 'group'));
    $('shareExpiry').hidden = true; $('shareFeedback').textContent = '';
    $('shareDialog').setAttribute('aria-busy', 'false');
  }
  function showApp() {
    generation++; markMode('app'); ready(appUrl);
    $('appShareQr').src = 'app-qr.png'; $('appShareQr').alt = '로봇랜드 앱 주소 QR코드';
    $('saveShareQr').href = 'app-qr.png'; $('saveShareQr').download = '로봇랜드-접속-QR.png';
    $('shareDescription').textContent = '친구의 카메라로 QR코드를 비춰주세요. 앱을 열고 받은 반 코드로 입장하면 됩니다.' + (currentGroup() ? '' : ' 조에 입장하면 우리 조 초대 QR도 만들 수 있어요.');
    document.querySelector('label[for="shareAppUrl"]').textContent = '앱 주소';
  }
  function qrImage(url) {
    const qr = window.qrcode(0, 'Q'); qr.addData(url, 'Byte'); qr.make();
    const border = 6, scale = 16, size = qr.getModuleCount(), canvas = document.createElement('canvas');
    canvas.width = canvas.height = (size + border * 2) * scale;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#142c3c';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.isDark(y, x)) ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
    return canvas.toDataURL('image/png');
  }
  async function showGroup() {
    const group = currentGroup(), requestedKey = key(); if (!group) return;
    const requestGeneration = ++generation; markMode('group'); ready('');
    $('shareDescription').textContent = '우리 조 초대 QR을 만들고 있어요…';
    $('shareDialog').setAttribute('aria-busy', 'true');
    document.querySelector('label[for="shareAppUrl"]').textContent = '반·조 초대 주소';
    try {
      let result = invites.get(requestedKey);
      if (!result || result.expiresAt <= Date.now() + 60000) {
        result = await bridge.api('invites/create', { groupId: group.id });
        if (requestGeneration !== generation || requestedKey !== key()) return;
        invites.set(requestedKey, result);
      }
      if (requestGeneration !== generation || requestedKey !== key()) return;
      const url = appUrl + '#join=' + result.inviteToken, image = qrImage(url);
      $('appShareQr').src = image; $('appShareQr').alt = result.className + ' · ' + result.groupName + ' 초대 QR코드';
      $('saveShareQr').href = image; $('saveShareQr').download = '로봇랜드-우리조-초대QR.png';
      $('shareDescription').textContent = result.className + ' · ' + result.groupName + '\n친구가 QR을 찍고 자기 이름을 입력하면 이 반과 조에 함께 입장해요.';
      $('shareExpiry').textContent = new Date(result.expiresAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + '까지 유효 · 우리 반 친구에게 공유해 주세요.';
      $('shareExpiry').hidden = false; ready(url);
    } catch (error) {
      if (requestGeneration !== generation || requestedKey !== key()) return;
      $('shareDescription').textContent = '조 초대 QR을 만들지 못했어요.';
      $('shareFeedback').textContent = error.status === 404 ? '조 초대를 사용하려면 선생님이 Apps Script를 최신 버전으로 배포해야 해요. 앱 주소 QR은 지금 공유할 수 있어요.' : error.message;
    } finally { if (requestGeneration === generation) $('shareDialog').setAttribute('aria-busy', 'false'); }
  }
  function syncGroup() {
    const next = key(); $('shareModeGroup').disabled = !next;
    if (next !== groupKey) { groupKey = next; invites.clear(); showApp(); }
  }
  window.addEventListener('robotland-groups-changed', syncGroup);
  window.addEventListener('robotland-session-changed', () => { groupKey = ''; invites.clear(); $('shareModeGroup').disabled = true; showApp(); });
  $('shareModeApp').addEventListener('click', showApp); $('shareModeGroup').addEventListener('click', showGroup);
  $('openShare').addEventListener('click', () => {
    if (dialog.open) return; syncGroup(); if (mode === 'group') showGroup();
    $('shareFeedback').textContent = ''; dialog.showModal(); $('openShare').setAttribute('aria-expanded', 'true');
    history.pushState({ ...history.state, robotlandShare: true }, ''); historyEntry = true;
  });
  function close() { if (dialog.open) dialog.close(); }
  $('closeShare').addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return; const rect = dialog.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close();
  });
  dialog.addEventListener('close', () => {
    generation++; $('openShare').setAttribute('aria-expanded', 'false');
    if (historyEntry && history.state?.robotlandShare) { historyEntry = false; history.back(); } else historyEntry = false;
    if (!activeUrl) showApp(); $('openShare').focus();
  });
  window.addEventListener('popstate', () => { historyEntry = false; close(); });
  $('copyAppUrl').addEventListener('click', async () => {
    if (!activeUrl) return;
    try { await navigator.clipboard.writeText(activeUrl); $('shareFeedback').textContent = '주소를 복사했어요. 친구에게 붙여넣어 보내세요.'; }
    catch { $('shareAppUrl').focus(); $('shareAppUrl').select(); $('shareAppUrl').setSelectionRange(0, activeUrl.length); $('shareFeedback').textContent = '주소를 선택했어요. 길게 누르거나 복사 메뉴를 이용해 주세요.'; }
  });
  nativeButton.addEventListener('click', async () => {
    if (sharing || !activeUrl || typeof navigator.share !== 'function') return;
    sharing = true; nativeButton.disabled = true;
    try { await navigator.share({ title: mode === 'group' ? '로봇랜드 우리 조 초대' : '로봇랜드 동선 플래너', text: mode === 'group' ? '이름을 입력하고 우리 반·조에 함께 입장해요.' : '로봇랜드에서 함께 동선을 계획해요.', url: activeUrl }); }
    catch (error) { if (error.name !== 'AbortError') $('shareFeedback').textContent = '공유 메뉴를 열지 못했어요. 주소 복사로 보내주세요.'; }
    finally { sharing = false; nativeButton.disabled = !activeUrl; }
  });
  showApp(); syncGroup();
})();
