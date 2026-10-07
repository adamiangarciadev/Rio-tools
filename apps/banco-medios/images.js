(() => {
  const panel = document.querySelector('#imagesPanel');
  const grid = document.querySelector('#imagesGrid');
  const status = document.querySelector('#imagesStatus');
  const folders = document.querySelector('#imageFolders');
  const more = document.querySelector('#moreImages');
  const back = document.querySelector('#backImages');
  const search = document.querySelector('#dropboxSearch');
  const type = document.querySelector('#dropboxType');
  let query = '';
  let path = '';
  let nextOffset = null;
  let request = 0;
  let loaded = false;
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && /^(www\.)?dropbox\.com$/.test(url.hostname) ? url.href : '#'; } catch { return '#'; }
  }
  async function load(offset = 0) {
    const current = ++request;
    more.hidden = true;
    status.textContent = 'Cargando archivos de Dropbox…';
    if (!offset) { grid.innerHTML = ''; folders.innerHTML = ''; }
    back.hidden = !path;
    try {
      const url = new URL(window.BANCO_MEDIOS_IMAGES_API_URL || window.BANCO_MEDIOS_API_URL);
      url.searchParams.set('accion', 'imagenes');
      url.searchParams.set('path', path);
      url.searchParams.set('offset', offset);
      url.searchParams.set('q', query);
      url.searchParams.set('type', type.value);
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo cargar Dropbox.');
      const data = await response.json();
      if (current !== request) return;
      if (!data.ok) throw new Error(data.error || 'No se pudo cargar Dropbox.');
      if (!offset) {
        (data.folders || []).forEach(folder => {
          const button = document.createElement('button');
          button.className = 'btn btn-link'; button.textContent = '📁 ' + folder.name;
          button.onclick = () => { path = folder.path; query = ''; search.value = ''; load(); };
          folders.appendChild(button);
        });
      }
      grid.insertAdjacentHTML('beforeend', (data.items || []).map(item => {
        const video = item.kind === 'video';
        const label = video ? 'video' : 'imagen';
        const preview = video
          ? `<video class="media-image" controls playsinline preload="none" aria-label="${esc(item.nombre)}" src="${esc(safeUrl(item.previewUrl))}"></video>`
          : `<a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer"><img class="media-image" src="${esc(safeUrl(item.previewUrl))}" alt="${esc(item.nombre)}" loading="lazy" referrerpolicy="no-referrer"></a>`;
        return `<article class="card"><div class="card-preview">${preview}</div>
        <div class="card-body"><h3 class="card-title">${esc(item.nombre)}</h3><p class="meta">${video ? 'Video' : 'Imagen'} · Dropbox · ${esc(path || 'Catálogos')}</p>${video ? '<p class="meta">Si el formato no se reproduce aquí, usá Ver video o descargalo.</p>' : ''}<div class="actions"><a class="btn btn-download" href="${esc(safeUrl(item.downloadUrl))}" target="_blank" rel="noopener noreferrer">Descargar ${label}</a><a class="btn btn-link" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">Ver ${label}</a></div></div></article>`;
      }).join(''));
      nextOffset = data.nextOffset;
      more.hidden = nextOffset == null;
      status.textContent = `${path || 'Catálogos - Productos Línea'} · ${data.total} archivos${query ? ` que coinciden con “${query}”` : ''}`;
      if (!offset && !data.items?.length) grid.innerHTML = '<p class="empty">No hay imágenes ni videos que coincidan en esta carpeta. Podés abrir una subcarpeta o cambiar la búsqueda.</p>';
      loaded = true;
    } catch (error) {
      if (current === request) { status.textContent = error.message; if (offset) more.hidden = false; }
    }
  }
  document.querySelectorAll('[data-media-tab]').forEach(button => button.addEventListener('click', () => {
    const images = button.dataset.mediaTab === 'images';
    panel.hidden = !images;
    document.querySelectorAll('[data-video-section]').forEach(section => { section.hidden = images; });
    document.querySelector('#loadMoreWrap').hidden = images || state.renderedCount >= state.filtered.length;
    document.querySelectorAll('[data-media-tab]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    if (images && !loaded) load();
  }));
  back.onclick = () => { path = path.slice(0, path.lastIndexOf('/')); query = ''; search.value = ''; load(); };
  more.onclick = () => load(nextOffset);
  document.querySelector('#refreshImages').onclick = () => load();
  document.querySelector('#dropboxSearchForm').onsubmit = event => { event.preventDefault(); query = search.value.trim(); load(); };
  type.onchange = () => { query = search.value.trim(); load(); };
  search.addEventListener('input', () => {
    // Immediately invalidate pending responses when the search is edited.
    request++;
    more.hidden = true;
    status.textContent = 'Presioná Buscar para aplicar el nombre en esta carpeta.';
  });
})();
