(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4"/>',
    bag: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 4h.01"/>',
    list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01"/>',
    truck: '<path d="M3 5h11v12H3V5Zm11 5h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>'
  };
  function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.grid}</svg>`; }
  document.querySelectorAll('[data-icon]').forEach(el => {el.setAttribute('viewBox','0 0 24 24'); el.setAttribute('aria-hidden','true'); el.innerHTML=icons[el.dataset.icon];});
  const read = (key, fallback) => { try { const v=JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v.filter(x=>typeof x==='string') : fallback; } catch { return fallback; } };
  const save = (key, value) => { try {localStorage.setItem(key, JSON.stringify(value));return true;} catch {return false;} };
  let favorites = read('rio_workspace_favorites', []), recent = read('rio_workspace_recent', []);
  let mode='all', area='all', toastTimer;
  const board=document.querySelector('.board');
  const categories=Array.from(board.querySelectorAll('.col')).map((el,i)=>({el,id:String(i),name:el.querySelector('h2').textContent,icon:['box','bag','truck','people','monitor','lock'][i],restricted:el.hasAttribute('data-supervision-access')}));
  const tools=[];
  categories.forEach(cat => {
    const badge=document.createElement('span');badge.className='category-icon';badge.innerHTML=icon(cat.icon);
    const head=cat.el.querySelector('.col-head');const copy=document.createElement('div');while(head.firstChild)copy.append(head.firstChild);head.append(badge,copy);
    cat.el.querySelectorAll('a.item').forEach(link => {
      const row=document.createElement('div');row.className='tool-row';link.before(row);row.append(link);
      const name=link.querySelector('.item-title').textContent.trim(), id=link.getAttribute('href');
      const fav=document.createElement('button');fav.className='favorite-button';fav.type='button';fav.innerHTML=icon('star');row.append(fav);
      const tool={link,row,fav,name,id,cat,text:normalize(name+' '+link.querySelector('.item-desc').textContent+' '+cat.name)};tools.push(tool);
      fav.addEventListener('click',()=>{const exists=favorites.includes(id);favorites=exists?favorites.filter(x=>x!==id):[...favorites,id];const persisted=save('rio_workspace_favorites',favorites);render();toast(persisted?(exists?'Quitada de tus favoritos':'Guardada en tus favoritos'):'Favorito actualizado para esta visita; el navegador no permite guardarlo.');});
    });
  });
  function normalize(text){return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  const accessible=tool=>window.RioContext.canUse({slug:tool.id.split('/').filter(Boolean).pop(),restricted:tool.cat.restricted});
  function makeFilter(cat, container, sidebar){const button=document.createElement('button');button.type='button';button.className=sidebar?'nav-button':'filter';button.dataset.area=cat.id;button.innerHTML=(sidebar?icon(cat.icon):'');button.append(document.createTextNode(cat.name));if(cat.restricted)button.setAttribute('data-supervision-access','');button.addEventListener('click',()=>{area=cat.id;mode='all';$('toolSearch').value='';render();window.scrollTo({top:0,behavior:'instant'});});container.append(button);}
  makeFilter({id:'all',name:'Todas'},$('filters'),false);
  categories.forEach(cat=>{makeFilter(cat,$('filters'),false);makeFilter(cat,$('areaNav'),true);});
  function render(){
    const unlocked=!!window.RioAccess?.isUnlocked();document.body.classList.toggle('supervision-unlocked',unlocked);
    document.querySelectorAll('a[href*="apps/"]').forEach(link=>{
      if(link.classList.contains('item'))return;
      const slug=link.getAttribute('href').match(/apps\/([^/]+)/)?.[1];
      if(slug)link.hidden=!window.RioContext.canUse({slug});
    });
    const quick=document.querySelector('.quick-panel');
    if(quick)quick.hidden=![...quick.querySelectorAll('a')].some(link=>!link.hidden);
    const query=normalize($('toolSearch').value.trim());let count=0;
    const focused=area!=='all'||mode!=='all'||query!=='';
    document.body.classList.toggle('focus-mode',focused);
    tools.forEach(tool=>{
      const favorite=favorites.includes(tool.id);tool.fav.setAttribute('aria-pressed',String(favorite));tool.fav.setAttribute('aria-label',`${favorite?'Quitar de':'Agregar a'} favoritos: ${tool.name}`);
      const visible=accessible(tool) && (area==='all'||area===tool.cat.id) && query.split(/\s+/).every(word=>tool.text.includes(word)) && (mode==='all'||(mode==='favorites'?favorite:recent.includes(tool.id)));
      tool.row.hidden=!visible;if(visible)count++;
      tool.row.style.order=mode==='recent'?recent.indexOf(tool.id):'';
    });
    categories.forEach(cat=>{cat.el.hidden=!tools.some(t=>t.cat===cat&&!t.row.hidden);});
    document.querySelectorAll('[data-area]').forEach(button=>{button.hidden=button.dataset.area!=='all'&&!tools.some(t=>t.cat.id===button.dataset.area&&accessible(t));const active=button.dataset.area===area&&mode==='all';button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-mode]').forEach(button=>{const active=mode===button.dataset.mode&&area==='all';button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    $('viewTitle').textContent=mode==='favorites'?'Tus favoritos':mode==='recent'?'Abiertas recientemente':area==='all'?'Todas las herramientas':categories.find(c=>c.id===area).name;
    $('breadcrumb').textContent=mode==='all'&&area==='all'?'Vista general':$('viewTitle').textContent;
    const viewUrl=new URL(location.href);viewUrl.searchParams.delete('area');viewUrl.searchParams.delete('view');
    if(area!=='all')viewUrl.searchParams.set('area',area);
    if(mode!=='all')viewUrl.searchParams.set('view',mode);
    history.replaceState(null,'',viewUrl);
    $('toolCount').textContent=count;$('favoriteCount').textContent=tools.filter(t=>accessible(t)&&favorites.includes(t.id)).length;
    $('empty').hidden=count>0;$('emptyTitle').textContent=query?'No encontramos esa herramienta':mode==='favorites'?'Tu espacio, a tu manera':mode==='recent'?'Tu próximo paso empieza acá':'No hay herramientas en esta vista';
    $('emptyText').textContent=query?'Probá con otro nombre, una tarea o un área de trabajo.':mode==='favorites'?'Usá la estrella junto a una herramienta para guardarla y tenerla siempre a mano.':mode==='recent'?'Las herramientas que abras desde este panel van a aparecer acá, en este navegador.':'Cambiá el filtro para explorar las herramientas disponibles.';
    $('resultsStatus').textContent=`${count} herramientas disponibles en esta vista.`;
  }
  function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;area='all';$('toolSearch').value='';render();window.scrollTo({top:0,behavior:'instant'});}));
  $('toolSearch').addEventListener('input',render);
  $('resetFilters').addEventListener('click',()=>{mode='all';area='all';$('toolSearch').value='';render();$('toolSearch').focus();});
  document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link)return;const tool=tools.find(t=>t.id===link.getAttribute('href'));if(!tool||!accessible(tool))return;recent=[tool.id,...recent.filter(id=>id!==tool.id)].slice(0,12);save('rio_workspace_recent',recent);});
  function setView(view){board.classList.toggle('list',view==='list');document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));try{localStorage.setItem('rio_workspace_view',view);}catch{}}
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  try{setView(localStorage.getItem('rio_workspace_view')==='list'?'list':'grid');}catch{}
  function closeAccess(){ $('supervisionAccess').classList.remove('is-open');$('supervisionAccessForm').hidden=true;$('supervisionOpenButton').setAttribute('aria-expanded','false');$('supervisionAccessPass').value='';$('supervisionAccessMessage').textContent=''; }
  function openAccess(){ $('supervisionAccess').classList.add('is-open');$('supervisionAccessForm').hidden=false;$('supervisionOpenButton').setAttribute('aria-expanded','true');$('supervisionAccessPass').focus(); }
  $('supervisionOpenButton').addEventListener('click',()=>{if($('supervisionAccessForm').hidden)openAccess();else closeAccess();});
  $('accessCancel').addEventListener('click',()=>{closeAccess();$('supervisionOpenButton').focus();});
  $('supervisionAccessForm').addEventListener('submit',event=>{event.preventDefault();const ok=window.RioAccess?.unlock($('supervisionAccessPass').value);$('supervisionAccessPass').value='';if(ok&&window.RioAccess.isUnlocked()){closeAccess();render();toast('Herramientas de supervisión habilitadas');}else{$('supervisionAccessMessage').textContent=ok?'Tu navegador no permite guardar la sesión. Habilitá el almacenamiento para ingresar.':'La clave no es correcta. Volvé a intentarlo.';$('supervisionAccessPass').focus();}});
  $('supervisionLockButton').addEventListener('click',()=>{window.RioAccess?.lock();closeAccess();area='all';render();toast('Acceso de supervisión cerrado');});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('toolSearch').focus();$('toolSearch').scrollIntoView({block:'center'});}if(event.key==='Escape'){closeAccess();if(document.activeElement===$('toolSearch')){$('toolSearch').value='';render();}}});
  const today=new Date();$('today').dateTime=today.toISOString().slice(0,10);$('today').textContent=new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(today);
  function connectivity(){$('offline').hidden=navigator.onLine;}
  const initial=new URLSearchParams(location.search);
  if(categories.some(c=>c.id===initial.get('area')&&(!c.restricted||window.RioAccess?.isUnlocked())))area=initial.get('area');
  if(['favorites','recent'].includes(initial.get('view')))mode=initial.get('view');
  addEventListener('online',connectivity);addEventListener('offline',connectivity);addEventListener('pageshow',render);connectivity();render();
  if(new URLSearchParams(location.search).get('access')==='supervision'&&!window.RioAccess?.isUnlocked())openAccess();
})();
