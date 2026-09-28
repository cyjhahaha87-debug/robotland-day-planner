const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=__dirname+'/../';
class Sheet{constructor(){this.data=[];}appendRow(r){this.data.push([...r]);}getLastRow(){return this.data.length;}getLastColumn(){return this.data[0]?.length||0;}deleteRow(n){this.data.splice(n-1,1);}setFrozenRows(){}getRange(r,c,n,m){const s=this;return{getValues(){return s.data.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m));},setValues(values){values.forEach((row,i)=>{s.data[r-1+i]||=[];row.forEach((v,j)=>s.data[r-1+i][c-1+j]=v);});return this;},setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;}};}}
const sheets={},props={};const book={getSheetByName:n=>sheets[n],insertSheet:n=>sheets[n]=new Sheet()};
let now=Date.now();const FakeDate=class extends Date{static now(){return now;}};
const context=vm.createContext({Date:FakeDate,console,SpreadsheetApp:{openById:()=>book,getUi:()=>({alert(){},ButtonSet:{OK:1}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()].map(n=>n>127?n-256:n)},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},ContentService:{MimeType:{JSON:1},createTextOutput:value=>({value,setMimeType(){return this;}})}});
vm.runInContext(fs.readFileSync(root+'integration/RobotlandSheets.gs','utf8'),context);context.setupRobotland();
sheets.Classes.appendRow(['class-a',JSON.stringify('2학년 3반'),now]);sheets.Classes.appendRow(['class-b',JSON.stringify('2학년 4반'),now]);
for(const [code,cid,role]of[['A1B2','class-a','student'],['T1E2','class-a','teacher'],['B1C2','class-b','student']])sheets.AccessCodes.appendRow([code,cid,role,now+86400000,true]);
function gs(args){return JSON.parse(context.doPost({postData:{contents:JSON.stringify({secret:props.BRIDGE_SECRET,...args})}}).value);}
function login(code,deviceId='device-12345678901234567890',clientKey='wifi',nickname='테스트'){const newToken=crypto.randomBytes(32).toString('hex');const result=gs({action:'login',code,nickname,newToken,deviceId,clientKey});return{...result,token:newToken};}

module.exports={gs,login,sheets,props,context,advanceTime:ms=>now+=ms};
