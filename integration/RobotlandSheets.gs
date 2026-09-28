// 로봇랜드 플래너 Google Sheets 저장소. 이 파일은 앱의 공개 파일에 넣지 않습니다.
// 지정된 시트 소유자가 Apps Script에서 setupRobotland()를 한 번 실행하세요.
var ROBOTLAND_SHEET_ID = '1BPPSKOvkuQarxyLL08L3WL1i5hlqif0ORETJ_Gr2o18';
var TABLES = {
 StaffMessages:['messageId','sequence','classId','deviceId','nicknameJson','textJson','referenceJson','createdAt'],
 Classes:['classId','className','createdAt'],
 AccessCodes:['code','classId','role','expiresAt','enabled'],
 Sessions:['tokenHash','classId','role','nicknameJson','deviceId','expiresAt'],
 Messages:['messageId','sequence','classId','deviceId','role','nicknameJson','kind','textJson','createdAt'],
 Plans:['classId','deviceId','planJson','updatedAt'],
 Attempts:['clientKey','windowStart','attempts','blockedUntil'],
 ClassCreations:['requestId','deviceId','classId','createdAt'],
 Groups:['groupId','classId','nameJson','joinCode','createdAt','createdByDevice'],
 GroupMembers:['classId','deviceId','groupId','nicknameJson','joinedAt'],
 GroupPlans:['groupId','revision','planJson','updatedAt','updatedByJson'],
 GroupLocations:['classId','groupId','x','y','updatedAt','updatedByJson','deviceId']
};
function onOpen(){SpreadsheetApp.getUi().createMenu('로봇랜드').addItem('처음 설정','setupRobotland').addItem('반 만들고 참여코드 발급','createClassroom').addItem('교사용 개설코드 확인','showTeacherCode').addItem('연결 비밀키 확인','showConnectionSecret').addToUi();}
function book(){return SpreadsheetApp.openById(ROBOTLAND_SHEET_ID);}
function setupRobotland(){
 var ss=book();Object.keys(TABLES).forEach(function(name){var sheet=ss.getSheetByName(name);if(!sheet)sheet=ss.insertSheet(name);if(sheet.getLastRow()===0){sheet.appendRow(TABLES[name]);sheet.setFrozenRows(1);sheet.getRange(1,1,1,TABLES[name].length).setFontWeight('bold').setBackground('#173249').setFontColor('#ffffff');}});
 var props=PropertiesService.getScriptProperties();if(!props.getProperty('BRIDGE_SECRET'))props.setProperty('BRIDGE_SECRET',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
 if(!props.getProperty('TEACHER_SETUP_CODE'))props.setProperty('TEACHER_SETUP_CODE',newCode([]));
 SpreadsheetApp.getUi().alert('준비 완료','로봇랜드 메뉴에서 반을 만든 뒤, Apps Script를 웹앱으로 배포하세요. 학생 코드와 선생님 코드는 별도로 발급됩니다.',SpreadsheetApp.getUi().ButtonSet.OK);
}
function showConnectionSecret(){var secret=PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');if(!secret)throw new Error('처음 설정을 먼저 실행하세요.');SpreadsheetApp.getUi().alert('연결 비밀키 — 학생에게 배부하지 마세요',secret,SpreadsheetApp.getUi().ButtonSet.OK);}
function newCode(existing){var alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(var attempt=0;attempt<100;attempt++){var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()),code='';for(var i=0;i<4;i++)code+=alphabet[(bytes[i]+256)%32];if(/[A-Z]/.test(code)&&/[0-9]/.test(code)&&existing.indexOf(code)<0)return code;}throw new Error('코드를 발급하지 못했어요. 다시 시도하세요.');}
function createClassroom(){
 var ui=SpreadsheetApp.getUi(),answer=ui.prompt('반 만들기','예: 2학년 3반',ui.ButtonSet.OK_CANCEL);if(answer.getSelectedButton()!==ui.Button.OK)return;
 var name=answer.getResponseText().trim();if(!name||name.length>40)throw new Error('반 이름은 1~40자로 입력하세요.');
 var lock=LockService.getScriptLock();lock.waitLock(10000);
 try{var ss=book(),classes=ss.getSheetByName('Classes'),codes=ss.getSheetByName('AccessCodes');if(!classes||!codes)throw new Error('처음 설정을 먼저 실행하세요.');var existing=rows(codes).map(function(r){return r[0];}),student=newCode(existing);existing.push(student);var teacher=newCode(existing),id=Utilities.getUuid(),now=Date.now(),expiry=now+30*86400000;
 classes.appendRow([id,JSON.stringify(name),now]);codes.appendRow([student,id,'student',expiry,true]);codes.appendRow([teacher,id,'teacher',expiry,true]);SpreadsheetApp.flush();
 ui.alert(name+' 참여코드','학생: '+student+'\n선생님: '+teacher+'\n\n30일 동안 유효합니다. 선생님 코드는 학생에게 배부하지 마세요.\n날짜·사용 여부는 AccessCodes 시트에서 변경할 수 있습니다.',ui.ButtonSet.OK);
 }finally{lock.releaseLock();}
}
function rows(sheet){return sheet.getLastRow()<2?[]:sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();}
function normalizedMemberName(value){var text=String(value||'');if(text.normalize)text=text.normalize('NFKC');return text.replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim().toLowerCase();}
function digest(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(function(n){return('0'+((n+256)%256).toString(16)).slice(-2);}).join('');}
function output(result){return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);}
function fail(message,status){return{ok:false,error:message,status:status||400};}
function parseCell(v){try{return JSON.parse(v);}catch(e){return String(v||'');}}
function doGet(){return output({ok:true,service:'Robotland Sheets API',version:'2026-09-28.3',features:['group-locations','unique-member-names','remove-members','delete-notices','staff-room']});}
function doPost(e){
 var req;try{if(!e.postData||e.postData.contents.length>50000)return output(fail('요청 크기를 확인해 주세요.',413));req=JSON.parse(e.postData.contents);}catch(err){return output(fail('잘못된 요청이에요.'));}
 var secret=PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');if(!secret||req.secret!==secret)return output(fail('연결 권한이 없어요.',403));
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))return output(fail('요청이 많아요. 잠시 후 다시 시도해 주세요.',503));
 try{return output(handle(req));}catch(err){console.error('Robotland operation failed: '+err.name);return output(fail('저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',500));}finally{lock.releaseLock();}
}
function handle(req){
 var ss=book(),now=Date.now(),sessions=ss.getSheetByName('Sessions');
 if(req.action==='staffLogin')return staffLogin(ss,req,now);
 if(req.action==='createClass')return createClassViaApp(ss,req,now);
 if(req.action==='login'){
  var attempts=ss.getSheetByName('Attempts'),attemptRows=rows(attempts),aidx=attemptRows.findIndex(function(r){return r[0]===req.clientKey;}),record=aidx<0?[req.clientKey,now,0,0]:attemptRows[aidx];
  if(Number(record[3])>now)return fail('입력 시도가 많아요. 15분 후 다시 시도해 주세요.',429);
  if(now-Number(record[1])>=900000)record=[req.clientKey,now,0,0];
  var code=String(req.code||'').toUpperCase(),codeRows=rows(ss.getSheetByName('AccessCodes')),match=codeRows.find(function(r){return r[0]===code&&r[4]===true&&Number(r[3])>now;});
  if(!match){record[2]=Number(record[2])+1;if(record[2]>=10)record[3]=now+900000;if(aidx<0)attempts.appendRow(record);else attempts.getRange(aidx+2,1,1,4).setValues([record]);return fail('코드가 틀렸거나 사용 기간이 지났어요.',401);}if(aidx>=0)attempts.getRange(aidx+2,1,1,4).setValues([[req.clientKey,now,0,0]]);
  if(!/^[a-f0-9]{64}$/.test(req.newToken||'')||!req.deviceId||!req.nickname)return fail('접속 정보를 확인해 주세요.');
  var existing=rows(sessions),memberSheet=ss.getSheetByName('GroupMembers'),memberList=memberSheet?rows(memberSheet):[],nameKey=normalizedMemberName(req.nickname);
  if(!nameKey)return fail('이름을 입력해 주세요.');
  var duplicate=existing.some(function(r){return r[1]===match[1]&&r[4]!==req.deviceId&&Number(r[5])>now&&normalizedMemberName(parseCell(r[3]))===nameKey;})||memberList.some(function(r){return r[0]===match[1]&&r[1]!==req.deviceId&&normalizedMemberName(parseCell(r[3]))===nameKey;});
  if(duplicate&&match[2]!=='teacher')return fail('같은 반에서 이미 사용 중인 이름이에요. 번호를 붙이거나 선생님께 입장 기록 정리를 요청하세요.',409);
  memberList.forEach(function(r,index){if(r[0]===match[1]&&r[1]===req.deviceId)memberSheet.getRange(index+2,4,1,1).setValues([[JSON.stringify(String(req.nickname).trim().slice(0,20))]]);});
  var hash=digest(req.newToken),session=[hash,match[1],match[2],JSON.stringify(String(req.nickname).slice(0,20)),req.deviceId,Math.min(now+7*86400000,Number(match[3]))];
  var same=existing.findIndex(function(r){return r[1]===match[1]&&r[4]===req.deviceId;});if(same>=0)sessions.getRange(same+2,1,1,6).setValues([session]);else sessions.appendRow(session);
  return{ok:true,user:identity(ss,session)};
 }
 var allSessions=rows(sessions),idx=allSessions.findIndex(function(r){return r[0]===digest(String(req.token||''))&&Number(r[5])>now;});
 if(idx<0)return{ok:false,status:401,error:'반 코드를 다시 입력해 주세요.',code:'LOGIN_REQUIRED'};var session=allSessions[idx];
 if(req.action==='logout'){sessions.deleteRow(idx+2);return{ok:true};}
 if(req.action==='staffEnterClass')return staffEnterClass(ss,req,session,now);
 if(req.action==='staff'||req.action==='staffSend')return staffAction(ss,req,session,now);
 if(req.action==='deleteNotice')return deleteNotice(ss,req,session);
 if(req.action==='removeClassMember')return removeClassMember(ss,req,session);
 if(req.action==='setGroupLocation'||req.action==='clearGroupLocation')return groupLocationAction(ss,req,session,now);
 if(session[1]==='__staff__'&&['session','classInfo'].indexOf(req.action)<0)return fail('담당 반에 입장한 뒤 이용하세요.',403);
 var who=identity(ss,session);
 if(req.action==='classInfo')return{ok:true,user:who,codes:session[2]==='teacher'?classCodes(ss,session[1]):null};
 if(['groups','createGroup','joinGroup','leaveGroup','groupPlan','saveGroupPlan','assignMember','disbandGroup'].indexOf(req.action)>=0)return groupAction(ss,req,session,now);
 if(req.action==='session')return{ok:true,user:who};
 if(req.action==='messages'){
  var list=rows(ss.getSheetByName('Messages')).filter(function(r){return r[2]===session[1];});
  var latestNotice=list.filter(function(r){return r[6]==='notice';}).slice(-1)[0];
  var after=Number(req.after)||0,filtered=list.filter(function(r){return Number(r[1])>after;}).slice(-100);
  return{ok:true,noticeDeletionSupported:true,noticeIds:list.filter(function(r){return r[6]==='notice';}).map(function(r){return r[0];}),messages:filtered.map(message),cursor:list.length?Number(list[list.length-1][1]):0,notice:latestNotice?message(latestNotice):null};
 }
 if(req.action==='send'){
  if(['message','report','notice'].indexOf(req.kind)<0||!String(req.text||'').trim()||String(req.text).length>1000)return fail('내용을 확인해 주세요.');
  if(req.kind==='notice'&&session[2]!=='teacher')return fail('선생님만 공지를 등록할 수 있어요.',403);
  var sheet=ss.getSheetByName('Messages'),existing=rows(sheet),dupe=existing.find(function(r){return r[0]===req.messageId&&r[2]===session[1]&&r[3]===session[4];});if(dupe)return{ok:true,message:message(dupe)};
  var last=existing.filter(function(r){return r[2]===session[1]&&r[3]===session[4];}).slice(-1)[0];if(last&&now-Number(last[8])<2000)return fail('2초 뒤 다시 보내주세요.',429);
  var seq=existing.length?Math.max(now,Number(existing[existing.length-1][1])+1):now;
  var row=[req.messageId,seq,session[1],session[4],session[2],session[3],req.kind,JSON.stringify(String(req.text).trim()),now];sheet.appendRow(row);return{ok:true,message:message(row)};
 }
 if(req.action==='savePlan'||req.action==='loadPlan'){
  var plans=ss.getSheetByName('Plans'),list=rows(plans),found=list.findIndex(function(r){return r[0]===session[1]&&r[1]===session[4];});
  if(req.action==='loadPlan')return{ok:true,plan:found>=0?parseCell(list[found][2]):null,updatedAt:found>=0?Number(list[found][3]):null};
  var payload=JSON.stringify(req.plan);if(payload.length>35000)return fail('계획이 너무 커요.',413);var row=[session[1],session[4],payload,now];if(found>=0)plans.getRange(found+2,1,1,4).setValues([row]);else plans.appendRow(row);return{ok:true,updatedAt:now};
 }
 return fail('지원하지 않는 요청이에요.',404);
}
function identity(ss,s){var found=rows(ss.getSheetByName('Classes')).find(function(r){return r[0]===s[1];});return{classId:s[1],staffOnly:s[1]==='__staff__',className:found?parseCell(found[1]):s[1]==='__staff__'?'교사 모임':'우리 반',role:s[2],nickname:parseCell(s[3]),deviceId:s[4],expiresAt:Number(s[5])};}
function message(r){return{id:r[0],sequence:Number(r[1]),classId:r[2],deviceId:r[3],role:r[4],nickname:parseCell(r[5]),kind:r[6],text:parseCell(r[7]),createdAt:Number(r[8])};}

