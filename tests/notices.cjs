const assert=require('node:assert/strict'),{gs,login,advanceTime}=require('./store-fixture.cjs');
const teacher=login('T1E2','teacher-notice-123456789','t','담임'),student=login('A1B2','student-notice-123456789','s','학생');
function act(w,action,fields={}){return gs({action,token:w.token,...fields});}
const fields={kind:'notice',messageId:'notice-one-123456789012',text:'정오에 모이세요'};assert.equal(act(teacher,'send',fields).ok,true);advanceTime(2001);
assert.equal(act(teacher,'send',{...fields,messageId:'notice-two-123456789012',text:'다목적홀로 오세요'}).ok,true);
assert.equal(act(student,'deleteNotice',{messageId:fields.messageId}).status,403);
assert.equal(act(teacher,'deleteNotice',{messageId:'notice-two-123456789012'}).ok,true);
const state=act(student,'messages');assert.equal(state.notice.id,fields.messageId);assert.deepEqual(state.noticeIds,[fields.messageId]);
assert.equal(act(teacher,'deleteNotice',{messageId:fields.messageId}).ok,true);assert.equal(act(student,'messages').notice,null);
const other=login('B1C2','other-notice-12345678901','b','다른반');advanceTime(2001);
act(other,'send',{kind:'message',messageId:'other-class-123456789012',text:'다른반 대화'});
assert.equal(act(teacher,'deleteNotice',{messageId:'other-class-123456789012'}).status,404);assert.equal(act(other,'messages').messages.length,1);
act(student,'send',{kind:'message',messageId:'student-chat-12345678901',text:'대화'});assert.equal(act(teacher,'deleteNotice',{messageId:'student-chat-12345678901'}).status,404);
console.log('PASS notices: only teachers, only same-class notices, latest notice falls back, deleted IDs removed on polling, chat unchanged.');
