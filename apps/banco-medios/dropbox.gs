// Credenciales exclusivamente en Propiedades del script, nunca en archivos publicados.
function dropboxImages(params) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const link = properties.getProperty('DROPBOX_SHARED_LINK');
    const secret = properties.getProperty('DROPBOX_APP_SECRET');
    const refresh = properties.getProperty('DROPBOX_REFRESH_TOKEN');
    const key = properties.getProperty('DROPBOX_APP_KEY');
    if (!link || !secret || !refresh || !key) return jsonOutput({ok:false, error:'Falta configurar Dropbox en el servidor.'});
    const path = String(params.path || '');
    if (path && (path[0] !== '/' || path.split('/').some(function(p) { return p === '..' || p === '.'; }) || /[\\\x00-\x1f]/.test(path))) {
      return jsonOutput({ok:false, error:'Carpeta no valida.'});
    }
    const tokenResponse = UrlFetchApp.fetch('https://api.dropboxapi.com/oauth2/token', {
      method:'post', payload:{grant_type:'refresh_token', refresh_token:refresh, client_id:key, client_secret:secret}, muteHttpExceptions:true
    });
    if (tokenResponse.getResponseCode() !== 200) throw new Error('auth');
    const token = JSON.parse(tokenResponse.getContentText()).access_token;
    function call(route, body) {
      const response = UrlFetchApp.fetch('https://api.dropboxapi.com/2/' + route, {
        method:'post', contentType:'application/json', headers:{Authorization:'Bearer ' + token}, payload:JSON.stringify(body), muteHttpExceptions:true
      });
      if (response.getResponseCode() !== 200) throw new Error('dropbox');
      return JSON.parse(response.getContentText());
    }
    // Only list inside the configured shared link. Never accept a link from the browser.
    let page = call('files/list_folder', {path:path, shared_link:{url:link}, limit:100});
    let entries = page.entries;
    while (page.has_more) {
      page = call('files/list_folder/continue', {cursor:page.cursor});
      entries = entries.concat(page.entries);
    }
    const folders = [];
    const images = [];
    const query = String(params.q || '').trim().toLowerCase();
    const type = String(params.type || 'all');
    entries.forEach(function(entry) {
      const relativePath = path + '/' + entry.name;
      if (entry['.tag'] === 'folder') folders.push({name:entry.name, path:relativePath});
      else {
        const kind = /\.(jpe?g|png|webp|gif|bmp)$/i.test(entry.name) ? 'image' : /\.(mp4|mov|m4v|webm|avi|mpeg|mpg)$/i.test(entry.name) ? 'video' : '';
        if (kind && (!query || entry.name.toLowerCase().indexOf(query) >= 0) && (type === 'all' || type === kind)) {
          images.push({id:entry.id, nombre:entry.name, path:relativePath, kind:kind, sizeMB:entry.size / 1048576});
        }
      }
    });
    // Fetch preview links in small batches to keep each request bounded.
    const offset = Math.max(0, Math.floor(Number(params.offset) || 0));
    const selected = images.slice(offset, offset + 12);
    selected.forEach(function(item) {
      const metadata = call('sharing/get_shared_link_metadata', {url:link, path:item.path});
      const url = metadata.url;
      if (!/^https:\/\/(www\.)?dropbox\.com\//.test(url)) throw new Error('url');
      function mode(value) {
        return url.replace(/([?&])(dl|raw)=[^&]*/g, '$1').replace(/[?&]$/, '') + (url.indexOf('?') >= 0 ? '&' : '?') + value;
      }
      item.url = mode('dl=0');
      item.previewUrl = mode('raw=1');
      item.downloadUrl = mode('dl=1');
    });
    return jsonOutput({ok:true, path:path, folders:folders, items:selected, total:images.length, nextOffset:offset + selected.length < images.length ? offset + selected.length : null});
  } catch (error) {
    return jsonOutput({ok:false, error:'No se pudo leer Dropbox. Revisa la conexion y el acceso a la carpeta.'});
  }
}