function showTeacherCode(){var code=PropertiesService.getScriptProperties().getProperty('TEACHER_SETUP_CODE');if(!code)throw new Error('처음 설정을 실행하세요.');SpreadsheetApp.getUi().alert('교사용 개설코드',code+'\n선생님에게만 전달하세요. 앱에서 반을 만드는 4자리 코드입니다. 학생에게는 생성된 반의 4자리 참여코드를 배부합니다.',SpreadsheetApp.getUi().ButtonSet.OK);}
function classCodes(ss,id){var codes=rows(ss.getSheetByName('AccessCodes')).filter(function(r){return r[1]===id&&r[4]===true&&Number(r[3])>Date.now();});var out={};codes.forEach(function(r){out[r[2]]=r[0];});return out;}
function checkAttempt(ss,key,valid,now){var sheet=ss.getSheetByName('Attempts'),list=rows(sheet),idx=list.findIndex(function(r){return r[0]===key;}),r=idx<0?[key,now,0,0]:list[idx];if(Number(r[3])>now)return false;if(now-Number(r[1])>=900000)r=[key,now,0,0];if(valid){if(idx>=0)sheet.getRange(idx+2,1,1,4).setValues([[key,now,0,0]]);return true;}r[2]=Number(r[2])+1;if(r[2]>=10)r[3]=now+900000;if(idx<0)sheet.appendRow(r);else sheet.getRange(idx+2,1,1,4).setValues([r]);return false;}
function createClassViaApp(ss,req,now){
 var expected=PropertiesService.getScriptProperties().getProperty('TEACHER_SETUP_CODE');
 var authorized=rows(ss.getSheetByName('Sessions')).some(function(r){return r[0]===digest(String(req.token||''))&&r[2]==='teacher'&&Number(r[5])>now;});
 if(!authorized&&!checkAttempt(ss,'teacher:'+req.clientKey,!!expected&&req.enrollmentCode===expected,now))return fail('교사용 개설코드를 확인해 주세요. 반복 입력 시 15분 동안 제한됩니다.',403);
 var name=String(req.className||'').trim();if(!name||name.length>40||!req.deviceId||!req.requestId)return fail('반 정보를 확인해 주세요.');
 var creations=ss.getSheetByName('ClassCreations'),list=rows(creations),prior=list.find(function(r){return r[0]===req.requestId&&r[1]===req.deviceId;}),id,teacher;
 if(prior){id=prior[2];teacher=classCodes(ss,id).teacher;if(!teacher)return fail('반의 선생님 코드가 만료됐어요.');}
 else{
  if(list.filter(function(r){return r[1]===req.deviceId&&now-Number(r[3])<86400000;}).length>=10)return fail('하루에 반을 10개까지 만들 수 있어요.',429);
  var codes=ss.getSheetByName('AccessCodes'),used=rows(codes).map(function(r){return r[0];}),student=newCode(used);used.push(student);teacher=newCode(used);id=Utilities.getUuid();var expiry=now+30*86400000;
  ss.getSheetByName('Classes').appendRow([id,JSON.stringify(name),now]);codes.appendRow([student,id,'student',expiry,true]);codes.appendRow([teacher,id,'teacher',expiry,true]);creations.appendRow([req.requestId,req.deviceId,id,now]);
 }
 var result=handle({action:'login',code:teacher,nickname:req.nickname,deviceId:req.deviceId,newToken:req.newToken,clientKey:req.clientKey});if(result.ok)result.codes=classCodes(ss,id);return result;
}
function groupAction(ss,req,s,now){
 var groups=ss.getSheetByName('Groups'),members=ss.getSheetByName('GroupMembers'),plans=ss.getSheetByName('GroupPlans');
 if(!groups||!members||!plans)return fail('저장소의 처음 설정을 다시 실행해 조 기능을 추가해 주세요.',503);
 var all=rows(groups),mlist=rows(members),myIndex=mlist.findIndex(function(r){return r[0]===s[1]&&r[1]===s[4];}),mine=myIndex>=0?all.find(function(r){return r[0]===mlist[myIndex][2]&&r[1]===s[1];}):null;
 if(req.action==='assignMember'||req.action==='disbandGroup'){
  if(s[2]!=='teacher')return fail('선생님만 조를 조절할 수 있어요.',403);
  var targetGroup=req.groupId?all.find(function(g){return g[0]===req.groupId&&g[1]===s[1];}):null;
  if(req.groupId&&!targetGroup)return fail('우리 반의 조를 선택하세요.',403);
  if(req.action==='disbandGroup'){
   if(!targetGroup)return fail('해산할 조를 선택하세요.');for(var i=mlist.length-1;i>=0;i--)if(mlist[i][0]===s[1]&&mlist[i][2]===targetGroup[0])members.deleteRow(i+2);
   var gi=all.findIndex(function(g){return g[0]===targetGroup[0];});groups.deleteRow(gi+2);return groupState(ss,s);
  }
  var targetMember=rows(ss.getSheetByName('Sessions')).find(function(m){return m[1]===s[1]&&m[4]===req.deviceId&&Number(m[5])>now;});
  if(!targetMember)return fail('우리 반에 접속한 학생만 조절할 수 있어요.',403);
  var mi=mlist.findIndex(function(m){return m[0]===s[1]&&m[1]===req.deviceId;});
  if(!targetGroup){if(mi>=0)members.deleteRow(mi+2);}else{var mr=[s[1],req.deviceId,targetGroup[0],targetMember[3],now];if(mi>=0)members.getRange(mi+2,1,1,5).setValues([mr]);else members.appendRow(mr);}return groupState(ss,s);
 }
 if(req.action==='createGroup'){
  var name=String(req.name||'').trim();if(!name||name.length>20)return fail('조 이름은 1~20자로 입력하세요.');
  if(mine&&mine[5]===s[4]&&parseCell(mine[2])===name)return groupState(ss,s);
  var inClass=all.filter(function(r){return r[1]===s[1];});if(inClass.length>=50)return fail('한 반에 조를 50개까지 만들 수 있어요.',429);
  if(inClass.some(function(r){return parseCell(r[2])===name;}))return fail('같은 이름의 조가 있어요. 다른 이름을 입력하세요.',409);
  var code=newCode(inClass.map(function(r){return r[3];})),gid=Utilities.getUuid();groups.appendRow([gid,s[1],JSON.stringify(name),code,now,s[4]]);if(myIndex>=0)members.deleteRow(myIndex+2);members.appendRow([s[1],s[4],gid,s[3],now]);return groupState(ss,s);
 }
 if(req.action==='joinGroup'){
  var target=all.find(function(r){return r[1]===s[1]&&r[0]===req.groupId;});
  if(!target)return fail('우리 반의 조에만 들어갈 수 있어요.',403);
  var memberRow=[s[1],s[4],target[0],s[3],now];if(myIndex>=0)members.getRange(myIndex+2,1,1,5).setValues([memberRow]);else members.appendRow(memberRow);return groupState(ss,s);
 }
 if(req.action==='leaveGroup'){if(myIndex>=0)members.deleteRow(myIndex+2);return groupState(ss,s);}
 if(req.action==='groups')return groupState(ss,s);
 var targetId=req.groupId?req.groupId:mine&&mine[0],target=all.find(function(r){return r[0]===targetId&&r[1]===s[1];});
 if(!target||(!(mine&&mine[0]===target[0])&&s[2]!=='teacher'))return fail('가입한 조의 동선만 볼 수 있어요.',403);
 var plist=rows(plans),pidx=plist.findIndex(function(r){return r[0]===target[0];}),current=pidx>=0?plist[pidx]:null,revision=current?Number(current[1]):0;
 if(req.action==='groupPlan')return{ok:true,groupId:target[0],groupName:parseCell(target[2]),plan:current?parseCell(current[2]):null,revision:revision,updatedAt:current?Number(current[3]):null,updatedBy:current?parseCell(current[4]):null};
 if(req.action==='saveGroupPlan'){
  if(!mine||mine[0]!==target[0])return fail('조에 가입한 구성원만 동선을 수정할 수 있어요.',403);
  if(Number(req.baseRevision)!==revision)return{ok:false,status:409,error:'다른 조원이 동선을 변경했어요. 최신 동선을 확인한 뒤 다시 공유하세요.',revision:revision};
  var plan=req.plan;if(!plan||plan.version!==1||!Array.isArray(plan.stops)||plan.stops.length>56||!plan.stops.some(function(stop){return stop&&stop.id==='lunch-hall';})||plan.stops[plan.stops.length-1].id!=='exit-meeting'||plan.lunchTime!=='12:00'||plan.mealMinutes!==40||plan.exitTime!=='13:00')return fail('점심 장소를 포함한 올바른 동선을 공유해 주세요.');
  var payload=JSON.stringify(plan);if(payload.length>35000)return fail('동선이 너무 커요.',413);
  var row=[target[0],revision+1,payload,now,s[3]];if(pidx>=0)plans.getRange(pidx+2,1,1,5).setValues([row]);else plans.appendRow(row);return{ok:true,revision:revision+1,updatedAt:now,updatedBy:parseCell(s[3])};
 }
 return fail('지원하지 않는 조 요청이에요.',404);
}
function groupState(ss,s){
 var all=rows(ss.getSheetByName('Groups')).filter(function(r){return r[1]===s[1];}),members=rows(ss.getSheetByName('GroupMembers')).filter(function(r){return r[0]===s[1];}),mine=members.find(function(r){return r[1]===s[4];});
 var list=all.map(function(g){var own=!!mine&&mine[2]===g[0],gm=members.filter(function(m){return m[2]===g[0];});return{id:g[0],name:parseCell(g[2]),count:gm.length,code:own||s[2]==='teacher'?g[3]:null,mine:own,members:own||s[2]==='teacher'?gm.map(function(m){return parseCell(m[3]);}):[]};});
 var people=[];if(s[2]==='teacher'){var seen={};rows(ss.getSheetByName('Sessions')).filter(function(m){return m[1]===s[1]&&Number(m[5])>Date.now();}).forEach(function(m){if(seen[m[4]])return;seen[m[4]]=true;var member=members.find(function(x){return x[1]===m[4];});people.push({deviceId:m[4],nickname:parseCell(m[3]),role:m[2],groupId:member?member[2]:null});});}
 if(s[2]==='teacher')members.forEach(function(m){if(!people.some(function(p){return p.deviceId===m[1];}))people.push({deviceId:m[1],nickname:parseCell(m[3]),role:'student',groupId:m[2],inactive:true});});
 var locationSheet=ss.getSheetByName('GroupLocations'),locations=locationSheet?rows(locationSheet).filter(function(r){return r[0]===s[1];}):[];
 list.forEach(function(g){var pin=locations.find(function(r){return r[1]===g.id;});g.location=pin&&g.count>0&&Date.now()-Number(pin[4])<86400000?{x:Number(pin[2]),y:Number(pin[3]),updatedAt:Number(pin[4]),updatedBy:parseCell(pin[5])}:null;});
 return{ok:true,groups:list,myGroup:list.find(function(g){return g.mine;})||null,people:people,locationsSupported:true,memberManagementSupported:true};
}

