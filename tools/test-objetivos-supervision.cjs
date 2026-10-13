const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const model=require('../apps/objetivos-ventas-supervision/model.js');

test('la semana contiene lunes a sábado, incluso un domingo y al cruzar de año',()=>{
  assert.deepEqual(model.weekDates('2026-10-13'),['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17']);
  assert.deepEqual(model.weekDates('2026-10-18'),model.weekDates('2026-10-13'));
  assert.equal(model.weekDates('2027-01-01')[0],'2026-12-28');
});
test('cero informado cuenta, falta de datos no cuenta y no se suman ventas futuras',()=>{
  const store={goal:1000,monthPlan:[{date:'2026-10-12',target:100,amount:0},{date:'2026-10-13',target:200,amount:null},{date:'2026-10-14',target:300,amount:400}]};
  const summary=model.summarize(store,'2026-10-13');
  assert.equal(summary.month.sold,0);assert.equal(summary.month.target,100);assert.equal(summary.month.difference,-100);assert.equal(summary.month.count,1);assert.equal(summary.weekTotal.sold,0);
  assert.equal(model.summarize(store,'2026-10-14').missing,1);
});
test('un período sin ventas no produce un falso incumplimiento y otra semana no arrastra días del mes',()=>{
  const summary=model.summarize({goal:1000,monthPlan:[{date:'2026-10-01',target:100,amount:null}]},'2026-10-01');
  assert.equal(summary.month.percent,null);assert.equal(summary.month.count,0);assert.equal(summary.week[0].outsideMonth,true);
});
test('la API rechaza consultas no autenticadas antes de leer ventas y devuelve solo datos de consulta',()=>{
  const context={console};vm.createContext(context);
  vm.runInContext(fs.readFileSync('apps/objetivos-ventas-supervision/apps-script.gs','utf8'),context);
  let reads=0;
  context.readState_=()=> {reads++;return {month:'2026-10',updatedAt:null,sales:{}};};
  context.goalForStore_=()=> 1000;
  context.monthPlan_=()=> [{date:'2026-10-13',target:100,amount:null}];
  context.Utilities={formatDate:()=> '2026-10-13'};
  assert.throws(()=>context.getSupervisionDashboard('wrong'),/no es válido/);assert.equal(reads,0);
  const hash=vm.runInContext('SUPERVISION_PASSWORD_HASH',context);
  const data=context.getSupervisionDashboard(hash);
  assert.equal(data.role,'supervision');assert.equal(data.stores.length,9);assert.equal(reads,1);
  assert.ok(data.stores.every(store=>store.monthPlan.length===1));
  assert.ok(!JSON.stringify(data).includes('password'));assert.ok(!JSON.stringify(data).includes('email'));
});

test('el script independiente lee el archivo original sin crear ni escribir y mantiene el cálculo exacto',()=>{
  const original=fs.readFileSync('apps/objetivos-ventas/apps-script.gs','utf8');
  const standalone=fs.readFileSync('apps/objetivos-ventas-supervision/apps-script.gs','utf8');
  const FixedDate=class extends Date { constructor(...args){super(...(args.length?args:['2026-10-13T15:00:00Z']));} };
  const utilities={formatDate:(date,timezone,pattern)=>{
    const value=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    return pattern==='yyyy-MM'?value.slice(0,7):value;
  }};
  const first={Date:FixedDate,Utilities:utilities},second={Date:FixedDate,Utilities:utilities};
  vm.createContext(first);vm.createContext(second);vm.runInContext(original,first);vm.runInContext(standalone,second);
  const expectedId=vm.runInContext('APP.dataFileId',first);
  assert.equal(vm.runInContext('APP.dataFileId',second),expectedId);
  const state={month:'2026-10',goals:{castelli:4000000},sales:{castelli:[{date:'2026-10-10',amount:120000,targetAtStart:110000}]}};
  const snapshot=JSON.stringify(state);
  let reads=0;
  second.DriveApp={getFileById:id=>{assert.equal(id,expectedId);reads++;return {getBlob:()=>({getDataAsString:()=>snapshot})};}};
  const result=second.getSupervisionDashboard(vm.runInContext('SUPERVISION_PASSWORD_HASH',second));
  assert.equal(reads,1);assert.equal(JSON.stringify(state),snapshot);
  first.state=state;
  const expected=vm.runInContext('monthPlan_(state, APP.stores.find(s=>s.id==="castelli"), state.sales.castelli, state.goals.castelli)',first);
  assert.deepEqual(JSON.parse(JSON.stringify(result.stores.find(s=>s.id==='castelli').monthPlan)),JSON.parse(JSON.stringify(expected)));
  assert.equal(result.stores.find(s=>s.id==='castelli').goal,4000000);
  assert.ok(!/DriveApp\.(create|set|remove)|\.setContent\(|GmailApp|ScriptApp|function (initializeApp|updateSales|updateGoals|writeState_)/.test(standalone));
});

test('la API no admite acciones de edición ni callbacks inyectados y conserva el JSONP válido',()=>{
  const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('apps/objetivos-ventas-supervision/apps-script.gs','utf8'),context);
  context.ContentService={MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:content=>({content,setMimeType(type){return {content,type};}})};
  let reads=0;context.readState_=()=>{reads++;throw Error('No debe leer');};
  assert.equal(JSON.parse(context.doGet({parameter:{action:'updateSales'}}).content).ok,false);assert.equal(reads,0);
  assert.equal(context.doGet({parameter:{action:'supervisionDashboard',callback:'bad);alert(1)//'}}).type,'json');
  assert.match(context.doGet({parameter:{action:'supervisionDashboard',callback:'rioCallback'}}).content,/^rioCallback\(/);
});
