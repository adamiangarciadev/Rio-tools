(function(root){
 'use strict';
 const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v||0));
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function amount(value){const n=Number(String(value).trim().replace(/\./g,'').replace(',','.'));if(!Number.isFinite(n)||n<0||n>999999999)throw new Error('Ingresá un importe válido, sin signo negativo.');return Math.round(n*100)/100;}
 function groups(rows){const map=new Map();for(const r of rows){let g=map.get(r.staff_code);if(!g){g={code:r.staff_code,name:r.staff_name,total:0,approved:0,merchandise:0,rows:[]};map.set(r.staff_code,g);}g.total+=Number(r.requested_cash);g.approved+=Number(r.approved_cash||0);g.merchandise+=Number(r.approved_merchandise||0);g.rows.push(r);}return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));}
 const api={money,today,amount,groups,requestAlert:r=>Number(r.requested_cash)>100000,monthlyAlert:g=>g.total>500000,exportRows:(rows,onlyHigh)=>rows.filter(r=>!onlyHigh||Number(r.requested_cash)>100000)};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RioValesModel=api;
})(globalThis);