function groupLocationAction(ss,req,s,now){
 var groups=rows(ss.getSheetByName('Groups')),members=rows(ss.getSheetByName('GroupMembers'));
 var target=groups.find(function(g){return g[0]===req.groupId&&g[1]===s[1];});
 var mine=members.some(function(m){return m[0]===s[1]&&m[1]===s[4]&&m[2]===req.groupId;});
 if(!target||(!mine&&!(req.action==='clearGroupLocation'&&s[2]==='teacher')))return fail('현재 가입한 조의 위치만 표시할 수 있어요.',403);
 if(req.action==='setGroupLocation'&&(!Number.isInteger(req.x)||!Number.isInteger(req.y)||req.x<0||req.x>2304||req.y<0||req.y>1123))return fail('안내도 안에서 위치를 선택하세요.');
 var sheet=ss.getSheetByName('GroupLocations');
 if(!sheet){sheet=ss.insertSheet('GroupLocations');sheet.appendRow(TABLES.GroupLocations);sheet.setFrozenRows(1);}
 var list=rows(sheet),index=list.findIndex(function(r){return r[0]===s[1]&&r[1]===target[0];});
 if(req.action==='clearGroupLocation'){if(index>=0)sheet.deleteRow(index+2);}
 else{var row=[s[1],target[0],req.x,req.y,now,s[3],s[4]];if(index>=0)sheet.getRange(index+2,1,1,7).setValues([row]);else sheet.appendRow(row);}
 return groupState(ss,s);
}

