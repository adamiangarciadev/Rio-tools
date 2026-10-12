/* Picking UI. All durable mutations finish before the screen acknowledges them. */
(() => {
  'use strict';
  const D=PickDomain,$=s=>document.querySelector(s),cfg=window.PICKING_V2_CONFIG;
  const demo=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).get('demo')==='1';
  const store=PickStorage.create(Dexie,demo?'rio-picking-v2-demo':'rio-picking-v2');
  const apiUrl=demo?'/api':cfg.apiUrl;
  let current=null,catalog=new Map(),catalogVersion='',catalogReady=false,token='',health=null,remoteHistory=[],syncBusy=false,autoTimer=null,limit=60,serial=Promise.resolve(),ready=false;
  let audio=null,pendingWrites=0,failedReads=[];
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=n=>new Date(n).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'});
  const idMonth=()=>new Date().toISOString().slice(0,7).replace('-','');
  const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  function note(text,kind=''){const el=$('#notice');el.textContent=text;el.className='notice '+kind;}
  function beep(ok){try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);osc.frequency.value=ok?850:240;gain.gain.value=.035;osc.start();osc.stop(audio.currentTime+.1);}catch{}}
  function enqueue(action){pendingWrites++;serial=serial.then(action).catch(async error=>{beep(false);note(error.message||'No se pudo conservar el cambio.','error');if(current){current=await store.get(current.id).catch(()=>current);render();}}).finally(()=>{pendingWrites--;});return serial;}
  function meta(){return {responsable:$('#responsable').value,origen:$('#origen').value,destino:$('#destino').value,bultos:Number($('#bultos').value)};}
  function info(code){return catalog.get(code.trim().toUpperCase())||D.parseVariant(code)||null;}
  function normalizeHeading(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_]/g,'');}
  async function loadCatalog(){
    try{
      const sources=await Promise.all(cfg.catalog.map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('No se pudo cargar '+url);const bytes=await r.arrayBuffer();let text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\ufffd'))text=new TextDecoder('windows-1252').decode(bytes);return text;}));
      const index=new Map();
      sources.forEach(text=>{const parsed=Papa.parse(text,{skipEmptyLines:'greedy',delimiter:''});if(parsed.errors.length)throw Error('Una equivalencia contiene errores de formato.');const rows=parsed.data,headers=rows.shift().map(normalizeHeading);const codeColumn=headers.findIndex(h=>['codigo','codigo_barras','barcode','ean'].includes(h));const articleColumn=headers.findIndex(h=>h.includes('articulo'));if(codeColumn<0||articleColumn<0||!rows.length)throw Error('Faltan columnas de código/artículo en las equivalencias.');const descriptions=headers.map((h,i)=>h.includes('descripcion')?i:-1).filter(i=>i>=0);rows.forEach(row=>{const code=String(row[codeColumn]||'').trim().toUpperCase();if(code&&!index.has(code))index.set(code,{article:row[articleColumn]||code,color:row[descriptions[0]]||'',size:row[descriptions[1]]||''});});});
      catalog=index;catalogVersion=(await sha(sources.join('\n---RIO---\n'))).slice(0,32);catalogReady=true;$('#catalogState').textContent=index.size.toLocaleString('es-AR')+' códigos · catálogo completo';$('#catalogState').className='chip ok';
    }catch(e){catalogReady=false;$('#catalogState').textContent='Catálogo incompleto';$('#catalogState').className='chip danger';note(e.message+' Podés conservar el borrador; el cierre queda bloqueado hasta cargar ambos CSV.','error');}
    render();
  }
  function render(){
    if(!current)return;
    const editable=current.state==='DRAFT';
    ['responsable','origen','destino','bultos'].forEach(k=>{if(document.activeElement!==$('#'+k))$('#'+k).value=current.meta[k];$('#'+k).disabled=!editable;});
    $('#scanInput').disabled=!editable||failedReads.length>0;$('#addScan').disabled=!editable||failedReads.length>0;$('#undo').disabled=!editable||!current.undo;
    $('#failedReads').hidden=!failedReads.length;$('#failedCodes').textContent=failedReads.join(' · ');
    const scans=current.scans,unknown=scans.filter(s=>!info(s.code)),groups=new Map();scans.forEach(s=>{const row=info(s.code),label=row?[row.article,row.color,row.size].filter(Boolean).join(' · '):s.code;groups.set(label,(groups.get(label)||0)+1);});
    $('#unitCount').textContent=scans.length;$('#scanCount').textContent=scans.length;$('#variantCount').textContent=groups.size;$('#unknownCount').textContent=unknown.length;
    $('#articleList').innerHTML=[...groups].slice(0,40).map(([label,count])=>`<div class="article-item"><span>${escape(label)}</span><b>×${count}</b></div>`).join('');
    $('#scanList').innerHTML=scans.length?scans.slice().reverse().slice(0,limit).map(s=>{const row=info(s.code);return `<div class="scan-row ${row?'':'unknown'}"><span class="dot">${row?'✓':'!'}</span><div><b>${escape(s.code)}</b><small>${row?escape([row.article,row.color,row.size].filter(Boolean).join(' · ')):'Sin equivalencia · revisar antes de cerrar'}</small></div>${editable?`<button data-delete="${escape(s.id)}" aria-label="Eliminar lectura ${escape(s.code)}">Eliminar</button>`:''}</div>`;}).join(''):'<div class="empty">Tu próxima salida empieza con la primera lectura.</div>';
    $('#showMore').hidden=scans.length<=limit;
    const state=current.remote?.state||current.state;$('#draftTag').textContent=D.statusLabel(state);$('#draftTag').className='chip '+(state==='READY'?'ok':state==='ATTENTION'?'danger':'');
    $('#saveStatus').textContent=D.statusLabel(state);$('#saveExplanation').textContent=editable?'El respaldo central se confirma al finalizar y enviar.':current.remote?.accepted?'El contenido ya tiene respaldo central. El servidor recupera los pasos pendientes.':'Este pedido está cerrado y conservado en el equipo. Falta confirmar su recepción central.';
    $('#finish').disabled=!editable||!scans.length||!catalogReady||failedReads.length>0;$('#jobId').textContent='Operación '+current.id;
    $('#routeNote').textContent=current.meta.origen===current.meta.destino?'Origen y destino coinciden. Revisá que corresponda a la operación.':current.meta.origen+' → '+current.meta.destino;
  }
  async function createDraft(){D.assert(!failedReads.length,'UNSAVED','Primero recuperá las lecturas sin guardar.');const defaults=await store.recall('defaults')||{responsable:'DAVID',origen:'DEPOSITO',destino:'AV2',bultos:1};current=await store.create(defaults);await store.remember('active',current.id);limit=60;render();note('Nuevo picking. Cada lectura se conserva en este equipo.');showTab('picking');$('#scanInput').focus();}
  async function add(code){
    code=D.clean(code);if(!code)return;
    D.checkCode(code);D.assert(current?.state==='DRAFT','STATE','Abrí un nuevo picking para escanear.');D.assert(current.scans.length<D.LIMIT,'LIMIT','Se alcanzó el máximo de '+D.LIMIT+' lecturas. Finalizá este picking; no se descartó ninguna lectura.');
    const event={id:crypto.randomUUID(),code,time:Date.now()};current=await store.change(current.id,current.revision,j=>{j.scans.push(event);return j;});render();$('#lastScan').textContent=(info(code)?'✓ Conservado: ':'! Conservado para revisión: ')+code;beep(!!info(code));
  }
  async function capture(code){if(!D.clean(code))return;try{D.checkCode(D.clean(code));D.assert(current?.state==='DRAFT'&&current.scans.length<D.LIMIT,'LIMIT','Picking cerrado o límite alcanzado. Esta lectura no se agregó.');}catch(e){if(!$('#scanInput').value)$('#scanInput').value=code;throw e;}try{await add(code);}catch(e){failedReads.push(code);render();throw Error('NO SE GUARDÓ la lectura «'+code+'». Usá Recuperar lecturas antes de continuar. '+e.message);}}
  async function request(input){
    if(!apiUrl)throw Error('Falta conectar el servicio de Google. El picking sigue guardado en este equipo.');
    if(!demo&&!token&&input.action!=='activate')throw Error('Sistemas debe habilitar este equipo una sola vez para enviar a Google.');
    const res=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':demo?'application/json':'text/plain'},body:JSON.stringify(demo||input.action==='activate'?input:{stationToken:token,request:input}),signal:AbortSignal.timeout(60000)});
    if(res.status===401){token='';$('#login').hidden=false;throw Error('La habilitación venció. El picking sigue conservado.');}
    if(!res.ok)throw Error('No se confirmó el pedido (HTTP '+res.status+'). Se consultará la misma operación.');
    let data;try{data=await res.json();}catch{throw Error('Respuesta de Google inválida. No se marcará como guardado.');}
    if(data.version!==2||data.ok!==true){if(data.code==='AUTH'&&input.action!=='activate'){token='';await store.remember('stationToken','');}const e=Error(data.error||'Respuesta sin confirmación válida.');e.code=data.code;throw e;}
    return data;
  }
  async function confirmRemote(job,remote){
    const payload=job.payload;
    D.assert(remote&&remote.id===job.id&&remote.hash===await sha(JSON.stringify(payload))&&remote.count===payload.scans.length,'RESPONSE','La respuesta no coincide con el picking enviado.');
    D.assert(['RECEIVING','RECEIVED','NUMBERED','TXT_VERIFIED','READY','ATTENTION','CANCELLED'].includes(remote.state),'RESPONSE','Estado de respuesta inválido.');
    if(remote.state==='READY')D.assert(remote.accepted&&remote.remito&&remote.fileId&&remote.fileName,'RESPONSE','Falta evidencia del archivo o remito.');
    const updated=await store.remote(job.id,remote);if(current?.id===job.id){current=updated;render();}return updated;
  }
  async function sync(){
    if(syncBusy||!ready||!navigator.onLine||!apiUrl||(!demo&&!token))return;
    syncBusy=true;
    try{
      const jobs=(await store.list()).filter(j=>j.state==='QUEUED'&&!['READY','CANCELLED','ATTENTION'].includes(j.remote?.state));
      for(const job of jobs.slice(0,10)){
        try{const response=await request(job.remote?.accepted?{action:'status',id:job.id}:{action:'submit',payload:job.payload});await confirmRemote(job,response.job);if(response.job.state==='READY')note((demo?'ENSAYO · ':'')+'REM'+response.job.remito+' confirmado: TXT y cuadernillo verificados.');}
        catch(e){note(e.message,'warn');break;}
      }
      await renderHistory(false);
    }finally{syncBusy=false;}
  }
  function showTab(name){$('.tabs').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);if(b.dataset.tab===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});['picking','history','health'].forEach(k=>$('#'+k+'Panel').hidden=k!==name);if(name==='history')renderHistory(false);if(name==='health')renderHealth();}
  async function renderHistory(fetchRemote){
    if(fetchRemote)try{remoteHistory=(await request({action:'history',month:$('#historyMonth').value.replace('-','')})).jobs||[];}catch(e){note(e.message,'warn');}
    const locals=await store.list(),byId=new Map(remoteHistory.map(j=>[j.id,{...j,remoteOnly:true}]));locals.forEach(j=>byId.set(j.id,{...j.meta,...j.remote,id:j.id,state:j.remote?.state||j.state,count:j.scans.length,createdAt:j.createdAt,local:j}));
    $('#pendingCount').textContent=[...byId.values()].filter(j=>!['READY','CANCELLED','DRAFT'].includes(j.state)).length;
    const search=$('#historySearch').value.toUpperCase(),filter=$('#historyFilter').value,month=$('#historyMonth').value.replace('-','');
    const jobs=[...byId.values()].filter(j=>(j.state==='DRAFT'||j.id.startsWith(month))&&(!search||[j.remito,j.destino,j.responsable,j.id].join(' ').toUpperCase().includes(search))&&(filter==='all'||(filter==='ready'?j.state==='READY':!['READY','CANCELLED'].includes(j.state)))).sort((a,b)=>b.createdAt-a.createdAt);
    $('#historyList').innerHTML=jobs.length?jobs.map(j=>`<div class="history-row"><div><b>${j.remito?'REM'+escape(j.remito):'Picking sin número'}</b><small>${escape(date(j.createdAt))}</small></div><div>${escape(j.origen)} → ${escape(j.destino)}<small>${escape(j.responsable)} · ${j.count} prendas</small></div><div><span class="chip ${j.state==='READY'?'ok':j.state==='ATTENTION'?'danger':'warn'}">${escape(D.statusLabel(j.state))}</span></div><button class="quiet" data-job="${escape(j.id)}">${j.state==='DRAFT'?'Continuar':'Ver detalle'}</button></div>`).join(''):'<div class="empty">No hay operaciones para estos filtros.</div>';
  }
  async function refreshHealth(){try{health=await request({action:'health'});$('#connection').textContent=demo?'Ensayo local':health.mode==='pilot'?'Google · piloto':'Google conectado';$('#connection').className='chip ok';}catch(e){health=null;note(e.message,'warn');}renderHealth();}
  function renderHealth(){const rows=[['Internet',navigator.onLine?'Disponible':'Sin conexión'],['Almacenamiento local',ready?'Disponible (IndexedDB)':'No disponible'],['Equivalencias',catalogReady?'Dos archivos cargados':'Falta cargar el catálogo completo'],['Servicio',demo?'Ensayo local · no escribe en Google':!apiUrl?'Pendiente de configurar':health?'Conectado':'Sin confirmar'],['Recuperación automática',health?.lastRecovery?date(health.lastRecovery)+(health.stale?' · revisar demora':''):'Todavía no confirmada'],['Equipo',demo?'Puesto de ensayo':health?.stationName||(!token?'Pendiente de habilitar':'Habilitado')],['Versión',cfg.version]];$('#healthContent').innerHTML=rows.map(([k,v])=>`<div class="health-item"><span>${escape(k)}</span><b>${escape(v)}</b></div>`).join('');}
  function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type:type||'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  async function detail(id){
    const local=await store.get(id);if(local?.state==='DRAFT'){D.assert(!failedReads.length,'UNSAVED','Primero recuperá las lecturas sin guardar.');current=local;await store.remember('active',id);render();showTab('picking');return;}
    let j=local?.remote||remoteHistory.find(x=>x.id===id);
    if(apiUrl&&(demo||token))try{const data=await request({action:'status',id});j=data.job;if(local)await confirmRemote(local,j);}catch(e){note(e.message,'warn');}
    if(!j){note('El pedido sigue conservado en este equipo y espera confirmación central.','warn');return;}
    $('#detailContent').innerHTML=`<p><b>${j.remito?'REM'+escape(j.remito):'Sin número reservado'}</b> · ${escape(D.statusLabel(j.state))}</p><p>${escape(j.origen)} → ${escape(j.destino)} · ${j.count} prendas</p><p class="small">${escape(j.fileName||'El TXT final todavía no está confirmado.')}</p>${j.error?`<p class="detail-error">${escape(j.error)}</p>`:''}<p class="job-id">${escape(id)}</p>${j.accepted?'<button id="downloadOriginal" class="primary full">Descargar contenido original</button>':''}${health?.role==='admin'&&j.state==='ATTENTION'?'<button id="retryJob" class="quiet full">Reintentar después de resolver el incidente</button>':''}${health?.role==='admin'&&!j.accepted&&!j.remito&&!['CANCELLED','READY'].includes(j.state)?'<button id="cancelJob" class="quiet full">Anular recepción sin contenido</button>':''}`;
    $('#detailDialog').showModal();
    $('#downloadOriginal')?.addEventListener('click',()=>enqueue(async()=>{const d=await request({action:'download',id});download(d.fileName,d.content);}));
    $('#retryJob')?.addEventListener('click',()=>enqueue(async()=>{const d=await request({action:'retry',id});if(local)await confirmRemote(local,d.job);$('#detailDialog').close();await renderHistory(true);note('Se consultó y reintentó la misma operación.');}));
    $('#cancelJob')?.addEventListener('click',()=>enqueue(async()=>{const reason=prompt('Motivo de anulación (al menos 8 caracteres):');if(!reason)return;const d=await request({action:'cancel',id,reason});if(local)await confirmRemote(local,d.job);$('#detailDialog').close();await renderHistory(true);}));
  }
  function bind(){
    window.addEventListener('beforeunload',e=>{if(pendingWrites||failedReads.length||$('#scanInput').value.trim()){e.preventDefault();e.returnValue='Hay una lectura sin terminar de guardar.';}});
    $('#retryReads').onclick=()=>enqueue(async()=>{while(failedReads.length){await add(failedReads[0]);failedReads.shift();}render();note('Lecturas recuperadas y conservadas.');$('#scanInput').focus();});
    $('.tabs').addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(tab)showTab(tab.dataset.tab);});
    $('#newJob').onclick=()=>enqueue(createDraft);
    ['responsable','origen','destino','bultos'].forEach(k=>$('#'+k).addEventListener('change',()=>{const values=meta();enqueue(async()=>{D.assert(Number.isInteger(values.bultos)&&values.bultos>=0&&values.bultos<=9999,'BULTOS','Revisá la cantidad de bultos.');current=await store.change(current.id,current.revision,j=>{j.meta=values;return j;});await store.remember('defaults',values);render();});}));
    $('#scanForm').addEventListener('submit',e=>{e.preventDefault();clearTimeout(autoTimer);const code=$('#scanInput').value;$('#scanInput').value='';enqueue(()=>capture(code));});
    $('#scanInput').addEventListener('input',()=>{clearTimeout(autoTimer);if($('#autoScan').checked)autoTimer=setTimeout(()=>$('#scanForm').requestSubmit(),450);});
    $('#scanList').addEventListener('click',e=>{const btn=e.target.closest('[data-delete]');if(btn)enqueue(async()=>{current=await store.change(current.id,current.revision,j=>{const index=j.scans.findIndex(s=>s.id===btn.dataset.delete);if(index<0)throw Error('La lectura ya cambió.');j.undo={scan:j.scans[index],index};j.scans.splice(index,1);return j;});render();});});
    $('#undo').onclick=()=>enqueue(async()=>{current=await store.change(current.id,current.revision,j=>{D.assert(j.undo&&j.scans.length<D.LIMIT,'UNDO','No se puede restaurar esta lectura.');j.scans.splice(j.undo.index,0,j.undo.scan);j.undo=null;return j;});render();});
    $('#showMore').onclick=()=>{limit+=100;render();};
    $('#finish').onclick=()=>enqueue(async()=>{clearTimeout(autoTimer);if($('#scanInput').value.trim()){const value=$('#scanInput').value;$('#scanInput').value='';await capture(value);}const p=D.normalize({version:2,id:current.id,...current.meta,scans:current.scans,catalogVersion,reviewedUnknown:true});$('#reviewContent').innerHTML=`<div class="big-count"><strong>${p.scans.length}</strong><span>prendas</span></div><p><b>${escape(p.origen)} → ${escape(p.destino)}</b></p><p>${escape(p.responsable)} · ${p.bultos} bultos</p><p class="detail-error">${p.scans.filter(s=>!info(s.code)).length} lecturas sin equivalencia. ${p.origen===p.destino?'Origen y destino coinciden.':''}</p>`;$('#reviewAck').checked=false;$('#reviewDialog').showModal();});
    $('#closeReview').onclick=()=>$('#reviewDialog').close();
    $('#confirmFinish').onclick=()=>enqueue(async()=>{D.assert($('#reviewAck').checked,'REVIEW','Marcá la revisión de la salida.');D.assert(catalogReady,'CATALOG','Falta completar las equivalencias.');const payload=D.normalize({version:2,id:current.id,...current.meta,scans:current.scans,catalogVersion,reviewedUnknown:true});current=await store.freeze(current.id,current.revision,payload);$('#reviewDialog').close();render();note('Picking cerrado y conservado. Se enviará con el mismo identificador.');sync();});
    $('#backup').onclick=()=>enqueue(async()=>{const j=await store.get(current.id);download('picking-'+j.id+'.json',JSON.stringify({format:'rio-picking-backup-v2',job:j},null,2),'application/json');});
    $('#importBackup').onchange=e=>{const file=e.target.files[0];e.target.value='';if(!file)return;enqueue(async()=>{D.assert(file.size<2200000,'SIZE','Respaldo demasiado grande.');D.assert(!failedReads.length,'UNSAVED','Primero recuperá las lecturas sin guardar.');const backup=JSON.parse(await file.text()),j=backup.job;D.assert(backup.format==='rio-picking-backup-v2'&&j&&D.validId(j.id)&&['DRAFT','QUEUED'].includes(j.state),'BACKUP','Respaldo inválido.');D.assert(Array.isArray(j.scans)&&j.scans.length<=D.LIMIT,'BACKUP','Lecturas inválidas.');const events=new Set();j.scans.forEach(s=>{D.checkCode(s.code);D.assert(typeof s.id==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(s.id)&&!events.has(s.id),'BACKUP','ID de lectura inválido o repetido.');events.add(s.id);});D.assert(j.meta&&D.RESPONSABLES.includes(j.meta.responsable)&&D.BRANCHES.includes(j.meta.origen)&&D.BRANCHES.includes(j.meta.destino)&&Number.isInteger(j.meta.bultos)&&j.meta.bultos>=0&&j.meta.bultos<=9999,'BACKUP','Datos de salida inválidos.');j.undo=null;if(j.state==='DRAFT'){delete j.payload;delete j.remote;}if(!Number.isFinite(j.createdAt))j.createdAt=Date.now();if(j.state==='QUEUED'){j.payload=D.normalize(j.payload);D.assert(j.payload.id===j.id,'BACKUP','ID inconsistente.');j.scans=j.payload.scans;j.meta={responsable:j.payload.responsable,origen:j.payload.origen,destino:j.payload.destino,bultos:j.payload.bultos};delete j.remote;}D.assert(!await store.get(j.id),'EXISTS','La operación ya existe en este equipo. Se conserva la copia existente.');j.revision=0;j.updatedAt=Date.now();await store.db.jobs.add(j);current=j;await store.remember('active',j.id);render();note('Respaldo recuperado con su ID original.');sync();});};
    $('#historyList').addEventListener('click',e=>{const b=e.target.closest('[data-job]');if(b)enqueue(()=>detail(b.dataset.job));});
    $('#closeDetail').onclick=()=>$('#detailDialog').close();$('#refreshHistory').onclick=()=>enqueue(()=>renderHistory(true));
    ['historyMonth','historyFilter','historySearch'].forEach(k=>$('#'+k).addEventListener(k==='historySearch'?'input':'change',()=>renderHistory(k==='historyMonth')));
    $('#refreshHealth').onclick=refreshHealth;
    $('#simulateFailure').onclick=()=>enqueue(async()=>{await request({action:'demoFault'});note('Ensayo armado: el próximo guardado se cortará después de crear el TXT.','warn');});
    $('#recoverDemo').onclick=()=>enqueue(async()=>{await request({action:'demoRecover'});await sync();await renderHistory(true);note('Recuperación local ejecutada sobre las mismas operaciones.');});
    $('#login').onclick=()=>{$('#activationCode').value='';$('#activationDialog').showModal();};
    $('#closeActivation').onclick=()=>$('#activationDialog').close();
    $('#activateStation').onclick=()=>enqueue(async()=>{const code=$('#activationCode').value.trim();const result=await request({action:'activate',code});D.assert(typeof result.stationToken==='string'&&/^[a-f0-9]{64}$/.test(result.stationToken),'AUTH','Habilitación inválida.');await store.remember('stationToken',result.stationToken);token=result.stationToken;$('#activationDialog').close();$('#login').textContent=result.stationName||'Equipo habilitado';note('Equipo habilitado. Desde ahora podés entrar directamente.');await refreshHealth();sync();});
    window.addEventListener('online',()=>{updateConnection();refreshHealth();sync();});window.addEventListener('offline',updateConnection);
    window.addEventListener('focus',()=>enqueue(async()=>{if(current){current=await store.get(current.id);render();}sync();}));
  }
  function updateConnection(){$('#connection').textContent=navigator.onLine?(demo?'Ensayo local':'Internet disponible'):'Sin conexión';$('#connection').className='chip '+(navigator.onLine?'ok':'warn');}
  async function init(){
    D.RESPONSABLES.forEach(v=>$('#responsable').add(new Option(v,v)));['DEPOSITO','AV2','SARMIENTO','PUEYRREDON'].forEach(v=>$('#origen').add(new Option(v,v)));D.BRANCHES.forEach(v=>$('#destino').add(new Option(v,v)));
    $('#historyMonth').value=new Date().toISOString().slice(0,7);$('#version').textContent=cfg.version;
    $('#environment').textContent=demo?'ENSAYO LOCAL · Los guardados son de prueba. No se crean remitos ni archivos en Google.':apiUrl?'PICKING V2 · Circuito independiente. El estado del servicio identifica piloto o producción.':'PREPARACIÓN · Podés escanear y conservar borradores. Falta conectar el servicio nuevo de Google.';
    $('#environment').classList.toggle('warn',!demo&&!apiUrl);$('#demoControls').hidden=!demo;$('#login').hidden=demo;updateConnection();
    try{await store.open();token=demo?'':await store.recall('stationToken')||'';$('#login').textContent=token?'Equipo habilitado':'Habilitar equipo';const active=await store.recall('active');current=active?await store.get(active):null;if(!current)await createDraft();ready=true;bind();render();await renderHistory(false);note(demo?'Ensayo local listo. Podés probar el circuito y simular un corte.':'Almacenamiento local disponible. Los borradores se conservan en este equipo.');}
    catch(e){document.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);note('No se pudo abrir el almacenamiento local. No escanees: '+e.message,'error');return;}
    loadCatalog();
    if(apiUrl&&(demo||token))refreshHealth();
    if('serviceWorker' in navigator&&!demo)navigator.serviceWorker.register('./sw.js').catch(()=>note('No se pudo activar la apertura sin conexión; los borradores locales siguen disponibles.','warn'));
    if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
    setInterval(sync,20000);sync();
  }
  init();
})();
