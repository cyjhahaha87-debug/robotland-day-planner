(() => {
  const input = document.getElementById('messageText'), viewport = window.visualViewport;
  let unfocusedHeight = viewport?.height || innerHeight;
  function resize() {
    if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
    const height = viewport?.height || innerHeight;
    const editing = document.activeElement === input;
    if (!editing) unfocusedHeight = height;
    document.documentElement.style.setProperty('--chat-viewport-height', height + 'px');
    document.documentElement.style.setProperty('--chat-viewport-top', (viewport?.offsetTop || 0) + 'px');
    document.body.dataset.chatKeyboard = String(editing && Math.max(unfocusedHeight, innerHeight) - height > 100);
  }
  function fitInput() { input.style.height = '44px'; input.style.height = Math.min(88, Math.max(44, input.scrollHeight + 2)) + 'px'; }
  viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
  window.addEventListener('resize', resize);
  document.addEventListener('focusin', resize); document.addEventListener('focusout', () => requestAnimationFrame(resize));
  input.addEventListener('input', fitInput);
  document.getElementById('messageForm').addEventListener('submit', () => setTimeout(fitInput, 100));
  const showLatest=()=>requestAnimationFrame(()=>{const list=document.getElementById('messageList');if(!document.getElementById('classChat').hidden)list.scrollTop=list.scrollHeight;});
  for(const button of document.querySelectorAll('[data-mobile-view="chat"]'))button.addEventListener('click',showLatest);
  window.addEventListener('robotland-room-view',event=>{if(event.detail==='chat')showLatest();});
  resize();
})();