function removeClassMember(ss,req,s){
 if(s[2]!=='teacher')return fail('선생님만 입장 기록을 정리할 수 있어요.',403);
 if(req.deviceId===s[4])return fail('본인 접속은 반에서 나가기로 종료하세요.');
 var sessions=ss.getSheetByName('Sessions'),members=ss.getSheetByName('GroupMembers');
 var slist=rows(sessions),mlist=rows(members),present=slist.some(function(r){return r[1]===s[1]&&r[4]===req.deviceId;})||mlist.some(function(r){return r[0]===s[1]&&r[1]===req.deviceId;});
 if(!present)return fail('우리 반의 입장 기록만 정리할 수 있어요.',403);
 for(var i=slist.length-1;i>=0;i--)if(slist[i][1]===s[1]&&slist[i][4]===req.deviceId)sessions.deleteRow(i+2);
 for(var j=mlist.length-1;j>=0;j--)if(mlist[j][0]===s[1]&&mlist[j][1]===req.deviceId)members.deleteRow(j+2);
 return groupState(ss,s);
}

function deleteNotice(ss,req,s){
 if(s[2]!=='teacher')return fail('선생님만 공지를 삭제할 수 있어요.',403);
 var sheet=ss.getSheetByName('Messages'),list=rows(sheet),index=list.findIndex(function(r){return r[0]===req.messageId&&r[2]===s[1]&&r[6]==='notice';});
 if(index<0)return fail('우리 반의 공지를 찾을 수 없어요.',404);
 sheet.deleteRow(index+2);return{ok:true,deletedId:req.messageId};
}

