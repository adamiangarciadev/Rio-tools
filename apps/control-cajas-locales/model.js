(function(root){
 'use strict';
 const branches=['AV2','NAZCA','LAMARCA','CORRIENTES','CASTELLI','QUILMES','SARMIENTO','PUEYRREDON','WEB'];
 const labels={AV2:'AVELLANEDA 2',NAZCA:'AVELLANEDA 2900',PUEYRREDON:'PUEYRREDÓN'};
 const label=branch=>labels[branch]||branch;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function monthRange(month,date=today()){
  const [y,m]=month.split('-').map(Number);const start=new Date(Date.UTC(y,m-1,1));
  const previous=date.slice(0,7)===month&&date.endsWith('-01');if(previous)start.setUTCDate(0);
  return {start:start.toISOString().slice(0,10),end:new Date(Date.UTC(y,m,1)).toISOString().slice(0,10),includePrevious:previous};
 }
 function card(row){const t=row.totals||{};const shared=row.branch==='AV2'&&row.shared_drawer===true;
  return {sale:shared&&t.localFinal!==undefined?Number(t.localFinal):Number(t.final||0),cash:row.branch==='WEB'?null:Number(row.cash_counted||0),shared,difference:row.branch==='WEB'?0:Number(t.difference||0)};
 }
 root.CajaControl={branches,label,today,monthRange,card};if(typeof module!=='undefined')module.exports=root.CajaControl;
})(typeof window!=='undefined'?window:globalThis);
