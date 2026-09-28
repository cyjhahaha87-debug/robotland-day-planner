(function(root){
  'use strict';
  const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  function createGraph(data){
    const nodes=JSON.parse(JSON.stringify(data.graph.nodes));
    Object.assign(nodes,{gate:[1630,750],gatePassage:[1535,715],pirateBend:[1070,582],teaBend:[1040,638],kidsBend1:[1125,882],kidsBend2:[1150,905]});
    const edges=[];
    for(const chain of data.graph.chains)for(let i=1;i<chain.length;i++){
      const a=chain[i-1],b=chain[i];
      if(a==='stageSouth'&&b==='southwest') edges.push([a,'pirateBend'],['pirateBend','teaBend'],['teaBend',b]);
      else if(a==='kidsWest'&&b==='kidsSouth') edges.push([a,'kidsBend1'],['kidsBend1','kidsBend2'],['kidsBend2',b]);
      else edges.push([a,b]);
    }
    edges.push(['gate','gatePassage'],['gatePassage','gateInside']);
    const baseEdges=edges.slice(),projections=new Map();
    for(const poi of data.attractions){
      nodes[poi.id]=poi.access;let nearest;
      baseEdges.forEach(([a,b],index)=>{
        const p=nodes[a],q=nodes[b],dx=q[0]-p[0],dy=q[1]-p[1],len2=dx*dx+dy*dy;
        if(!len2)return;
        const t=Math.max(0,Math.min(1,((poi.access[0]-p[0])*dx+(poi.access[1]-p[1])*dy)/len2));
        const point=[p[0]+t*dx,p[1]+t*dy],dist=length(point,poi.access);
        if(!nearest||dist<nearest.dist)nearest={index,t,point,dist};
      });
      const join='join-'+poi.id;nodes[join]=nearest.point;
      if(!projections.has(nearest.index))projections.set(nearest.index,[]);
      projections.get(nearest.index).push({id:join,t:nearest.t});edges.push([poi.id,join]);
    }
    const finalEdges=edges.slice(baseEdges.length);
    baseEdges.forEach(([a,b],i)=>{const ids=[a,...(projections.get(i)||[]).sort((x,y)=>x.t-y.t).map(p=>p.id),b];for(let j=1;j<ids.length;j++)finalEdges.push([ids[j-1],ids[j]]);});
    const adjacent=Object.fromEntries(Object.keys(nodes).map(k=>[k,[]]));
    for(const[a,b]of finalEdges){const d=length(nodes[a],nodes[b]);adjacent[a].push([b,d]);adjacent[b].push([a,d]);}
    return {nodes,edges:finalEdges,adjacent};
  }
  function shortest(graph,from,to){
    if(!graph.nodes[from]||!graph.nodes[to])throw new Error('Unknown route point');
    const dist={[from]:0},prev={},visited=new Set();
    while(true){let at=null,best=Infinity;for(const id of Object.keys(dist))if(!visited.has(id)&&dist[id]<best){at=id;best=dist[id];}if(at===null)throw new Error('No connected walking route');if(at===to)break;visited.add(at);for(const[next,cost]of graph.adjacent[at])if(!visited.has(next)&&best+cost<(dist[next]??Infinity)){dist[next]=best+cost;prev[next]=at;}}
    const ids=[to];while(ids[0]!==from)ids.unshift(prev[ids[0]]);return {units:dist[to],ids,points:ids.map(id=>graph.nodes[id])};
  }
  function plan(graph,stops,options){
    const references=(options.measurements||[]).map(x=>({...x}));
    if(options.calibration){
      const c=options.calibration;
      if(!Number.isFinite(c.meters)||c.meters<=0||c.from===c.to)throw new Error('Invalid distance calibration');
      const index=references.findIndex(r=>(r.from===c.from&&r.to===c.to)||(r.from===c.to&&r.to===c.from));
      if(index>=0)references[index]=c;else references.push(c);
    }
    let ratio=0;
    if(references.length){
      let totalMeters=0,totalUnits=0;
      for(const r of references){const units=shortest(graph,r.from,r.to).units;if(!Number.isFinite(r.meters)||r.meters<=0||units<=0)throw new Error('Invalid measured segment');totalMeters+=r.meters;totalUnits+=units;}
      ratio=totalMeters/totalUnits;
    }
    const fallback=options.baseMinutes/shortest(graph,'gate','central').units;
    let last='gate',elapsed=0,walk=0,stay=0,waiting=0;const legs=[],destinations=[];
    const clock=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
    function segment(from,to){
      const path=shortest(graph,from,to);
      const known=references.find(r=>(r.from===from&&r.to===to)||(r.to===from&&r.from===to));
      const meters=known?known.meters:ratio?path.units*ratio:null;
      const rawMinutes=meters!==null?meters/(4000/60):path.units*fallback;
      const minutes=path.units===0?0:Math.max(1,Math.ceil(rawMinutes*options.pace-1e-9));
      return {...path,from,to,minutes,meters:meters===null?null:Math.round(meters),measured:!!known};
    }
    function append(stop){
      const leg=segment(last,stop.id);elapsed+=leg.minutes;walk+=leg.minutes;
      const meetingTime=stop.id==='lunch-hall'?options.lunchTime:stop.id==='exit-meeting'?(options.exitTime||'13:00'):null;
      const target=meetingTime&&options.start?clock(meetingTime)-clock(options.start):null;
      const wait=target===null?0:Math.max(0,target-elapsed),late=target===null?0:Math.max(0,elapsed-target);
      const duration=stop.stay||0;
      legs.push({...leg,arrival:elapsed,wait,late,stay:duration});destinations.push({...stop});
      elapsed+=wait+duration;waiting+=wait;stay+=duration;last=stop.id;
    }
    if(options.autoLunch){
      const lunch={id:'lunch-hall',stay:options.mealMinutes??40};
      const deadline=clock(options.lunchTime||'12:00')-clock(options.start);
      let hadLunch=false;
      // Preserve the chosen facility order, reserving the walk to lunch before accepting each stop.
      for(const stop of stops.filter(s=>s.id!=='lunch-hall'&&s.id!=='exit-meeting')){
        if(!hadLunch&&elapsed+segment(last,stop.id).minutes+(stop.stay||0)+segment(stop.id,lunch.id).minutes>deadline){append(lunch);hadLunch=true;}
        append(stop);
      }
      if(!hadLunch)append(lunch);
      append({id:'exit-meeting',stay:0});
    }else{
      for(const stop of stops)append(stop);
      if(options.returnGate&&stops.length)append({id:'gate',stay:0});
    }
    return {legs,stops:destinations,walk,stay,total:elapsed,waiting,measured:references.length>0,referenceCount:references.length};
  }

  const api={createGraph,shortest,plan};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlannerCore=api;
})(typeof window==='undefined'?globalThis:window);