function staffOverview(ss,now){
 var active=rows(ss.getSheetByName('AccessCodes')).filter(function(r){return r[4]===true&&Number(r[3])>now;}).map(function(r){return r[1];});
 var classes=rows(ss.getSheetByName('Classes')).filter(function(r){return active.indexOf(r[0])>=0;});
 var sessions=rows(ss.getSheetByName('Sessions')),groups=rows(ss.getSheetByName('Groups')),members=rows(ss.getSheetByName('GroupMembers')),plans=rows(ss.getSheetByName('GroupPlans'));
 var locationSheet=ss.getSheetByName('GroupLocations'),locations=locationSheet?rows(locationSheet):[];
 return classes.map(function(c){
  var cs=sessions.filter(function(s){return s[1]===c[0]&&Number(s[5])>now;}),cm=members.filter(function(m){return m[0]===c[0];}),devices={},teachers=[];
  cs.forEach(function(s){if(s[2]==='student')devices[s[4]]=true;else if(teachers.indexOf(parseCell(s[3]))<0)teachers.push(parseCell(s[3]));});
  cm.forEach(function(m){if(!sessions.some(function(s){return s[1]===c[0]&&s[4]===m[1]&&s[2]==='teacher';}))devices[m[1]]=true;});
  return{id:c[0],name:parseCell(c[1]),memberCount:Object.keys(devices).length,teachers:teachers,groups:groups.filter(function(g){return g[1]===c[0];}).map(function(g){
   var gm=cm.filter(function(m){return m[2]===g[0];}),pin=locations.find(function(p){return p[0]===c[0]&&p[1]===g[0];}),saved=plans.find(function(p){return p[0]===g[0];}),plan=saved?parseCell(saved[2]):null;
   return{id:g[0],name:parseCell(g[2]),count:gm.length,location:pin&&gm.length&&now-Number(pin[4])<86400000?{x:Number(pin[2]),y:Number(pin[3]),updatedAt:Number(pin[4])}:null,
    plan:plan&&Array.isArray(plan.stops)?{start:plan.start,pace:plan.pace,stops:plan.stops.slice(0,56).map(function(s){return{id:String(s.id||'').slice(0,100),queue:Number(s.queue)||0,ride:Number(s.ride)||0};})}:null,
    revision:saved?Number(saved[1]):0,updatedAt:saved?Number(saved[3]):null};
  })};
 });
}
function staffMessage(r){return{id:r[0],sequence:Number(r[1]),classId:r[2],nickname:parseCell(r[4]),text:parseCell(r[5]),reference:parseCell(r[6]),createdAt:Number(r[7])};}
function staffAction(ss,req,s,now){
 if(s[2]!=='teacher')return fail('교사 모임은 선생님만 이용할 수 있어요.',403);
 var sheet=ss.getSheetByName('StaffMessages'),list=sheet?rows(sheet):[];
 if(req.action==='staff')return{ok:true,classes:staffOverview(ss,now),messages:list.slice(-100).map(staffMessage),updatedAt:now};
 var text=String(req.text||'').trim();if(text.length>1000||(!text&&!req.referenceClassId))return fail('내용이나 공유할 반·조를 선택하세요.');
 if(!/^[a-zA-Z0-9-]{20,64}$/.test(req.messageId||''))return fail('메시지 정보를 확인하세요.');
 var duplicate=list.find(function(r){return r[0]===req.messageId&&r[2]===s[1]&&r[3]===s[4];});if(duplicate)return{ok:true,message:staffMessage(duplicate)};
 var last=list.filter(function(r){return r[2]===s[1]&&r[3]===s[4];}).slice(-1)[0];if(last&&now-Number(last[7])<2000)return fail('2초 뒤 다시 보내주세요.',429);
 var reference=null;
 if(req.referenceClassId){
  var classroom=staffOverview(ss,now).find(function(c){return c.id===req.referenceClassId;});if(!classroom)return fail('현재 운영 중인 반을 선택하세요.',404);
  if(req.referenceGroupId){var group=classroom.groups.find(function(g){return g.id===req.referenceGroupId;});if(!group)return fail('해당 반의 조를 선택하세요.',404);reference={type:'group',classId:classroom.id,className:classroom.name,group:group};}
  else reference={type:'class',classId:classroom.id,className:classroom.name,memberCount:classroom.memberCount,groups:classroom.groups.map(function(g){return{id:g.id,name:g.name,count:g.count,location:g.location};})};
 }
 if(!sheet){sheet=ss.insertSheet('StaffMessages');sheet.appendRow(TABLES.StaffMessages);sheet.setFrozenRows(1);}
 var seq=list.length?Math.max(now,Number(list[list.length-1][1])+1):now,row=[req.messageId,seq,s[1],s[4],s[3],JSON.stringify(text),JSON.stringify(reference),now];sheet.appendRow(row);
 return{ok:true,message:staffMessage(row)};
}

