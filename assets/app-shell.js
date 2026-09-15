(() => {
  'use strict';
  const script=document.currentScript;
  const root=new URL('../',script.src);
  const catalog=window.RioCatalog || [];
  const slug=document.body.dataset.rioApp;
  const current=catalog.find(item=>item.slug===slug);
  if(!current)return;
  const url=(path='')=>new URL(path,root).href;
  const icons={grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>',chevron:'<path d="m9 5 7 7-7 7"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 4h.01"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>'};
  const svg=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
  const link=(text,path,className)=>{const node=el('a',className,text);node.href=url(path);return node;};
  const unlocked=()=>{try{return sessionStorage.getItem('rio_supervision_access_v1')==='ok';}catch{return false;}};
  const allowed=item=>window.RioContext?window.RioContext.canUse(item):(!item.restricted||unlocked());
  const rail=el('aside','rio-rail');rail.id='rioAppNavigation';rail.setAttribute('aria-label','Navegación de RIO Tools');
  const brand=link('','index.html','rio-shell-brand');brand.innerHTML='<img class="rio-brand-logo" src="'+url('assets/identity/rio-logo-coral.svg')+'" alt="RÍO Lencería" width="99" height="68" /><span class="rio-brand-descriptor"><strong>TOOLS</strong><small>Espacio de<br>trabajo</small></span>';rail.append(brand);
  const home=link('','index.html','rio-rail-home');home.innerHTML=svg('grid')+'<span>Todas las herramientas</span>';rail.append(home);
  const nav=el('nav','rio-rail-nav');nav.setAttribute('aria-label','Áreas y herramientas');
  const groups=[...new Set(catalog.filter(allowed).map(item=>item.area))];
  groups.forEach(area=>{
    const group=el('div','rio-rail-group');const item=catalog.find(item=>item.area===area);
    const areaLink=link(area,'index.html?area='+item.areaId,'rio-area-link');if(area===current.area)areaLink.classList.add('is-current');group.append(areaLink);
    if(area===current.area){catalog.filter(tool=>tool.area===area&&allowed(tool)&&!tool.unlisted).forEach(tool=>{const a=link(tool.name,'apps/'+tool.slug+'/','rio-tool-link');if(tool.slug===slug){a.classList.add('is-current');a.setAttribute('aria-current','page');}group.append(a);});}
    nav.append(group);
  });rail.append(nav);
  if(allowed({slug:'incidentes'})){const help=link('','apps/incidentes/','rio-rail-help');help.innerHTML=svg('help')+'<span>Mesa de ayuda</span>';rail.append(help);}
  const shade=el('button','rio-nav-shade');shade.type='button';shade.setAttribute('aria-label','Cerrar navegación');shade.hidden=true;
  const bar=el('div','rio-appbar');bar.setAttribute('role','navigation');bar.setAttribute('aria-label','Navegación de la aplicación');
  const menu=el('button','rio-shell-button rio-menu-toggle');menu.type='button';menu.innerHTML=svg('menu');menu.setAttribute('aria-label','Abrir navegación');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-controls',rail.id);
  const crumbs=el('div','rio-crumbs');crumbs.append(link(current.area,'index.html?area='+current.areaId));const sep=el('span');sep.innerHTML=svg('chevron');crumbs.append(sep,el('strong','',current.name));
  const actions=el('div','rio-shell-actions');
  const searchWrap=el('div','rio-app-search');const search=el('input');search.type='search';search.placeholder='Ir a una herramienta…';search.setAttribute('aria-label','Buscar herramienta en la suite');search.setAttribute('aria-controls','rioSearchResults');search.setAttribute('aria-expanded','false');
  const results=el('div','rio-search-results');results.id='rioSearchResults';results.hidden=true;searchWrap.append(search,results);
  const favorite=el('button','rio-shell-button');favorite.type='button';favorite.innerHTML=svg('star');
  const key='./apps/'+slug+'/';
  const readFavorites=()=>{try{const value=JSON.parse(localStorage.getItem('rio_workspace_favorites'));return Array.isArray(value)?value.filter(v=>typeof v==='string'):[];}catch{return [];}};
  let favorites=readFavorites();
  const renderFavorite=()=>{const active=favorites.includes(key);favorite.setAttribute('aria-pressed',String(active));favorite.setAttribute('aria-label',(active?'Quitar de':'Agregar a')+' favoritos: '+current.name);};renderFavorite();
  const status=el('span','rio-shell-status');status.setAttribute('role','status');
  favorite.addEventListener('click',()=>{favorites=favorites.includes(key)?favorites.filter(v=>v!==key):[...favorites,key];try{localStorage.setItem('rio_workspace_favorites',JSON.stringify(favorites));status.textContent=favorites.includes(key)?'Guardada en favoritos':'Quitada de favoritos';}catch{status.textContent='Disponible solo en esta visita.';}renderFavorite();});
  actions.append(searchWrap,favorite);bar.append(menu,crumbs,actions,status);
  document.body.prepend(rail,shade,bar);
  const mobileNavigation=matchMedia('(max-width:850px)');
  function syncNavigation(){rail.inert=mobileNavigation.matches&&!document.body.classList.contains('rio-nav-open');}
  mobileNavigation.addEventListener('change',()=>{if(!mobileNavigation.matches){document.body.classList.remove('rio-nav-open');shade.hidden=true;menu.setAttribute('aria-expanded','false');}syncNavigation();});syncNavigation();
  function setMenu(open){document.body.classList.toggle('rio-nav-open',open);menu.setAttribute('aria-expanded',String(open));shade.hidden=!open;syncNavigation();if(open)rail.querySelector('a').focus();else menu.focus();}
  menu.addEventListener('click',()=>setMenu(!document.body.classList.contains('rio-nav-open')));shade.addEventListener('click',()=>setMenu(false));
  const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  search.addEventListener('input',()=>{results.replaceChildren();const q=normalize(search.value.trim());results.hidden=!q;search.setAttribute('aria-expanded',String(!!q));if(!q)return;const matches=catalog.filter(item=>allowed(item)&&normalize(item.name+' '+item.area).includes(q));matches.slice(0,10).forEach(item=>{const a=link('','apps/'+item.slug+'/','rio-search-result');a.append(el('strong','',item.name),el('small','',item.area));results.append(a);});if(!matches.length)results.append(el('p','','No hay herramientas con ese nombre.'));});
  search.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('a')?.focus();}if(event.key==='Enter'&&!results.hidden){const a=results.querySelector('a');if(a){event.preventDefault();a.click();}}});
  document.addEventListener('click',event=>{if(!searchWrap.contains(event.target)){results.hidden=true;search.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){results.hidden=true;search.setAttribute('aria-expanded','false');if(document.body.classList.contains('rio-nav-open'))setMenu(false);}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search.focus();}});
  // Keep application elements and IDs in their original containers; existing event handlers remain valid.
  const header=document.querySelector('.module-topbar')||document.querySelector('header');
  if(header){header.classList.add('rio-module-heading');const title=header.querySelector('h1');if(title&&!title.id)title.textContent=current.name;
    const target=header.querySelector('.module-topbar__title')||header.querySelector('.page-title')||header;
    if(!header.querySelector('h1')){const h1=el('h1','',current.name);target.prepend(h1);target.querySelector('.brand-title')?.setAttribute('hidden','');target.querySelector('.brand-sub')?.setAttribute('hidden','');}
    const desc=el('p','rio-module-description',current.description);target.append(desc);
  }
  const sections=el('nav','rio-section-nav');sections.setAttribute('aria-label','Secciones de '+current.name);
  const headings=[...document.querySelectorAll('h2')].filter(h=>h.textContent.trim()&&!h.closest('dialog,[role="dialog"],.modal,.overlay,[hidden]'));
  headings.slice(0,9).forEach((h,i)=>{const id=h.id||'rio-section-'+i;if(!h.id)h.id=id;const a=el('a','',h.textContent.trim().replace(/^\d+\)\s*/,''));a.href='#'+id;sections.append(a);});
  if(headings.length>1&&header)header.after(sections);
  // Tables retain semantics and scroll locally instead of widening the entire application.
  document.querySelectorAll('table').forEach(table=>{const parent=table.parentElement;if(/table|scroll|preview|tabla/i.test(parent.className+' '+parent.id)){parent.classList.add('rio-table-scroll');}else{const wrap=el('div','rio-table-scroll');table.before(wrap);wrap.append(table);}});
  try{let recent=JSON.parse(localStorage.getItem('rio_workspace_recent'));if(!Array.isArray(recent))recent=[];localStorage.setItem('rio_workspace_recent',JSON.stringify([key,...recent.filter(v=>v!==key&&typeof v==='string')].slice(0,12)));}catch{}
})();
