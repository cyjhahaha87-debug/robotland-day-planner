const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const root = __dirname + '/../', scope = { window: {} };
for (const name of ['data.js', 'chat-phrases.js']) vm.runInNewContext(fs.readFileSync(root + 'public/' + name, 'utf8'), scope);
const model = scope.window.RobotlandChatPhrases, data = scope.window.MAP_DATA;
const packs = Object.fromEntries(model.languages.map(code => [code, JSON.parse(fs.readFileSync(root + 'public/chat-' + code + '.json', 'utf8'))]));
const values = { speaker: 'group', place: 'sky-tower', minutes: '10', time: '12:00', symptom: 'stomach' };
const english = model.compose('waiting', values, 'en', packs, data);
assert.equal(english.korean, '우리 조는 스카이타워에서 기다리고 있어요.');
assert.equal(english.translation, "We're waiting at Sky Tower.");
assert.equal(english.text, english.korean + '\n' + english.translation);
assert.equal(model.compose('waiting', values, 'ko', packs, data).text, english.korean);
assert.equal(model.compose('waiting', { ...values, speaker: 'me' }, 'en', packs, data).translation, "I'm waiting at Sky Tower.");
assert.equal(model.compose('meet', values, 'zh', packs, data).translation, '我们12:00在天空塔集合吧。');
assert.equal(model.compose('meet', values, 'ru', packs, data).translation, 'Давайте встретимся в 12:00. Место: Небесная башня.');
assert.equal(model.compose('understood', {}, 'en', packs, data).text, '네, 알겠어요.\nOkay, I understand.');
assert.throws(() => model.compose('queue', { ...values, place: 'restroom' }, 'ko', packs, data), /Invalid phrase choice/);
assert.throws(() => model.compose('at', { ...values, speaker: 'someone-else' }, 'ko', packs, data), /Invalid phrase choice/);
assert.throws(() => model.compose('late', { minutes: '9999' }, 'ko', packs, data), /Invalid phrase choice/);
assert.throws(() => model.compose('unknown', {}, 'ko', packs, data), /Unknown phrase/);
assert.throws(() => model.compose('at', values, 'xx', packs, data), /Unknown language/);
assert.equal(model.append('이미 작성한 글', english.text), '이미 작성한 글\n' + english.text);
assert.equal(model.append('이미 작성한 글\n', english.text), '이미 작성한 글\n' + english.text);
assert.equal(model.append('', english.text), english.text);
assert.equal(model.append('a'.repeat(997), 'bc'), 'a'.repeat(997) + '\nbc');
assert.equal(model.append('a'.repeat(998), 'bc'), null);
// Every supported field-trip combination must render in all four packs without missing words.
let combinations = 0;
for (const template of model.templates) {
  let options = [{}];
  for (const field of template.fields) options = options.flatMap(value => model.choices(field, data, template).map(choice => ({ ...value, [field]: choice })));
  for (const code of model.languages) {
    const p = packs[code];
    assert.equal(p.language, code); assert.equal(p.version, 1);
    assert.ok(p.groups[template.group]); assert.ok(p.phrases[template.id].label);
    for (const field of template.fields) assert.ok(p.fields[field]);
    for (const selection of options) {
      const result = model.compose(template.id, selection, code, packs, data);
      assert.ok(result.text.length <= 1000);
      assert.doesNotMatch(result.text, /\{|\}|undefined|\[object Object\]/);
      assert.ok(result.korean); if (code !== 'ko') assert.ok(result.translation);
      combinations++;
    }
  }
}
for (const code of model.languages) {
  assert.deepEqual(Object.keys(packs[code]).sort(), Object.keys(packs.ko).sort());
  for (const section of ['ui','groups','fields','speakers','places','times','symptoms','phrases']) assert.deepEqual(Object.keys(packs[code][section]).sort(), Object.keys(packs.ko[section]).sort());
}
console.log('PASS word chat: bilingual output, grammar variants, constrained choices, draft preservation, character limit and ' + combinations + ' translated field-trip combinations.');
