(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const model = window.RobotlandChatPhrases, data = window.MAP_DATA, bridge = window.RobotlandClassroom;
  const packs = {}, loading = new Map(), languageNames = { ko: '한국어', en: 'English', zh: '中文', ru: 'Русский' };
  let language = window.RobotlandI18n.language, templateId = 'at', values = { speaker: 'me', place: 'here', minutes: '10', time: 'now', symptom: 'stomach' };
  let generation = 0, ready = false, historyEntry = false, inserted = false;
  try { const saved = localStorage.getItem('robotland-chat-language'); if (model.languages.includes(saved)) language = saved; } catch {}

  const trigger = document.createElement('button');
  trigger.id = 'openWordChat'; trigger.type = 'button'; trigger.className = 'word-chat-trigger';
  trigger.textContent = window.RobotlandI18n.text('선택해서 말하기 · Language');
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', 'wordChatDialog');
  document.querySelector('.quick-reports').prepend(trigger);

  const dialog = document.createElement('dialog');
  dialog.id = 'wordChatDialog'; dialog.setAttribute('aria-labelledby', 'wordChatTitle');
  dialog.innerHTML = '<div class="word-chat-heading"><h2 id="wordChatTitle">선택해서 말하기</h2><button id="closeWordChat" type="button">닫기</button></div>' +
    '<div class="word-chat-body"><p id="wordChatIntro" class="word-chat-intro"></p>' +
    '<label class="word-chat-field"><span id="wordChatLanguageLabel">언어 / Language</span><select id="wordChatLanguage"></select></label>' +
    '<label id="wordChatTemplateField" class="word-chat-field" hidden><span id="wordChatTemplateLabel"></span><select id="wordChatTemplate"></select></label>' +
    '<div id="wordChatFields" class="word-chat-fields"></div>' +
    '<section id="wordChatPreview" class="word-chat-preview" hidden aria-live="polite" aria-atomic="true"><h3 id="wordChatPreviewLabel"></h3><p id="wordChatKorean" lang="ko"></p><p id="wordChatTranslation" hidden></p></section>' +
    '<p id="wordChatHint" class="word-chat-hint"></p><p id="wordChatFeedback" class="word-chat-feedback" role="status"></p><button id="wordChatRetry" type="button" hidden>다시 / Retry</button></div>' +
    '<div class="word-chat-footer"><button id="insertWordChat" type="button" disabled>채팅 입력창에 넣기</button></div>';
  document.body.append(dialog);
  for (const code of model.languages) $('wordChatLanguage').add(new Option(languageNames[code], code));
  $('wordChatLanguage').value = language;

  function pack() { return packs[language] || packs.ko; }
  async function load(code) {
    if (packs[code]) return packs[code];
    if (!loading.has(code)) {
      const request = fetch('chat-' + code + '.json', { signal: AbortSignal.timeout(10000) })
        .then(response => { if (!response.ok) throw new Error('Language unavailable'); return response.json(); })
        .then(value => { if (value.version !== 1 || value.language !== code) throw new Error('Wrong language pack'); packs[code] = value; return value; })
        .finally(() => loading.delete(code));
      loading.set(code, request);
    }
    return loading.get(code);
  }
  function template() { return model.templates.find(item => item.id === templateId); }
  function optionLabel(field, value) {
    const p = pack();
    if (field === 'speaker') return p.speakers[value];
    if (field === 'place') {
      const translated = p.places[value], korean = packs.ko.places[value];
      return language !== 'ko' && translated !== korean ? translated + ' · ' + korean : translated;
    }
    if (field === 'minutes') return p.ui.minuteFormat.replace('{minutes}', value);
    if (field === 'time') return p.times[value].label;
    return p.symptoms[value];
  }
  function renderFields() {
    const current = template(), fragment = document.createDocumentFragment();
    for (const field of current.fields) {
      const label = document.createElement('label'), title = document.createElement('span'), select = document.createElement('select');
      label.className = 'word-chat-field' + (field === 'place' ? ' word-chat-field-wide' : '');
      title.textContent = pack().fields[field]; select.id = 'wordChat-' + field;
      const allowed = model.choices(field, data, current);
      if (!allowed.includes(values[field])) values[field] = allowed[0];
      if (field === 'place') {
        for (const group of ['common', 'ride', 'exhibit']) {
          const items = model.places(data, current).filter(p => p.group === group);
          if (!items.length) continue;
          const optgroup = document.createElement('optgroup'); optgroup.label = pack().placeGroups[group];
          for (const item of items) optgroup.append(new Option(optionLabel(field, item.id), item.id));
          select.append(optgroup);
        }
      } else for (const choice of allowed) select.add(new Option(optionLabel(field, choice), choice));
      select.value = values[field];
      select.addEventListener('change', () => { values[field] = select.value; renderPreview(); });
      label.append(title, select); fragment.append(label);
    }
    $('wordChatFields').replaceChildren(fragment);
  }
  function renderPreview() {
    if (!ready) return;
    const result = model.compose(templateId, values, language, packs, data);
    $('wordChatKorean').textContent = result.korean;
    $('wordChatTranslation').textContent = result.translation;
    $('wordChatTranslation').lang = language === 'zh' ? 'zh-CN' : language;
    $('wordChatTranslation').hidden = !result.translation;
    $('wordChatPreview').hidden = false;
    const draft = $('messageText').value, tooLong = model.append(draft, result.text, $('messageText').maxLength) === null;
    $('insertWordChat').textContent = draft ? pack().ui.append : pack().ui.insert;
    $('insertWordChat').disabled = tooLong;
    $('wordChatFeedback').textContent = tooLong ? pack().ui.tooLong : '';
  }
  function render() {
    const p = pack();
    dialog.lang = language === 'zh' ? 'zh-CN' : language;
    const labels = { wordChatTitle: 'title', wordChatIntro: 'intro', wordChatLanguageLabel: 'language', wordChatTemplateLabel: 'template', wordChatPreviewLabel: 'preview', wordChatHint: 'hint', closeWordChat: 'close' };
    for (const [id, key] of Object.entries(labels)) $(id).textContent = p.ui[key];
    trigger.textContent = p.ui.trigger; trigger.lang = dialog.lang;
    const select = $('wordChatTemplate'); select.replaceChildren();
    for (const group of Object.keys(p.groups)) {
      const optgroup = document.createElement('optgroup'); optgroup.label = p.groups[group];
      for (const item of model.templates.filter(item => item.group === group)) optgroup.append(new Option(p.phrases[item.id].label, item.id));
      select.append(optgroup);
    }
    select.value = templateId; $('wordChatTemplateField').hidden = false;
    renderFields(); renderPreview();
  }
  async function setLanguage() {
    const current = ++generation; ready = false;
    $('insertWordChat').disabled = true; $('wordChatFeedback').textContent = '불러오는 중… / Loading…'; $('wordChatRetry').hidden = true;
    $('wordChatTemplateField').hidden = true; $('wordChatFields').replaceChildren(); $('wordChatPreview').hidden = true;
    try {
      await Promise.all([load('ko'), load(language)]);
      if (current !== generation) return;
      ready = true; render();
      try { localStorage.setItem('robotland-chat-language', language); } catch {}
    } catch {
      if (current !== generation) return;
      $('wordChatFeedback').textContent = pack()?.ui.loadError || '언어팩을 불러오지 못했어요. / Could not load language.';
      $('wordChatRetry').hidden = false;
    }
  }
  $('wordChatLanguage').addEventListener('change', () => { language = $('wordChatLanguage').value; setLanguage(); });
  $('wordChatRetry').addEventListener('click', setLanguage);
  $('wordChatTemplate').addEventListener('change', () => { templateId = $('wordChatTemplate').value; renderFields(); renderPreview(); });
  trigger.addEventListener('click', () => {
    if (dialog.open || !bridge.user || bridge.user.staffOnly) return;
    inserted = false; dialog.showModal(); history.pushState({ ...history.state, robotlandWordChat: true }, ''); historyEntry = true;
    setLanguage();
  });
  $('insertWordChat').addEventListener('click', () => {
    if (!ready || !bridge.user || bridge.user.staffOnly) return;
    if ($('sendMessage').disabled) { $('wordChatFeedback').textContent = pack().ui.busy; return; }
    const result = model.compose(templateId, values, language, packs, data);
    const input = $('messageText'), next = model.append(input.value, result.text, input.maxLength);
    if (next === null) { renderPreview(); return; }
    input.value = next; input.dispatchEvent(new Event('input', { bubbles: true }));
    inserted = true; dialog.close();
  });
  $('closeWordChat').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    generation++;
    if (historyEntry && history.state?.robotlandWordChat) { historyEntry = false; history.back(); } else historyEntry = false;
    const target = inserted ? $('sendMessage') : trigger;
    target.focus({ preventScroll: true });
    if (inserted) $('messageForm').scrollIntoView({ block: 'nearest' });
  });
  window.addEventListener('popstate', () => { historyEntry = false; if (dialog.open) dialog.close(); });
  window.addEventListener('robotland-session-changed', () => {
    generation++; if (dialog.open) dialog.close();
    templateId = 'at'; values = { speaker: 'me', place: 'here', minutes: '10', time: 'now', symptom: 'stomach' };
  });
  const initialLanguage = language;
  load(initialLanguage).then(p => { if (!dialog.open && language === initialLanguage) { trigger.textContent = p.ui.trigger; trigger.lang = language; } }).catch(() => {});
})();
