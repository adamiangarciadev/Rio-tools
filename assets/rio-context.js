(() => {
  'use strict';
  const root = new URL('../', document.currentScript.src);
  const KEY = 'rio_workspace_branch_v1';
  const branches = ['AV2','NAZCA','LAMARCA','CORRIENTES','CASTELLI','QUILMES','SARMIENTO','PUEYRREDON','WEB','DEPOSITO','ADMINISTRACION'];
  const labels = {AV2:'Avellaneda 2',PUEYRREDON:'Pueyrredón',DEPOSITO:'Depósito',ADMINISTRACION:'Administración',CORRIENTES2:'Corrientes 2'};
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const canonical = value => ({AVELLANEDA:'AV2',AVELLANEDA2:'AV2',AVELLANEDA3249:'AV2',AVELLANEDA2900:'NAZCA',AV1:'NAZCA',AVENIDAAVELLANEDA:'AV2',AVENIDAAVELLANEDA2:'AV2',CORRIENTES1:'CORRIENTES',DEPOSITOCENTRAL:'DEPOSITO'}[normalize(value)] || normalize(value));
  const label = value => String(labels[value] || value || '').toLocaleUpperCase('es-AR');
  const read = () => {try { const value=localStorage.getItem(KEY);return branches.includes(value)?value:'';}catch{return '';}};
  const branch=read();
  const isLocal=()=>!!branch&&!['DEPOSITO','ADMINISTRACION'].includes(branch);
  const currentSlug = decodeURIComponent(location.pathname).match(/\/apps\/([^/]+)/)?.[1];
  const home=()=>location.assign(new URL('index.html?branch=change',root));
  const keys=['rio_sucursal','asistencia_sucursal_v1','rio_remitos_sucursal','rio_sucursal_web','rio_deposito_local','mercaderia_transito_sucursal','sucursal','rio_shipnow_sucursal_origen'];
  function seed(value) {
    for(const key of keys) {
      const aliases={rio_sucursal_web:{AV2:'AVELLANEDA'},asistencia_sucursal_v1:{AV2:'AVELLANEDA'},mercaderia_transito_sucursal:{AV2:'AVELLANEDA'}};
      localStorage.setItem(key,aliases[key]?.[value]||value);
    }
  }
  const profileApps = {
    ADMINISTRACION: ['supervisores','asistencia-dashboard','check-depositos'],
    WEB: ['categorizador','pedidos-web','pedidos-dashboard','clientes-contactar','banco-medios','asistencia','confirmacion-depositos','etiquetas','incidentes','objetivos-ventas']
  };
  const localProfiles = new Set(['AV2','NAZCA','QUILMES','CORRIENTES','DEPOSITO','LAMARCA','SARMIENTO','PUEYRREDON']);
  const webOnlyApps = new Set(['pedidos-web','clientes-contactar','pedidos-dashboard','categorizador']);
  const localOrdersProfiles = new Set(['AV2','CORRIENTES','QUILMES']);
  const inProfile = slug => {
    if (slug === 'revision-stock') return branch === 'DEPOSITO' && !!window.RioAccess?.isUnlocked();
    if (profileApps[branch] && !profileApps[branch].includes(slug)) return false;
    if (!localProfiles.has(branch)) return true;
    if (webOnlyApps.has(slug)) return false;
    return slug !== 'pedidos-web-locales' || localOrdersProfiles.has(branch);
  };
  const canUse = item => inProfile(item.slug)&&(item.slug!=='picking-salida'||branch==='DEPOSITO')&&(!item.restricted||!!window.RioAccess?.isUnlocked());
  window.RioContext={branch,branches,label,canonical,isLocal,canUse,change:home,storageKey:key=>key+':'+(branch||'unassigned')};
  if(branch) {try{seed(branch);}catch{}}
  if(currentSlug&&(!branch || !inProfile(currentSlug) || (branch==='ADMINISTRACION'&&!window.RioAccess?.isUnlocked()) || (currentSlug==='picking-salida'&&branch!=='DEPOSITO'))) {
    location.replace(new URL('index.html'+(currentSlug==='picking-salida'?'?notice=deposito':''),root));
    return;
  }
  const adapters={
    'entrada-mercaderia':['sucursalEntradaSelect'], 'asistencia':['sucursalSelect'],
    'mercaderia-transito':['sucursalSelect'], 'control-remitos-clientes':['sucursalSelect'],
    'pedidos-web-locales':['sucursalSelect'], 'pedido-semanal':['sucursalSelect'],
    'confirmacion-depositos':['localSelect'], 'envios':['sucursalOrigen'],
    'incidentes':['branch'], 'etiquetas':['sucursal'], 'archivos-administrativos':['pdSucursal'],
    'ventas-clientes':['branchFilter','exportBranch'], 'asistencia-dashboard':['branchFilter'],
    'pedidos-dashboard':['branchFilter'], 'sistemas':['branchFilter']
  };
  function hideBranchControl(select) {
    // Keep the control in the DOM: existing app handlers and API payloads read it.
    const wrapper=currentSlug==='etiquetas'?select.closest('.topbar'):select.closest('label,.field');
    (wrapper||select).classList.add('rio-context-inherited');
    for(const label of select.labels||[])label.classList.add('rio-context-inherited');
    if(currentSlug==='pedido-semanal')select.closest('.meta')?.classList.add('rio-context-compact-meta');
  }
  function mount() {
    const slot=document.querySelector('.top-actions,.rio-shell-actions');
    if(slot){const button=document.createElement('button');button.type='button';button.className='rio-context-button';button.textContent=branch?label(branch):'Elegir sucursal';button.setAttribute('aria-label','Cambiar sucursal: '+label(branch));button.addEventListener('click',home);slot.prepend(button);}
    if(!currentSlug) {
      if(!branch||new URLSearchParams(location.search).get('branch')==='change'||(branch==='ADMINISTRACION'&&!window.RioAccess?.isUnlocked()))selectBranch();
      return;
    }
    if(!isLocal())return;
    // Only adapt the operating branch: destination selectors keep their meaning.
    (adapters[currentSlug]||[]).forEach(id=>{
      const select=document.getElementById(id);if(!select)return;
      let lastOptions='', lastApplied='';
      const apply=()=>{
        const signature=[...select.options].map(o=>o.value).join('|');
        const option=[...select.options].find(o=>canonical(o.value)===branch||canonical(o.textContent)===branch);
        if(!option){
          select.value=''; select.disabled=true;
          if([...select.options].some(o=>o.value))showUnavailable();
          return;
        }
        const changed=select.value!==option.value||signature!==lastOptions||lastApplied!==option.value;
        select.value=option.value;select.disabled=true;select.title='Sucursal elegida en el inicio. Usá Cambiar sucursal para modificarla.';
        if(select.name){
          let mirror=document.getElementById(id+'RioValue');
          if(!mirror){mirror=document.createElement('input');mirror.type='hidden';mirror.id=id+'RioValue';mirror.name=select.name;if(select.hasAttribute('form'))mirror.setAttribute('form',select.getAttribute('form'));select.after(mirror);}
          mirror.value=option.value;
        }
        lastOptions=signature;lastApplied=option.value;
        hideBranchControl(select);
        if(changed)select.dispatchEvent(new Event('change',{bubbles:true}));
      };
      new MutationObserver(apply).observe(select,{childList:true,subtree:true});
      apply();
      // Async initialization may restore a stored value after filling the list.
      addEventListener('load',apply,{once:true});
    });
    const clear=document.getElementById('btnClearSucursal');if(clear)clear.hidden=true;
  }
  function showUnavailable() {
    if(document.getElementById('rioBranchUnavailable'))return;
    const dialog=document.createElement('dialog');dialog.id='rioBranchUnavailable';dialog.className='rio-context-dialog';
    dialog.innerHTML='<h2>Sucursal no disponible</h2><p>Esta herramienta todavía no ofrece la sucursal elegida. Volvé al inicio para cambiarla. No se seleccionó otro local automáticamente.</p><button type="button">Volver al inicio</button>';
    document.body.append(dialog);dialog.querySelector('button').onclick=home;dialog.addEventListener('cancel',e=>e.preventDefault());dialog.showModal();
  }
  function selectBranch() {
    const dialog=document.createElement('dialog');dialog.className='rio-context-dialog';dialog.setAttribute('aria-labelledby','rioBranchTitle');
    dialog.innerHTML='<form><img src="'+new URL('assets/identity/rio-logo-coral.svg',root)+'" width="100" height="68" alt="RÍO Lencería"><h2 id="rioBranchTitle">¿Desde dónde trabajás?</h2><p>Elegí la sucursal de esta PC. Las herramientas van a abrir con ese local seleccionado.</p><label for="rioBranchChoice">Sucursal o área</label><select id="rioBranchChoice" required><option value="">Elegí una opción</option></select><div id="rioAdminFields" hidden><label for="rioAdminPassword">Clave de Administración</label><input id="rioAdminPassword" type="password" autocomplete="current-password"><p>Usá la clave de acceso de la suite.</p></div><p class="rio-context-message" role="status"></p><button type="submit">Entrar a mi espacio</button></form>';
    const choice=dialog.querySelector('select');branches.forEach(value=>choice.add(new Option(label(value),value)));choice.value=new URLSearchParams(location.search).get("profile")==="ADMINISTRACION"?"ADMINISTRACION":branch;
    const admin=dialog.querySelector('#rioAdminFields'), pass=dialog.querySelector('input');
    const submit=dialog.querySelector('button[type="submit"]');
    const sync=()=>{admin.hidden=choice.value!=='ADMINISTRACION';pass.required=!admin.hidden;pass.value='';dialog.querySelector('[role=status]').textContent='';submit.textContent=admin.hidden?'Entrar a mi espacio':'Ingresar a Administración';};choice.onchange=sync;sync();
    dialog.querySelector('form').onsubmit=event=>{
      event.preventDefault();const value=choice.value;
      if(value==='ADMINISTRACION'&&!window.RioAccess?.unlock(pass.value)){dialog.querySelector('[role=status]').textContent='La clave no es correcta. Volvé a intentarlo.';pass.value='';pass.focus();return;}
      try{localStorage.setItem(KEY,value);seed(value);}catch{dialog.querySelector('[role=status]').textContent='El navegador no permite guardar la sucursal. Habilitá el almacenamiento para continuar.';return;}
      if(value!=='ADMINISTRACION')window.RioAccess?.lock();
      location.replace(new URL(value==='ADMINISTRACION'?'index.html?area=5':'index.html',root));
    };
    dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);dialog.showModal();
  }
  addEventListener('storage',event=>{
    if(event.key!==KEY||event.newValue===branch)return;
    const dialog=document.createElement('dialog');dialog.className='rio-context-dialog';dialog.innerHTML='<h2>La sucursal cambió en otra pestaña</h2><p>Volvé al inicio para trabajar con la nueva selección. Esta pantalla conserva el contexto anterior hasta que salgas.</p><button type="button">Ir al inicio</button>';dialog.querySelector('button').onclick=home;dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);dialog.showModal();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>queueMicrotask(mount));else queueMicrotask(mount);
})();
