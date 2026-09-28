(function (root) {
  'use strict';
  const languages = ['ko', 'en', 'zh', 'ru'];
  const templates = [
    { id: 'at', group: 'location', fields: ['speaker', 'place'] },
    { id: 'going', group: 'location', fields: ['speaker', 'place'] },
    { id: 'arrived', group: 'location', fields: ['speaker', 'place'] },
    { id: 'waiting', group: 'location', fields: ['speaker', 'place'] },
    { id: 'where', group: 'location', fields: [] },
    { id: 'queue', group: 'activity', fields: ['speaker', 'place'], places: ['ride'] },
    { id: 'waitTime', group: 'activity', fields: ['place', 'minutes'], places: ['ride'] },
    { id: 'finished', group: 'activity', fields: ['speaker', 'place'], places: ['ride', 'exhibit'] },
    { id: 'next', group: 'activity', fields: ['speaker', 'place'], places: ['ride', 'exhibit'] },
    { id: 'eating', group: 'daily', fields: ['speaker'] },
    { id: 'mealDone', group: 'daily', fields: ['speaker'] },
    { id: 'restroom', group: 'daily', fields: ['speaker'] },
    { id: 'water', group: 'daily', fields: [] },
    { id: 'rest', group: 'daily', fields: ['speaker', 'place'] },
    { id: 'help', group: 'help', fields: ['place'] },
    { id: 'lost', group: 'help', fields: [] },
    { id: 'friendMissing', group: 'help', fields: ['place'] },
    { id: 'unwell', group: 'help', fields: ['symptom'] },
    { id: 'friendUnwell', group: 'help', fields: ['symptom'] },
    { id: 'waitPlease', group: 'meeting', fields: ['minutes'] },
    { id: 'meet', group: 'meeting', fields: ['place', 'time'] },
    { id: 'late', group: 'meeting', fields: ['minutes'] },
    { id: 'headingBack', group: 'meeting', fields: ['speaker'] },
    { id: 'understood', group: 'reply', fields: [] },
    { id: 'okay', group: 'reply', fields: [] },
    { id: 'repeat', group: 'reply', fields: [] },
    { id: 'thanks', group: 'reply', fields: [] },
    { id: 'languageHelp', group: 'reply', fields: [] },
  ];
  const minutes = ['5', '10', '15', '20', '30', '40', '60'];
  const times = ['now', 'after5', 'after10', '10:00', '11:00', '12:00', '12:40', '13:00'];
  const symptoms = ['stomach', 'headache', 'dizzy', 'nausea', 'injury'];
  const commonPlaces = ['here', 'gate', 'lunch-hall', 'exit-meeting', 'restroom', 'teacher'];
  function places(data, template) {
    const result = commonPlaces.map(id => ({ id, group: 'common' }));
    for (const point of data.attractions) {
      if (['ride', 'exhibit'].includes(point.category)) result.push({ id: point.id, group: point.category });
    }
    return template.places ? result.filter(p => template.places.includes(p.group)) : result;
  }
  function choices(field, data, template) {
    if (field === 'speaker') return ['me', 'group'];
    if (field === 'place') return places(data, template).map(p => p.id);
    if (field === 'minutes') return minutes;
    if (field === 'time') return times;
    if (field === 'symptom') return symptoms;
    throw new Error('Unknown phrase field');
  }
  function sentence(id, values, pack, data) {
    const template = templates.find(item => item.id === id);
    if (!template) throw new Error('Unknown phrase');
    for (const field of template.fields) {
      if (!choices(field, data, template).includes(values[field])) throw new Error('Invalid phrase choice: ' + field);
    }
    const text = pack.phrases[id].text;
    const pattern = Array.isArray(text) ? text[values.speaker === 'group' ? 1 : 0] : text;
    return pattern.replace(/\{(\w+)\}/g, (_, field) => {
      if (field === 'place') return pack.places[values.place];
      if (field === 'minutes') return values.minutes;
      if (field === 'time') return pack.times[values.time].text;
      if (field === 'symptom') return pack.symptoms[values.symptom];
      throw new Error('Unknown phrase placeholder');
    });
  }
  function compose(id, values, language, packs, data) {
    if (!languages.includes(language)) throw new Error('Unknown language');
    const korean = sentence(id, values, packs.ko, data);
    const translation = language === 'ko' ? '' : sentence(id, values, packs[language], data);
    return { korean, translation, text: korean + (translation ? '\n' + translation : '') };
  }
  function append(draft, message, maxLength = 1000) {
    const result = draft + (draft && !draft.endsWith('\n') ? '\n' : '') + message;
    return result.length > maxLength ? null : result;
  }
  const api = { languages, templates, places, choices, compose, append };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RobotlandChatPhrases = api;
})(typeof window === 'undefined' ? globalThis : window);
