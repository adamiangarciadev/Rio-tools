/* Picking is independent of receipt confirmation. One draft per branch/remito. */
((root)=>{
 'use strict';
 const normalize=v=>String(v??'').trim().toUpperCase();
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function csv(text){
  const first=text.replace(/^\uFEFF/,'').split(/\r?\n/,1)[0];
  const delimiter=[';',',','\t','|'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
   else if(c===delimiter&&!quoted){row.push(cell.trim());cell='';}
   else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
   else cell+=c;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return rows.slice(1);
 }
 function makeIndex(texts){
  const map=new Map();map.variants=new Map();map.conflicts=new Set();
  const rows=texts.flatMap(csv),coded=rows.filter(r=>r.length===6),legacy=rows.filter(r=>r.length===4);
  const identity=v=>[v.articulo,v.codigo_color??v.color,v.codigo_talle??v.talle].map(normalize).join('!');
  const descriptions=new Map();
  function add(key,value){key=normalize(key);if(!key)return;if(map.has(key)&&(!map.get(key)||identity(map.get(key))!==identity(value))){map.set(key,null);map.conflicts.add(key);}else if(!map.has(key))map.set(key,value);}
  for(const row of coded){
   const value={articulo:row[1],color:row[3]||row[2],talle:row[5]||row[4],codigo_color:row[2],codigo_talle:row[4]};
   if(![value.articulo,value.codigo_color,value.codigo_talle].every(v=>normalize(v)))continue;
   map.variants.set(identity(value),value);
   const desc=[value.articulo,value.color,value.talle].map(normalize).join('!');
   if(descriptions.has(desc)&&identity(descriptions.get(desc)||{})!==identity(value))descriptions.set(desc,null);else if(!descriptions.has(desc))descriptions.set(desc,value);
   add(row[0],value);add([value.articulo,value.codigo_talle,value.codigo_color].join('!'),value);
  }
  legacy.sort((a,b)=>Number(b[0].includes('!'))-Number(a[0].includes('!')));
  for(const row of legacy){
   const parts=normalize(row[0]).split('!');let value;
   if(parts.length===3){
    value=map.variants.get(parts.join('!'))||map.variants.get([parts[0],parts[2],parts[1]].join('!'));
    if(!value)value={articulo:parts[0],codigo_color:parts[1],codigo_talle:parts[2],color:row[2]||parts[1],talle:row[3]||parts[2]};
   }else value=descriptions.get([row[1],row[2],row[3]].map(normalize).join('!'));
   if(!value&&!coded.length)value={articulo:row[1]||'',color:row[2]||'',talle:row[3]||''};
   if(!value)continue;
   const desc=[value.articulo,value.color,value.talle].map(normalize).join('!');
   if(!descriptions.has(desc))descriptions.set(desc,value);
   add(row[0],value);
   if(parts.length===3){map.variants.set(identity(value),value);add([value.articulo,value.codigo_talle,value.codigo_color].join('!'),value);}
  }
  return map;
 }
 function compare(items,scans,index){
  const tuple=row=>[row.articulo,row.codigo_color??row.color,row.codigo_talle??row.talle].map(normalize);
  const key=row=>JSON.stringify(tuple(row));
  const entries=new Map(), unknown=new Map();
  for(const item of items||[]){
   const source=tuple(item);
   const equivalent=index.variants?.size?index.variants.get(source.join('!')):index.get(source.join('!'));
   const canonical=equivalent&&tuple(equivalent).every(Boolean)?equivalent:item;
   const id=key(canonical), quantity=Number(item.cantidad);
   if(!tuple(item).every(Boolean)||!Number.isFinite(quantity)||quantity<0) return {status:'REVISAR',rows:[],unknown:[],error:'El detalle del remito no permite una comparación confiable.'};
   const entry=entries.get(id)||{articulo:canonical.articulo,color:canonical.color,talle:canonical.talle,codigo_color:canonical.codigo_color,codigo_talle:canonical.codigo_talle,esperado:0,escaneado:0};
   entry.esperado+=quantity;entries.set(id,entry);
  }
  if(!entries.size)return {status:'REVISAR',rows:[],unknown:[],error:'El remito no tiene detalle para comparar.'};
  for(const code of scans){
   const match=index.get(normalize(code));
   if(!match||!tuple(match).every(Boolean)){unknown.set(code,(unknown.get(code)||0)+1);continue;}
   const id=key(match),entry=entries.get(id)||{articulo:match.articulo,color:match.color,talle:match.talle,codigo_color:match.codigo_color,codigo_talle:match.codigo_talle,esperado:0,escaneado:0};
   entry.escaneado++;entries.set(id,entry);
  }
  const rows=[...entries.values()].map(row=>({...row,diferencia:row.escaneado-row.esperado}));
  return {status:unknown.size||rows.some(row=>row.diferencia!==0)?'DIFERENCIAS':'OK',rows,unknown:[...unknown].map(([codigo,cantidad])=>({codigo,cantidad,motivo:index.conflicts?.has(normalize(codigo))?'Equivalencias en conflicto':'Sin equivalencia'}))};
 }
 function eligible(r,branch){return ['RECIBIDO EN SUCURSAL','DIFERENCIAS'].includes(r?.estado)&&!!branch&&normalize(r.data.hacia)===normalize(branch);}
 function filename(remito,branch,code){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'2-digit',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const date=['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('');return `${date} REM${remito} ${branch} PICKING RESP${code}`.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.txt';}
 const api={eligible,csv,makeIndex,filename,compare};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
 root.MT2Picking=api;
 let record,branch,scans=[],index,pendingIndex,dialog,saveCopy,revision=0;
 const $=id=>document.getElementById(id);
 const key=()=>`mt2-picking:${branch}:${record.id}`;
 function persist(){try{localStorage.setItem(key(),JSON.stringify({scans,codigo:$('pick-code').value,revision}));}catch{$('pick-note').textContent='El navegador no pudo guardar el borrador. No cierres esta pestaña.';}}
 function render(){
  $('pick-count').textContent=`${scans.length} prendas escaneadas · Remito: ${record.data.total_prendas} prendas`;
  const counts=new Map();let unknown=0;
  for(const code of scans){const row=index?.get(normalize(code));if(!row)unknown++;const label=row?[row.articulo,row.color,row.talle].join(' · '):'SIN EQUIVALENCIA: '+code;counts.set(label,(counts.get(label)||0)+1);}
  $('pick-counter').innerHTML=Array.from(counts,([label,n])=>`<tr><td>${escape(label)}</td><td>${n}</td></tr>`).join('');
  $('pick-list').innerHTML=scans.map((code,i)=>`<div class="pick-row"><span>${index?.get(normalize(code))?'✓':'⚠'} ${escape(code)}</span><button type="button" data-remove="${i}" aria-label="Eliminar lectura ${i+1}">Eliminar</button></div>`).reverse().join('');
  const result=index?compare(record.data.items,scans,index):null;
  if(result){$('pick-counter').innerHTML=result.rows.map(r=>`<tr><td>${escape([r.articulo,r.color,r.talle].join(' · '))}</td><td>${r.escaneado} / ${r.esperado} · ${r.diferencia===0?'OK':r.diferencia>0?'Sobran '+r.diferencia:'Faltan '+(-r.diferencia)}</td></tr>`).join('');}
  $('pick-warning').textContent=(result?'Control: '+result.status+'. '+(result.error||'')+' ':'')+(unknown?`${unknown} lecturas sin equivalencia. Revisalas antes de descargar; se incluyen en el TXT.`:'');
  $('pick-download').disabled=!index||!scans.length;
 }
 async function loadIndex(){
  if(index)return;if(pendingIndex)return pendingIndex;
  pendingIndex=(async()=>{
   const base=root.MT2_API?'../../data/':'/data/';
   const texts=await Promise.all(['equivalenciacod.csv','equivalencia2.csv','equivalencia.csv'].map(async name=>{
    const r=await fetch(base+name,{cache:'no-cache',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('No se pudieron cargar las equivalencias. Cerrá y volvé a abrir el picking.');
    const bytes=await r.arrayBuffer();let text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\ufffd'))text=new TextDecoder('windows-1252').decode(bytes);return text;
   }));index=makeIndex(texts);if(!index.size){index=null;throw Error('Las equivalencias están vacías');}
  })().finally(()=>{pendingIndex=null;});return pendingIndex;
 }
 function scan(){
  const code=$('pick-scan').value.trim();if(!code)return;
  if(!index){$('pick-note').textContent='Esperá a que se carguen las equivalencias.';return;}
  if(code.length>100||/[\r\n\x00-\x1f]/.test(code)){$('pick-note').textContent='Código inválido';return;}
  if(scans.length>=5000){$('pick-note').textContent='Límite de 5000 lecturas. No se eliminó ninguna lectura anterior.';return;}
  scans.push(code);revision++;$('pick-scan').value='';$('pick-note').textContent=index.get(normalize(code))?'Lectura registrada: '+code:index.conflicts.has(normalize(code))?'Equivalencias en conflicto: '+code:'Sin equivalencia: '+code;render();persist();$('pick-scan').focus();
 }
 function mount(){
  dialog=document.createElement('dialog');dialog.id='picking-dialog';dialog.style.width='min(1000px,94vw)';dialog.setAttribute('aria-labelledby','pick-title');
  dialog.innerHTML=`<div class="dialog-head"><h2 id="pick-title">Realizar picking</h2><button type="button" id="pick-close" aria-label="Cerrar picking">✕</button></div><p id="pick-remito"></p><p class="muted">Al guardar, el picking y su TXT quedan disponibles desde cualquier equipo. Las lecturas sin guardar son un borrador de este navegador.</p><label>Código de personal<input id="pick-code" maxlength="30" autocomplete="off" required></label><form id="pick-scan-form"><label>Escanear código<input id="pick-scan" autocomplete="off" maxlength="100" placeholder="Escaneá y presioná Enter"></label><button type="submit" id="pick-add">Agregar lectura</button></form><p id="pick-note" role="status"></p><p id="pick-count"></p><p id="pick-warning" role="status"></p><div class="table-wrap"><table><thead><tr><th>Artículo · Color · Talle</th><th>Escaneados</th></tr></thead><tbody id="pick-counter"></tbody></table></div><div id="pick-list" style="max-height:240px;overflow:auto"></div><div class="pagination"><button type="button" id="pick-clear">Limpiar lecturas</button><button type="button" id="pick-download" class="btn primary">Guardar y descargar TXT</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('cancel',e=>{if($('pick-close').disabled)e.preventDefault();});
  $('pick-close').onclick=()=>dialog.close();
  $('pick-code').oninput=persist;
  $('pick-scan-form').onsubmit=e=>{e.preventDefault();scan();};
  $('pick-list').onclick=e=>{const b=e.target.closest('[data-remove]');if(!b)return;scans.splice(Number(b.dataset.remove),1);revision++;render();persist();};
  $('pick-clear').onclick=()=>{if(scans.length&&!confirm('¿Limpiar las lecturas de este remito?'))return;scans=[];revision++;render();persist();};
  $('pick-download').onclick=async()=>{
   const codigo=$('pick-code').value.trim();if(!codigo){$('pick-code').reportValidity();$('pick-code').focus();return;}
   if(!scans.length||!index)return;
   const button=$('pick-download');const controls=[...dialog.querySelectorAll('input,button')];controls.forEach(c=>c.disabled=true);
   try{
    const payload={id:record.id,version:record.version,branch,codigo,scans:[...scans],request_id:crypto.randomUUID()};
    if(!saveCopy)throw Error('El guardado compartido no está disponible.');
    const saved=await saveCopy(payload);record.version=saved.version;record.picking=saved.picking;
    const blob=new Blob([payload.scans.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename(record.data.remito,branch,codigo);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('pick-note').textContent=saveCopy?'Picking guardado y TXT descargado. El remito conserva su estado.':'TXT descargado. El remito conserva su estado.';
   }catch(e){$('pick-note').textContent='No se completó la operación: '+e.message;}finally{controls.forEach(c=>c.disabled=false);render();}
  };
 }
 async function sharedRequest(op,data){const res=await fetch(root.MT2_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,op}),signal:AbortSignal.timeout(90000)});const json=await res.json();if(!res.ok)throw Error(json.error||'No se pudo consultar');return json;}
 api.downloadSaved=async(id,remito)=>{try{const {picking}=await sharedRequest('picking_get',{id});if(!picking)throw Error('Este remito no tiene picking guardado');const url=URL.createObjectURL(new Blob([picking.scans.join('\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename(remito,picking.branch,picking.codigo);a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){alert(e.message);}};
 api.open=async(r,selected,save)=>{
  if(!eligible(r,selected))return;
  if(!dialog)mount();record=r;branch=selected;saveCopy=save;scans=[];revision=0;$('pick-code').value='';$('pick-scan').value='';
  try{const shared=await sharedRequest('picking_get',{id:r.id});if(shared.picking){scans=shared.picking.scans;$('pick-code').value=shared.picking.codigo;}}catch(e){throw Error('No se pudo consultar el picking compartido: '+e.message);}
  try{const draft=JSON.parse(localStorage.getItem(key()));if(!scans.length&&Array.isArray(draft?.scans)&&draft.scans.length<=5000&&draft.scans.every(c=>typeof c==='string'&&c.length<=100)){scans=draft.scans;$('pick-code').value=String(draft.codigo||'').slice(0,30);revision=draft.revision||0;}}catch{}
  $('pick-remito').textContent=`Remito ${r.data.remito} · ${selected}`;$('pick-note').textContent='Cargando equivalencias…';$('pick-add').disabled=true;render();dialog.showModal();
  try{await loadIndex();render();$('pick-add').disabled=false;$('pick-note').textContent='Listo para escanear. Cada Enter agrega una prenda.';$('pick-scan').focus();}catch(e){$('pick-note').textContent=e.message;}
 };
})(typeof window==='undefined'?{}:window);
