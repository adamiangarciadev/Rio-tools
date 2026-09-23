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
 function makeIndex(texts){const map=new Map();for(const text of texts)for(const row of csv(text)){const key=normalize(row[0]);if(key&&!map.has(key))map.set(key,{articulo:row[1]||'',color:row[2]||'',talle:row[3]||''});}return map;}
 function eligible(r,branch){return r?.estado==='RECIBIDO EN SUCURSAL'&&!!branch&&normalize(r.data.hacia)===normalize(branch);}
 function filename(remito,branch,code){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'2-digit',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const date=['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('');return `${date} REM${remito} ${branch} PICKING RESP${code}`.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.txt';}
 const api={eligible,csv,makeIndex,filename};
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
  $('pick-list').innerHTML=scans.map((code,i)=>`<div class="pick-row"><span>${index?.has(normalize(code))?'✓':'⚠'} ${escape(code)}</span><button type="button" data-remove="${i}" aria-label="Eliminar lectura ${i+1}">Eliminar</button></div>`).reverse().join('');
  $('pick-warning').textContent=unknown?`${unknown} lecturas sin equivalencia. Revisalas antes de descargar; se incluyen en el TXT.`:'';
  $('pick-download').disabled=!index||!scans.length;
 }
 async function loadIndex(){
  if(index)return;if(pendingIndex)return pendingIndex;
  pendingIndex=(async()=>{
   const base=root.MT2_API?'../../data/':'/data/';
   const texts=await Promise.all(['equivalencia.csv','equivalencia2.csv'].map(async name=>{
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
  scans.push(code);revision++;$('pick-scan').value='';$('pick-note').textContent=index.has(normalize(code))?'Lectura registrada: '+code:'Sin equivalencia: '+code;render();persist();$('pick-scan').focus();
 }
 function mount(){
  dialog=document.createElement('dialog');dialog.id='picking-dialog';dialog.style.width='min(1000px,94vw)';dialog.setAttribute('aria-labelledby','pick-title');
  dialog.innerHTML=`<div class="dialog-head"><h2 id="pick-title">Realizar picking</h2><button type="button" id="pick-close" aria-label="Cerrar picking">✕</button></div><p id="pick-remito"></p><p class="muted">Borrador guardado en este navegador por remito. Descargar no confirma la recepción ni cambia el estado.</p><label>Código de personal<input id="pick-code" maxlength="30" autocomplete="off" required></label><form id="pick-scan-form"><label>Escanear código<input id="pick-scan" autocomplete="off" maxlength="100" placeholder="Escaneá y presioná Enter"></label><button type="submit" id="pick-add">Agregar lectura</button></form><p id="pick-note" role="status"></p><p id="pick-count"></p><p id="pick-warning" role="status"></p><div class="table-wrap"><table><thead><tr><th>Artículo · Color · Talle</th><th>Escaneados</th></tr></thead><tbody id="pick-counter"></tbody></table></div><div id="pick-list" style="max-height:240px;overflow:auto"></div><div class="pagination"><button type="button" id="pick-clear">Limpiar lecturas</button><button type="button" id="pick-download" class="btn primary">Descargar TXT</button></div>`;
  document.body.append(dialog);
  $('pick-close').onclick=()=>dialog.close();
  $('pick-code').oninput=persist;
  $('pick-scan-form').onsubmit=e=>{e.preventDefault();scan();};
  $('pick-list').onclick=e=>{const b=e.target.closest('[data-remove]');if(!b)return;scans.splice(Number(b.dataset.remove),1);revision++;render();persist();};
  $('pick-clear').onclick=()=>{if(scans.length&&!confirm('¿Limpiar las lecturas de este remito?'))return;scans=[];revision++;render();persist();};
  $('pick-download').onclick=async()=>{
   const codigo=$('pick-code').value.trim();if(!codigo){$('pick-code').reportValidity();$('pick-code').focus();return;}
   if(!scans.length||!index)return;
   const button=$('pick-download');button.disabled=true;
   try{
    const payload={id:record.id,version:record.version,branch,codigo,scans:[...scans],request_id:crypto.randomUUID()};
    if(saveCopy)await saveCopy(payload);
    const blob=new Blob([payload.scans.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename(record.data.remito,branch,codigo);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('pick-note').textContent=saveCopy?'Picking guardado y TXT descargado. El remito conserva su estado.':'TXT descargado. El remito conserva su estado.';
   }catch(e){$('pick-note').textContent='No se completó la operación: '+e.message;}finally{button.disabled=false;}
  };
 }
 api.open=async(r,selected,save)=>{
  if(!eligible(r,selected))return;
  if(!dialog)mount();record=r;branch=selected;saveCopy=save;scans=[];revision=0;$('pick-code').value='';$('pick-scan').value='';
  try{const draft=JSON.parse(localStorage.getItem(key()));if(Array.isArray(draft?.scans)&&draft.scans.length<=5000&&draft.scans.every(c=>typeof c==='string'&&c.length<=100)){scans=draft.scans;$('pick-code').value=String(draft.codigo||'').slice(0,30);revision=draft.revision||0;}}catch{}
  $('pick-remito').textContent=`Remito ${r.data.remito} · ${selected}`;$('pick-note').textContent='Cargando equivalencias…';$('pick-add').disabled=true;render();dialog.showModal();
  try{await loadIndex();render();$('pick-add').disabled=false;$('pick-note').textContent='Listo para escanear. Cada Enter agrega una prenda.';$('pick-scan').focus();}catch(e){$('pick-note').textContent=e.message;}
 };
})(typeof window==='undefined'?{}:window);
