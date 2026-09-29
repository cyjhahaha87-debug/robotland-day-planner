(() => {
  const viewport = window.visualViewport;
  const composers = [
    { input: document.getElementById('messageText'), list: document.getElementById('messageList') },
    { input: document.getElementById('staffMessageText'), list: document.getElementById('staffMessages') }
  ];
  let fullHeight = viewport?.height || innerHeight, editing = null;
  for (const composer of composers) {
    composer.atBottom = true;
    composer.list.addEventListener('scroll', () => {
      composer.atBottom = composer.list.scrollHeight - composer.list.scrollTop - composer.list.clientHeight < 80;
    });
    composer.input.addEventListener('input', () => { fitInput(composer.input); keepLatest(); });
  }
  function fitInput(input) {
    input.style.height = '44px';
    input.style.height = Math.min(88, Math.max(44, input.scrollHeight + 2)) + 'px';
  }
  function keepLatest() {
    const following = composers.filter(c => c.atBottom && c.list.getClientRects().length);
    requestAnimationFrame(() => {
      for (const c of following) { c.list.scrollTop = c.list.scrollHeight; c.atBottom = true; }
    });
  }
  function resize() {
    if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
    const height = viewport?.height || innerHeight;
    const focused = composers.find(c => c.input === document.activeElement);
    if (!focused && document.body.dataset.chatKeyboard !== 'true') editing = null;
    if (focused) editing = focused;
    // Retain the composer during Send-button focus until the keyboard finishes closing.
    if (editing && (!editing.input.getClientRects().length || document.querySelector('dialog[open]'))) editing = null;
    if (!editing) fullHeight = height;
    else fullHeight = Math.max(fullHeight, height);
    const keyboard = !!editing && fullHeight - height > 80;
    keepLatest();
    document.documentElement.style.setProperty('--chat-viewport-height', height + 'px');
    document.documentElement.style.setProperty('--chat-viewport-top', (viewport?.offsetTop || 0) + 'px');
    document.body.dataset.chatKeyboard = String(keyboard);
    if (!focused && !keyboard) editing = null;
  }
  viewport?.addEventListener('resize', resize);
  viewport?.addEventListener('scroll', resize);
  window.addEventListener('resize', resize);
  document.addEventListener('focusin', () => { for (const c of composers) fitInput(c.input); resize(); });
  document.addEventListener('focusout', resize);
  const showLatest = () => requestAnimationFrame(() => {
    resize();
    for (const c of composers) if (c.list.getClientRects().length) {
      c.list.scrollTop = c.list.scrollHeight; c.atBottom = true;
    }
  });
  for (const button of document.querySelectorAll('[data-mobile-view="chat"], [data-staff-view="talk"]')) button.addEventListener('click', showLatest);
  window.addEventListener('robotland-room-view', showLatest);
  resize();
})();
