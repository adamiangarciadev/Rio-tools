window.RioStockRules = (() => {
'use strict';
const SITES=['Avellaneda 3249 + Web','Avellaneda 2900','Corrientes','Sarmiento','Quilmes','Castelli','Lamarca'];
const WEIGHTS={'Avellaneda 3249 + Web':3.25,'Avellaneda 2900':1.75,Corrientes:1,Sarmiento:1,Quilmes:1,Castelli:.2,Lamarca:.2};
const FIXED_LINE={Castelli:2,Lamarca:2};
function normalize(raw){
  return raw.records.map(r=>{const stock={},sales={};for(const site of SITES){if(site==='Avellaneda 3249 + Web'){stock[site]=positive(number(r.branches['Avellaneda 3249']?.[0])+number(r.branches.Web?.[0]));sales[site]=number(r.branches['Avellaneda 3249']?.[1])+number(r.branches.Web?.[1])}else{stock[site]=positive(r.branches[site]?.[0]);sales[site]=number(r.branches[site]?.[1])}}return{code:r.code,name:r.article,supplier:r.supplier,unit:r.unit,classification:r.classification,line:r.line,group:r.group,color:r.color,size:r.size,stock,sales,totalStock:Object.values(stock).reduce((a,b)=>a+b,0),totalSales:Object.values(sales).reduce((a,b)=>a+b,0)}})
}
function positive(v){return Math.max(0,Number(v)||0)}
function number(v){return Number(v)||0}
function roundTargets(raw,total){const entries=Object.entries(raw).map(([site,value])=>({site,n:Math.floor(value),fraction:value-Math.floor(value)}));let used=entries.reduce((a,x)=>a+x.n,0);entries.sort((a,b)=>b.fraction-a.fraction);for(const x of entries){if(used>=total)break;x.n++;used++}return Object.fromEntries(entries.map(x=>[x.site,x.n]))}
function weighted(total,sites){const w=sites.reduce((a,s)=>a+(WEIGHTS[s]||0),0);return roundTargets(Object.fromEntries(sites.map(s=>[s,w?total*WEIGHTS[s]/w:0])),total)}
function isLine(v){return /(^|\s)LINEA(\s|$)/i.test(`${v.classification} ${v.line}`)}
function isPromotionUnit(v){return String(v.unit||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().startsWith('PRO ARTICULO EN PROMOCION')}
function targets(v, priority){
  const total=Math.floor(v.totalStock);let target;
  if(isLine(v)&&!isPromotionUnit(v)&&total>=4){const fixedSites=SITES.filter(s=>FIXED_LINE[s]!=null),fixedTotal=fixedSites.reduce((a,s)=>a+FIXED_LINE[s],0);if(total>=fixedTotal){target=Object.fromEntries(SITES.map(s=>[s,FIXED_LINE[s]||0]));Object.assign(target,weighted(total-fixedTotal,SITES.filter(s=>FIXED_LINE[s]==null)))}else target=weighted(total,SITES.filter(s=>FIXED_LINE[s]==null))}else target=weighted(total,SITES);
  const main='Avellaneda 3249 + Web';if(priority&&total>=5&&(target[main]||0)<5){let pending=5-(target[main]||0);target[main]=5;for(const site of SITES.filter(s=>s!==main).sort((a,b)=>WEIGHTS[a]-WEIGHTS[b])){const take=Math.min(target[site]||0,pending);target[site]-=take;pending-=take;if(!pending)break}}
  return target;
}
function compute(v, priority=true){const target=targets(v, priority),donors=[],receivers=[];for(const site of SITES){const diff=(v.stock[site]||0)-(target[site]||0);if(diff>0)donors.push({site,qty:diff});if(diff<0)receivers.push({site,qty:-diff})}receivers.sort((a,b)=>WEIGHTS[b.site]-WEIGHTS[a.site]);donors.sort((a,b)=>WEIGHTS[a.site]-WEIGHTS[b.site]);const moves=[];for(const to of receivers)for(const from of donors){if(to.qty<=0)break;if(from.qty<=0)continue;const qty=Math.min(to.qty,from.qty);moves.push({from:from.site,to:to.site,qty});from.qty-=qty;to.qty-=qty}return{variant:v,current:v.stock,target,moves}}
return { SITES, normalize, compute };
})();
