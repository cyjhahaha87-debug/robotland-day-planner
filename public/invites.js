(() => {
  'use strict';const T=window.RobotlandI18n.text;
  const $ = id => document.getElementById(id), bridge = window.RobotlandClassroom, dialog = $('inviteDialog');
  let token = '', preview = null, busy = false, generation = 0;
  function clearLink() { if (location.hash.startsWith('#join=')) history.replaceState(history.state, '', location.pathname + location.search); }
  function close() { if (!busy && dialog.open) dialog.close(); }
  function explain() {
    if (!preview) return;
    const user = bridge.user;
    $('inviteInstructions').textContent = user?.role === 'teacher'
      ? T("현재 선생님으로 접속 중입니다. 아래 버튼을 누르면 학생으로 전환하여 이 반·조에 입장합니다.")
      : user ? T("아래 버튼을 누르면 ") + user.nickname + T("님의 이 기기 접속이 초대받은 반·조로 바뀝니다. 이름을 확인해 주세요.")
        : T("자기 이름만 입력하면 이 반과 조에 함께 입장합니다.");
    $('joinInvitation').textContent = user?.role === 'teacher' ? T("학생으로 반·조 입장") : T("반·조 함께 입장");
    if (!$('inviteNickname').value && user) $('inviteNickname').value = user.nickname;
  }
  async function openLink() {
    if (!location.hash.startsWith('#join=') || busy) return;
    const current = ++generation; token = location.hash.slice(6); preview = null;
    $('inviteFeedback').textContent = ''; $('inviteDestination').textContent = T("초대를 확인하고 있어요.");
    $('inviteInstructions').textContent = T("잠시만 기다려 주세요."); $('joinInvitation').disabled = true;
    if (!dialog.open) dialog.showModal();
    if (!/^[a-f0-9]{64}$/.test(token)) { $('inviteDestination').textContent = T("초대 주소를 확인해 주세요."); $('inviteFeedback').textContent = T("QR코드를 다시 찍거나 새 초대 주소를 받아주세요."); return; }
    try {
      const response = await fetch('/api/invites/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inviteToken: token }), credentials: 'omit', signal: AbortSignal.timeout(22000) });
      const result = await response.json();
      if (!response.ok || !result.ok) { const error = new Error(T(result.error) || T("초대를 확인하지 못했어요.")); error.status = response.status; throw error; }
      await bridge.ready;
      if (current !== generation || !dialog.open) return;
      preview = result; $('inviteDestination').textContent = result.className + ' · ' + result.groupName;
      explain(); $('joinInvitation').disabled = false; $('inviteNickname').focus();
    } catch (error) {
      if (current !== generation || !dialog.open) return;
      $('inviteDestination').textContent = T("초대를 확인하지 못했어요.");
      $('inviteFeedback').textContent = error.status === 404 ? T("선생님이 조 초대 기능을 준비 중이에요. 반 코드로 먼저 입장해 주세요.") : error.status ? error.message : T("인터넷 연결을 확인한 뒤 초대 주소를 다시 열어주세요.");
    }
  }
  $('closeInvite').addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => { generation++; token = ''; preview = null; clearLink(); });
  window.addEventListener('hashchange', openLink);
  window.addEventListener('robotland-session-changed', explain);
  $('inviteJoinForm').addEventListener('submit', async e => {
    e.preventDefault(); if (busy || !preview) return;
    const nickname = $('inviteNickname').value.trim(); if (!nickname) return;
    busy = true; $('joinInvitation').disabled = true; $('closeInvite').disabled = true; $('inviteNickname').disabled = true;
    $('inviteFeedback').textContent = T("반과 조에 입장하고 있어요…");
    try {
      const result = await bridge.api('invites/join', { inviteToken: token, nickname, deviceId: bridge.deviceId });
      bridge.applyUser(result.user); bridge.announceSession(); window.RobotlandGroups.apply(result);
      document.querySelector('.mobile-nav [data-mobile-view="chat"]').click();
      document.querySelector('[data-room-view="groups"]').click();
      $('groupStatus').textContent = result.user.className + ' · ' + result.myGroup.name + T("에 입장했어요.");
      busy = false; dialog.close();
    } catch (error) { $('inviteFeedback').textContent = error.message; }
    finally { busy = false; $('joinInvitation').disabled = !preview; $('closeInvite').disabled = false; $('inviteNickname').disabled = false; }
  });
  openLink();
})();
