(() => {
 'use strict';
 const $=id=>document.getElementById(id), M=CajaControl, config=CajaConfig;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n)||0);
 const date=value=>new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 let rows=[],loadVersion=0,detailVersion=0;
 $('month').value=M.today().slice(0,7);
 for(const branch of M.branches)$('branch').add(new Option(M.label(branch),branch));
 function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
 async function request(payload){const response=await fetch(config.url+'/functions/v1/movimientos-caja-api',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+config.gatewayKey,'Content-Type':'application/json'},body:JSON.stringify({...payload,branch:'ADMINISTRACION'}),signal:AbortSignal.timeout(25000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo consultar los cierres.');return result;}
 function render(){
  const month=$('month').value, selected=$('branch').value;
  const visible=rows.filter(r=>!selected||r.branch===selected), current=visible.filter(r=>r.business_date.startsWith(month));
  const locales=new Set(current.filter(r=>r.branch!=='WEB').map(r=>r.branch));
  $('metrics').innerHTML=[['CIERRES DEL MES',current.length],['LOCALES CON CIERRES',locales.size],['ÚLTIMO CIERRE',current[0]?date(current[0].business_date):'—']].map(([label,value])=>'<article><small>'+label+'</small><strong>'+esc(value)+'</strong></article>').join('');
  $('previousNotice').hidden=!visible.some(r=>!r.business_date.startsWith(month));
  $('groups').innerHTML='<div class="branch-groups">'+M.branches.filter(b=>!selected||b===selected).map(branch=>{
   const list=visible.filter(r=>r.branch===branch);
   return '<section class="branch-group"><header class="branch-header"><h2>'+esc(M.label(branch))+'</h2><small>'+list.length+' '+(list.length===1?'cierre':'cierres')+'</small></header>'+(list.length?'<div class="sheet-cards">'+list.map(r=>{
    const c=M.card(r);return '<button class="sheet-card" type="button" data-sheet="'+esc(r.id)+'" aria-label="Ver planilla de '+esc(M.label(branch))+' del '+date(r.business_date)+'"><span class="card-date">'+date(r.business_date)+'</span>'+(!r.business_date.startsWith(month)?'<span class="previous-badge">ÚLTIMO DÍA DEL MES ANTERIOR</span>':'')+'<span class="card-responsible">'+esc(r.responsible||'SIN RESPONSABLE')+'</span><dl class="card-amounts"><div><dt>EFECTIVO AL CIERRE</dt><dd '+(c.cash===null?'class="cash-web"':'')+'>'+(c.cash===null?'COMPARTIDO CON AVELLANEDA':money(c.cash))+'</dd>'+(c.shared?'<div class="cash-note">TOTAL CAJA FÍSICA · LOCAL + WEB</div>':'')+'</div><div><dt>'+(branch==='AV2'&&c.shared?'VENTA LOCAL SIN ENVÍOS':'VENTA SIN ENVÍOS')+'</dt><dd>'+money(c.sale)+'</dd></div></dl><span class="card-footer"><span>'+(c.difference?'<span class="difference">'+(c.difference>0?'SOBRANTE ':'FALTANTE ')+money(Math.abs(c.difference))+'</span>':'CIERRE GUARDADO')+'</span><span>Ver planilla →</span></span></button>';
   }).join('')+'</div>':'<p class="empty">No hay cierres guardados para esta sucursal en el mes seleccionado.</p>')+'</section>';
  }).join('')+'</div>';
 }
 async function load(){
  const month=$('month').value;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){status('Elegí un mes válido.',true);return;}
  const version=++loadVersion;$('refresh').disabled=true;$('groups').setAttribute('aria-busy','true');rows=[];render();status('Consultando cierres guardados…');
  try{const result=await request({action:'admin_list',month,includePrevious:M.monthRange(month).includePrevious});if(version!==loadVersion)return;rows=result;render();status(rows.length?'Cierres actualizados. Tocá una ficha para abrir su planilla.':'Todavía no hay cierres guardados en el período seleccionado.');}
  catch(e){if(version!==loadVersion)return;status(e.message,true);}
  finally{if(version===loadVersion){$('refresh').disabled=false;$('groups').removeAttribute('aria-busy');}}
 }
 function moveMonth(delta){const [y,m]=$('month').value.split('-').map(Number);if(!y||!m)return;const next=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);if(next<'1900-01'||next>'2200-12')return;$('month').value=next;load();}
 function table(headers,values){if(!values.length)return '<p class="detail-empty">SIN MOVIMIENTOS</p>';return '<div class="detail-table"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+values.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
 function unit(data,title){
  const section=(name,headers,values)=>'<section class="detail-section"><h4>'+name+'</h4>'+table(headers,values)+'</section>';
  return '<section class="detail-unit"><h3>'+esc(title)+'</h3><div class="unit-meta"><strong>RESPONSABLE:</strong> '+esc(data.responsible)+(data.responsibleCode?' · LEGAJO '+esc(data.responsibleCode):'')+'<br><strong>MP:</strong> '+money(data.mp)+' · <strong>TARJETAS:</strong> '+money(data.cards)+' · <strong>GO CUOTAS:</strong> '+money(data.go)+'</div>'+section('GASTOS',['Concepto / detalle','Monto'],(data.expenses||[]).map(r=>[r.name,money(r.amount)]))+section('VALES',['Nombre / legajo','Tipo','Monto','Firma / conformidad'],(data.vouchers||[]).map(r=>[r.name+(r.staffCode?' · '+r.staffCode:''),r.kind==='goods'?'MERCADERÍA':'EFECTIVO',money(r.amount),r.signature||'']))+section('RETIROS',['Nombre','Monto','Firma / conformidad'],(data.withdrawals||[]).map(r=>[r.name,money(r.amount),r.signature||'']))+section('DEPÓSITOS / TRANSFERENCIAS',['Nombre','Cuenta de origen','Monto'],(data.deposits||[]).map(r=>[r.name,r.account==='other'?r.otherAccount:r.account||'',money(r.amount)]))+section('ENVÍOS',['Envío','Efectivo','Depósito / MP','Total'],(data.shipping||[]).map(r=>[r.name,money(r.cash),money(r.digital),money(Math.round((Number(r.cash||0)+Number(r.digital||0))*100)/100)]))+'<section class="detail-section"><h4>OBSERVACIONES</h4><div class="unit-notes">'+esc(data.notes||'SIN OBSERVACIONES')+'</div></section></section>';
 }
 function detailHTML(r){
  const d=r.data,t=r.totals||{},shared=r.branch==='AV2'&&d.sharedDrawer&&d.webClose?.data;
  const list=[['F9 '+(shared?'LOCAL':M.label(r.branch)),shared?t.localSaleTotal:t.saleTotal],['VENTA '+(shared?'LOCAL ':'')+'SIN ENVÍOS',shared?t.localFinal:t.final]];
  if(shared)list.push(['F9 WEB INCORPORADO',t.webSaleTotal],['VENTA WEB SIN ENVÍOS',t.webFinal],['VENTA FINAL LOCAL + WEB',t.final]);
  if(r.branch!=='WEB')list.push(['EFECTIVO CONTADO'+(shared?' · COMPARTIDO':''),d.counted],['SOBRANTE',t.surplus],['FALTANTE',t.shortage]);
  list.push(['ENVÍOS'+(shared?' · LOCAL + WEB':''),t.shipping]);
  let warning='';
  if(shared){const currentWeb=rows.find(x=>x.branch==='WEB'&&x.business_date===r.business_date);if(currentWeb&&currentWeb.version!==d.webClose.version)warning='<p class="detail-warning">WEB tiene una versión posterior a la incorporada en este cierre. Se muestra la planilla guardada por Avellaneda, con WEB versión '+esc(d.webClose.version)+'. Revisá el cierre antes de comparar ambos.</p>';}
  const savedAt=r.updated_at?new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(r.updated_at)):'';
  return '<div class="detail-meta"><span><strong>FECHA:</strong> '+date(r.business_date)+'</span><span><strong>VERSIÓN:</strong> '+esc(r.version)+'</span>'+(savedAt?'<span><strong>GUARDADO:</strong> '+esc(savedAt)+'</span>':'')+'</div>'+warning+(r.branch==='WEB'?'<p class="detail-warning">El efectivo físico de WEB se cuenta en Avellaneda. Este cierre no tiene un arqueo físico independiente.</p>':'')+'<dl class="detail-totals">'+list.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+money(value)+'</dd></div>').join('')+'</dl>'+unit(d,shared?'MOVIMIENTOS LOCAL':M.label(r.branch))+(shared?unit(d.webClose.data,'MOVIMIENTOS WEB INCORPORADOS · VERSIÓN '+d.webClose.version):'');
 }
 async function openDetail(id){
  const row=rows.find(r=>r.id===id);if(!row)return;const version=++detailVersion;
  $('detailTitle').textContent=M.label(row.branch)+' · '+date(row.business_date);$('detailContent').textContent='Cargando planilla completa…';$('detailContent').setAttribute('aria-busy','true');$('detail').showModal();
  try{const result=await request({action:'admin_get',id});if(version!==detailVersion||!$('detail').open)return;if(!result[0])throw new Error('Esta planilla ya no está disponible. Actualizá el listado.');$('detailContent').innerHTML=detailHTML(result[0]);}
  catch(e){if(version===detailVersion)$('detailContent').textContent=e.message;}
  finally{if(version===detailVersion)$('detailContent').removeAttribute('aria-busy');}
 }
 $('groups').addEventListener('click',e=>{const button=e.target.closest('[data-sheet]');if(button)openDetail(button.dataset.sheet);});
 $('closeDetail').onclick=()=>$('detail').close();$('detail').addEventListener('close',()=>{detailVersion++;});
 $('month').onchange=load;$('branch').onchange=render;$('refresh').onclick=load;$('previous').onclick=()=>moveMonth(-1);$('next').onclick=()=>moveMonth(1);$('current').onclick=()=>{$('month').value=M.today().slice(0,7);load();};
 load();
})();
