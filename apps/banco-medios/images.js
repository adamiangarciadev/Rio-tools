(() => {
  const $ = id => document.getElementById(id);
  const panel = $('imagesPanel'), grid = $('imagesGrid'), status = $('imagesStatus');
  const folders = $('imageFolders'), tiles = $('folderTiles'), more = $('moreImages');
  const search = $('dropboxSearch'), type = $('dropboxType'), viewer = $('mediaViewer');
  const cache = new Map();
  let path = '', query = '', nextOffset = null, request = 0, loaded = false;
  let items = [], childFolders = [], activeIndex = 0, controller;
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && /^(www\.)?dropbox\.com$/.test(url.hostname) ? url.href : '#'; } catch { return '#'; }
  }
  const fileSize = value => Number(value) > 0 ? `${Number(value).toFixed(Number(value) >= 10 ? 0 : 1)} MB` : '';
  function syncLocation(replace = false) {
    const url = new URL(location.href);
    if (panel.hidden) ['media','folder','q','type'].forEach(key => url.searchParams.delete(key));
    else {
      url.searchParams.set('media', 'dropbox');
      path ? url.searchParams.set('folder',path) : url.searchParams.delete('folder');
      query ? url.searchParams.set('q',query) : url.searchParams.delete('q');
      type.value !== 'all' ? url.searchParams.set('type',type.value) : url.searchParams.delete('type');
    }
    if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState']({}, '', url);
  }
  function breadcrumbs() {
    const nav = $('mediaBreadcrumbs'); nav.replaceChildren();
    const parts = path.split('/').filter(Boolean);
    ['Todas las marcas', ...parts].forEach((name,index) => {
      if (index) { const divider = document.createElement('span'); divider.textContent = '/'; divider.setAttribute('aria-hidden','true'); nav.append(divider); }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = name;
      if (index === parts.length) button.setAttribute('aria-current','page');
      button.onclick = () => navigate(index ? '/' + parts.slice(0,index).join('/') : ''); nav.append(button);
    });
    $('libraryTitle').textContent = parts.at(-1) || 'Todas las marcas';
    $('libraryEyebrow').textContent = parts.length ? 'BIBLIOTECA · DROPBOX' : 'CATÁLOGOS Y CAMPAÑAS';
    $('backImages').hidden = !path;
    $('rootImages').setAttribute('aria-current',path ? 'false' : 'page');
    $('folderListTitle').textContent = path ? 'Subcarpetas' : 'Marcas';
  }
  function renderFolders() {
    const filter = $('folderSearch').value.trim().toLocaleLowerCase();
    const list = [...childFolders].sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true})).filter(folder=>folder.name.toLocaleLowerCase().includes(filter));
    folders.replaceChildren(); tiles.replaceChildren();
    $('folderCount').textContent = String(childFolders.length); $('folderEmpty').hidden = Boolean(list.length);
    $('folderEmpty').textContent = childFolders.length ? 'No hay carpetas con ese nombre.' : 'Estás en la última carpeta de esta ruta.';
    list.forEach(folder => {
      const make = tile => {
        const button = document.createElement('button'); button.type = 'button'; button.className = tile ? 'folder-tile' : 'folder-item';
        button.innerHTML = `<span class="folder-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/></svg></span><span>${esc(folder.name)}${tile ? '<small>Abrir carpeta</small>' : ''}</span><span class="folder-chevron" aria-hidden="true">›</span>`;
        button.onclick = () => navigate(folder.path); return button;
      };
      folders.append(make(false)); tiles.append(make(true));
    });
    tiles.hidden = !list.length;
  }
  function navigate(nextPath) {
    path = nextPath; query = ''; search.value = ''; $('folderSearch').value = ''; $('clearDropboxSearch').hidden = true;
    syncLocation(); load(); $('libraryTitle').scrollIntoView({block:'start'});
  }
  function card(item,index) {
    const video = item.kind === 'video', extension = item.nombre.split('.').at(-1).toUpperCase();
    const preview = video ? '<span class="video-preview-mark" aria-hidden="true">▷</span><span class="video-preview-label">Ver video</span>' : `<img class="media-image" src="${esc(safeUrl(item.previewUrl))}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
    return `<article class="card asset-card"><button class="asset-preview${video ? ' asset-preview-video' : ''}" type="button" data-preview="${index}" aria-label="Ver ${esc(item.nombre)}">${preview}<span class="asset-format">${esc(extension)}</span><span class="preview-overlay">Ampliar ↗</span></button><div class="card-body"><p class="asset-kind">${video ? 'VIDEO' : 'IMAGEN'}${fileSize(item.sizeMB) ? ' · '+esc(fileSize(item.sizeMB)) : ''}</p><h3 class="card-title" title="${esc(item.nombre)}">${esc(item.nombre)}</h3><div class="actions"><button class="btn btn-link" type="button" data-preview="${index}">Ver ${video ? 'video' : 'imagen'}</button><a class="btn btn-download" href="${esc(safeUrl(item.downloadUrl))}" target="_blank" rel="noopener noreferrer" aria-label="Descargar ${esc(item.nombre)}">↓ Descargar</a></div></div></article>`;
  }
  function updateCount(total) {
    $('mediaResultsHeading').hidden = !items.length; $('visibleFileCount').textContent = `${items.length} de ${total}`;
    status.textContent = query ? `${total} ${total === 1 ? 'resultado' : 'resultados'} para “${query}”` : !path ? `${childFolders.length} marcas para explorar` : `${childFolders.length ? childFolders.length + ' carpetas · ' : ''}${total} ${total === 1 ? 'archivo' : 'archivos'}`;
  }
  async function load(offset = 0, refresh = false) {
    const current = ++request;
    controller?.abort(); controller = new AbortController();
    const activePath = path, activeQuery = query, activeType = type.value;
    const key = JSON.stringify([activePath,activeQuery,activeType,offset]);
    if (refresh) cache.clear();
    breadcrumbs(); more.hidden = true; grid.setAttribute('aria-busy','true'); status.textContent = 'Preparando tu biblioteca…';
    if (!offset) {
      loaded = false;
      if (viewer.open) viewer.close();
      items = []; childFolders = []; folders.replaceChildren(); tiles.replaceChildren(); tiles.hidden = true; $('mediaResultsHeading').hidden = true;
      grid.innerHTML = Array.from({length:6},()=>'<div class="asset-skeleton" aria-hidden="true"><div></div><span></span><span></span></div>').join('');
    } else more.disabled = true;
    try {
      let data = cache.get(key);
      if (!data) {
        const url = new URL(window.BANCO_MEDIOS_IMAGES_API_URL || window.BANCO_MEDIOS_API_URL);
        [['accion','imagenes'],['path',activePath],['offset',offset],['q',activeQuery],['type',activeType]].forEach(([name,value])=>url.searchParams.set(name,value));
        const response = await fetch(url,{signal:controller.signal});
        if (!response.ok) throw new Error('No pudimos cargar esta carpeta. Volvé a intentarlo.');
        data = await response.json(); if (!data.ok) throw new Error(data.error || 'No pudimos cargar esta carpeta.');
        if (cache.size >= 40) cache.delete(cache.keys().next().value); cache.set(key,data);
      }
      if (current !== request) return;
      if (!offset) { grid.replaceChildren(); childFolders = data.folders || []; renderFolders(); }
      const start = items.length; items.push(...(data.items || []));
      grid.insertAdjacentHTML('beforeend',(data.items || []).map((item,index)=>card(item,start+index)).join(''));
      grid.querySelectorAll('img').forEach(img => { img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'),{className:'image-unavailable',textContent:'Vista previa no disponible'})); }; });
      nextOffset = data.nextOffset; more.hidden = nextOffset == null; more.disabled = false;
      more.textContent = `Cargar más archivos · ${items.length} de ${data.total}`; updateCount(data.total);
      if (!items.length) grid.innerHTML = `<div class="library-empty"><span aria-hidden="true">${query ? '⌕' : childFolders.length ? '↗' : '▧'}</span><h3>${query ? 'No encontramos ese archivo' : childFolders.length ? 'Tu próximo contenido está acá' : 'Esta carpeta no tiene contenido para mostrar'}</h3><p>${query ? 'Probá con otra parte del nombre o abrí una subcarpeta.' : childFolders.length ? 'Elegí una carpeta para descubrir sus imágenes y videos.' : 'Volvé a la carpeta anterior o cambiá el tipo de archivo.'}</p></div>`;
      loaded = true;
    } catch (error) {
      if (current !== request || error.name === 'AbortError') return;
      status.textContent = error.message;
      if (!offset) grid.innerHTML = '<div class="library-empty"><span aria-hidden="true">↻</span><h3>La carpeta no pudo cargarse</h3><p>Podés volver a intentarlo sin perder tu ubicación.</p><button class="btn btn-link" type="button" id="retryMedia">Reintentar</button></div>';
      $('retryMedia')?.addEventListener('click',()=>load(0,true)); more.hidden = !offset;
    } finally { if (current === request) { grid.setAttribute('aria-busy','false'); more.disabled = false; } }
  }
  function openViewer(index) {
    const item = items[index]; if (!item) return; activeIndex = index;
    $('viewerTitle').textContent = item.nombre; $('viewerDownload').href = safeUrl(item.downloadUrl); $('viewerExternal').href = safeUrl(item.url);
    $('viewerPosition').textContent = `${index+1} / ${items.length}${fileSize(item.sizeMB) ? ' · '+fileSize(item.sizeMB) : ''}`;
    $('previousMedia').disabled = index === 0; $('nextMedia').disabled = index === items.length-1;
    $('viewerContent').innerHTML = item.kind === 'video' ? `<video controls playsinline preload="metadata" src="${esc(safeUrl(item.previewUrl))}" aria-label="${esc(item.nombre)}"></video><p>Si el formato no se reproduce, abrilo en Dropbox.</p>` : `<img src="${esc(safeUrl(item.previewUrl))}" alt="${esc(item.nombre)}" referrerpolicy="no-referrer">`;
    if (!viewer.open) viewer.showModal();
  }
  grid.addEventListener('click',event=>{const button=event.target.closest('[data-preview]'); if(button) openViewer(Number(button.dataset.preview));});
  $('closeViewer').onclick=()=>viewer.close(); viewer.addEventListener('close',()=>{$('viewerContent').replaceChildren();});
  viewer.addEventListener('click',event=>{if(event.target===viewer){const r=viewer.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)viewer.close();}});
  $('previousMedia').onclick=()=>openViewer(activeIndex-1); $('nextMedia').onclick=()=>openViewer(activeIndex+1);
  viewer.addEventListener('keydown',event=>{if(event.target.closest('video'))return; if(event.key==='ArrowLeft'){event.preventDefault();openViewer(activeIndex-1);}if(event.key==='ArrowRight'){event.preventDefault();openViewer(activeIndex+1);}});
  function selectSource(dropbox, updateLocation = true) {
    panel.hidden = !dropbox; document.querySelectorAll('[data-video-section]').forEach(section=>{section.hidden=dropbox;});
    $('loadMoreWrap').hidden = dropbox || state.renderedCount >= state.filtered.length;
    document.querySelectorAll('[data-media-tab]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.mediaTab==='images')===dropbox)));
    if(updateLocation)syncLocation(); if(dropbox&&!loaded)load();
    if(!dropbox){controller?.abort();request++;grid.setAttribute('aria-busy','false');}
  }
  document.querySelectorAll('[data-media-tab]').forEach(button=>button.addEventListener('click',()=>selectSource(button.dataset.mediaTab==='images')));
  $('rootImages').onclick=()=>navigate(''); $('backImages').onclick=()=>navigate(path.slice(0,path.lastIndexOf('/')));
  $('folderSearch').oninput=renderFolders; more.onclick=()=>load(nextOffset); $('refreshImages').onclick=()=>load(0,true);
  function submitSearch(){query=search.value.trim();$('clearDropboxSearch').hidden=!query;syncLocation();load();}
  $('dropboxSearchForm').onsubmit=event=>{event.preventDefault();submitSearch();}; type.onchange=submitSearch;
  $('clearDropboxSearch').onclick=()=>{search.value='';submitSearch();search.focus();}; search.oninput=()=>{$('clearDropboxSearch').hidden=!search.value;};
  function setView(list){grid.classList.toggle('is-list',list);$('gridView').setAttribute('aria-pressed',String(!list));$('listView').setAttribute('aria-pressed',String(list));}
  $('gridView').onclick=()=>setView(false);$('listView').onclick=()=>setView(true);
  function readLocation(){const params=new URL(location.href).searchParams;path=params.get('folder')||'';query=params.get('q')||'';search.value=query;$('folderSearch').value='';type.value=['all','image','video'].includes(params.get('type'))?params.get('type'):'all';$('clearDropboxSearch').hidden=!query;loaded=false;selectSource(params.get('media')==='dropbox',false);}
  window.addEventListener('popstate',readLocation);readLocation();
})();