function staffLogin(ss,req,now){
 var expected=PropertiesService.getScriptProperties().getProperty('TEACHER_SETUP_CODE');
 if(!checkAttempt(ss,'teacher:'+req.clientKey,!!expected&&req.code===expected,now))return fail('교사 입장코드를 확인해 주세요. 반복 입력 시 15분 동안 제한됩니다.',403);
 var nickname=String(req.nickname||'').trim();if(!nickname||nickname.length>20||!normalizedMemberName(nickname)||!/^[a-f0-9]{64}$/.test(req.newToken||'')||!/^[-a-zA-Z0-9]{20,64}$/.test(req.deviceId||''))return fail('이름과 접속 정보를 확인하세요.');
 var sessions=ss.getSheetByName('Sessions'),list=rows(sessions),index=list.findIndex(function(r){return r[1]==='__staff__'&&r[4]===req.deviceId;}),row=[digest(req.newToken),'__staff__','teacher',JSON.stringify(nickname),req.deviceId,now+7*86400000];
 if(index>=0)sessions.getRange(index+2,1,1,6).setValues([row]);else sessions.appendRow(row);return{ok:true,user:identity(ss,row)};
}

function staffEnterClass(ss,req,s,now){
 if(s[2]!=='teacher')return fail('선생님만 반 목록에서 입장할 수 있어요.',403);
 var target=rows(ss.getSheetByName('Classes')).find(function(c){return c[0]===req.classId;}),codes=rows(ss.getSheetByName('AccessCodes')).filter(function(c){return c[1]===req.classId&&c[4]===true&&Number(c[3])>now;});
 if(!target||!codes.length)return fail('현재 운영 중인 반을 선택하세요.',404);
 var sheet=ss.getSheetByName('Sessions'),list=rows(sheet),next=[s[0],req.classId,'teacher',s[3],s[4],s[5]];
 for(var i=list.length-1;i>=0;i--)if(list[i][0]===s[0]||(list[i][1]===req.classId&&list[i][4]===s[4]))sheet.deleteRow(i+2);
 sheet.appendRow(next);return{ok:true,user:identity(ss,next)};
}
