(() => {
  const panel = document.querySelector('#imagesPanel');
  const grid = document.querySelector('#imagesGrid');
  const status = document.querySelector('#imagesStatus');
  const folders = document.querySelector('#imageFolders');
  const more = document.querySelector('#moreImages');
  const back = document.querySelector('#backImages');
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
    status.textContent = 'Cargando imágenes de Dropbox…';
    if (!offset) { grid.innerHTML = ''; folders.innerHTML = ''; }
    back.hidden = !path;
    try {
      const url = new URL(window.BANCO_MEDIOS_IMAGES_API_URL || window.BANCO_MEDIOS_API_URL);
      url.searchParams.set('accion', 'imagenes');
      url.searchParams.set('path', path);
      url.searchParams.set('offset', offset);
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo cargar Dropbox.');
      const data = await response.json();
      if (current !== request) return;
      if (!data.ok) throw new Error(data.error || 'No se pudo cargar Dropbox.');
      if (!offset) {
        (data.folders || []).forEach(folder => {
          const button = document.createElement('button');
          button.className = 'btn btn-link'; button.textContent = '📁 ' + folder.name;
          button.onclick = () => { path = folder.path; load(); };
          folders.appendChild(button);
        });
      }
      grid.insertAdjacentHTML('beforeend', (data.items || []).map(item => `
        <article class="card"><div class="card-preview"><a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer"><img class="media-image" src="${esc(safeUrl(item.previewUrl))}" alt="${esc(item.nombre)}" loading="lazy" referrerpolicy="no-referrer"></a></div>
        <div class="card-body"><h3 class="card-title">${esc(item.nombre)}</h3><p class="meta">Dropbox · ${esc(path || 'Catálogos')}</p><div class="actions"><a class="btn btn-download" href="${esc(safeUrl(item.downloadUrl))}" target="_blank" rel="noopener noreferrer">Descargar imagen</a><a class="btn btn-link" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">Ver imagen</a></div></div></article>`).join(''));
      nextOffset = data.nextOffset;
      more.hidden = nextOffset == null;
      status.textContent = `${path || 'Catálogos - Productos Línea'} · ${data.total} imágenes`;
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
  back.onclick = () => { path = path.slice(0, path.lastIndexOf('/')); load(); };
  more.onclick = () => load(nextOffset);
  document.querySelector('#refreshImages').onclick = () => load();
})();
