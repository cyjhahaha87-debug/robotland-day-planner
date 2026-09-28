const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope={window:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/../public/core.js','utf8'),scope);const core=scope.window.PlannerCore;vm.runInNewContext(fs.readFileSync(__dirname+'/../public/data.js','utf8'),scope);
const data=scope.window.MAP_DATA,graph=core.createGraph(data),options={measurements:data.measuredSegments,baseMinutes:4,pace:1,start:'10:00',lunchTime:'12:00',mealMinutes:40,exitTime:'13:00',autoLunch:true};
const ids=p=>Array.from(p.stops,s=>s.id),rides=data.attractions.filter(a=>a.category==='ride');
const stop=id=>({id,queue:10,ride:3,stay:13});
const early=core.plan(graph,rides.slice(0,3).map(r=>stop(r.id)),options);assert.equal(early.stops.at(-2).id,'lunch-hall');assert.equal(early.total,180);
const crowded=rides.slice(0,15).map(r=>stop(r.id)),p=core.plan(graph,crowded,options),h=ids(p).indexOf('lunch-hall');
assert.ok(h>0&&h<crowded.length);assert.equal(p.legs[h].late,0);assert.equal(p.legs[h].arrival+p.legs[h].wait+p.legs[h].stay,160);
assert.deepEqual(Array.from(ids(p)).filter(id=>!['lunch-hall','exit-meeting'].includes(id)),Array.from(crowded,s=>s.id));assert.equal(ids(p).at(-1),'exit-meeting');assert.ok(p.legs.at(-1).late>0);
const slow=core.plan(graph,[{...stop(rides[0].id),stay:120}],options);assert.equal(ids(slow)[0],'lunch-hall');assert.equal(slow.legs[0].late,0);
const exactWalk=core.plan(graph,[{id:rides[0].id,stay:0},{id:'lunch-hall',stay:40}],{...options,autoLunch:false}).walk;
const exact=core.plan(graph,[{id:rides[0].id,stay:120-exactWalk}],options);assert.equal(ids(exact)[0],rides[0].id);assert.equal(exact.legs[1].arrival,120);
const overflow=core.plan(graph,[{id:rides[0].id,stay:121-exactWalk}],options);assert.equal(ids(overflow)[0],'lunch-hall');
assert.deepEqual(ids(core.plan(graph,p.stops,options)),ids(p));
for(let n=0;n<rides.length;n++){const q=core.plan(graph,rides.slice(0,n).map(r=>stop(r.id)),options);assert.equal(q.stops.filter(s=>s.id==='lunch-hall').length,1);assert.equal(q.legs[ids(q).indexOf('lunch-hall')].late,0);}
console.log('PASS schedule: automatic lunch split includes travel back to hall, exact boundary, preserved order, 12:40 restart, excess-time warning and saved-plan migration.');
