(() => {
  'use strict';
  if (window.RioContext?.branch !== 'DEPOSITO' || !window.RioAccess?.isUnlocked()) return;
  const API = 'https://hczekjyagyoxdqkzdimd.supabase.co/functions/v1/mt2-web-api';
  const CONFIRMABLE_STATES = new Set(['RECIBIDO EN SUCURSAL','DIFERENCIAS']);
  const $ = id => document.getElementById(id);
  const norm = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let records = [], selected = new Set(), busy = false, batch = [], needsRefresh = false;
  const snapshots = new Map();
  const identity = row => String(row.id || '');
  function rebuild(fresh) {
    const combined = new Map();
    for (const [branch, rows] of snapshots) for (const row of rows) {
      const id = identity(row), stale = !fresh.has(branch);
      if (!combined.has(id) || !stale) combined.set(id, {...row, stale});
    }
    records = [...combined.values()];
    records.forEach(row => row.ambiguous = !identity(row));
    const previous = $('branch').value;
    $('branch').innerHTML = '<option value="">Todas las sucursales</option>' + [...new Set(records.map(row => row.hacia).filter(Boolean))].sort().map(branch => `<option>${esc(branch)}</option>`).join('');
    $('branch').value = previous;
    render();
  }
  const key = row => identity(row);
  function dateKey(value) {
    const text = String(value || '');
    const local = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (local) return `${local[3]}-${local[2]}-${local[1]}`;
    return text.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
  }
  function visible() {
    const from = $('from').value, to = $('to').value;
    return records.filter(row => {
      const date = dateKey(row.fecha);
      return CONFIRMABLE_STATES.has(norm(row.estado)) && (!$('branch').value || norm(row.hacia) === norm($('branch').value)) &&
        (!from || (date && date >= from)) && (!to || (date && date <= to)) && String(row.remito).includes($('search').value.trim());
    }).sort((a,b) => dateKey(a.fecha).localeCompare(dateKey(b.fecha)) || String(a.remito).localeCompare(String(b.remito)));
  }
  function render() {
    const rows = visible();
    $('rows').innerHTML = rows.map(row => `<tr><td><input type="checkbox" data-key="${esc(key(row))}" aria-label="Seleccionar remito ${esc(row.remito)}" ${selected.has(key(row))?'checked':''} ${busy || row.ambiguous || row.stale?'disabled':''}></td><td>${esc(row.fecha)}</td><td>${esc(row.remito)}</td><td>${esc(row.desde)}</td><td>${esc(row.hacia)}</td><td>${esc(row.total_prendas)}</td><td>${esc(row.estado)}${row.ambiguous?' · Identificador inválido':''}${row.stale?' · Pendiente de actualizar':''}</td></tr>`).join('') || `<tr><td colspan="7">${busy?'Cargando remitos…':'No hay remitos listos para confirmar con estos filtros.'}</td></tr>`;
    $('count').textContent = `${selected.size} seleccionados · ${rows.length} visibles`;
    $('review').disabled = busy || needsRefresh || !selected.size;
    $('selectAll').disabled = busy;
    $('clear').disabled = busy;
    $('controls').disabled = busy;
  }
  async function request(op, data = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(API, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,op}),signal:controller.signal,cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result?.error) throw new Error(result.error);
      return result;
    } finally { clearTimeout(timer); }
  }
  async function listBranch(branch) {
    const all = [];
    for (let offset = 0; ; offset += 50) {
      const page = await request('list', {branch, state:'', search:'', offset});
      if (!Array.isArray(page)) throw new Error('Respuesta sin listado');
      all.push(...page);
      if (page.length < 50) return all;
    }
  }
  async function load() {
    if (busy) return;
    busy = true; selected.clear(); render(); $('status').textContent = 'Consultando remitos de todas las sucursales…';
    try {
      const data = await request('status');
      if (!Array.isArray(data.branches) || !data.branches.length) throw new Error('No se recibieron sucursales');
      const branches = [...new Set(data.branches.filter(Boolean))];
      const fresh = new Set(), failures = []; let cursor = 0, done = 0;
      async function worker() {
        while (cursor < branches.length) {
          const branch = branches[cursor++];
          try {
            const response = await listBranch(branch);
            snapshots.set(branch, response.map(record=>({...record.data,id:record.id,version:record.version,estado:record.estado})));
            fresh.add(branch);
            rebuild(fresh);
          } catch { failures.push(branch); }
          $('status').textContent = `Consultando sucursales: ${++done} de ${branches.length}…`;
        }
      }
      await Promise.all([worker(),worker()]);
      rebuild(fresh);
      if (!failures.length) needsRefresh = false;
      $('status').textContent = failures.length
        ? `Carga parcial: ${fresh.size} de ${branches.length} sucursales actualizadas. Faltan: ${failures.join(', ')}. Se muestran los remitos disponibles; los anteriores sin actualizar no se pueden confirmar. Volvé a actualizar para completar la carga.`
        : `Actualizado: ${new Date().toLocaleString('es-AR')}`;
    } catch (error) { $('status').textContent = `${error.message} ${records.length?'Se conserva el listado anterior.':''}`; }
    finally { busy = false; render(); }
  }
  for (const id of ['branch','from','to','search']) $(id).addEventListener('input', () => {selected.clear(); render();});
  $('rows').addEventListener('change', event => {const id=event.target.dataset.key;if(!id || busy)return;event.target.checked?selected.add(id):selected.delete(id);render();});
  $('selectAll').onclick = () => {visible().filter(row => !row.ambiguous && !row.stale).forEach(row => selected.add(key(row)));render();};
  $('clear').onclick = () => {selected.clear();render();};
  $('refresh').onclick = load;
  $('review').onclick = () => {
    batch = visible().filter(row => selected.has(key(row)) && !row.ambiguous && !row.stale);
    $('reviewList').innerHTML = batch.map(row => `<li>${esc(row.remito)} · ${esc(row.fecha)} · ${esc(row.desde)} → ${esc(row.hacia)}</li>`).join('');
    $('staff').value = ''; $('reviewDialog').showModal();
  };
  $('cancel').onclick = () => $('reviewDialog').close();
  $('cancelSecondary').onclick = () => $('reviewDialog').close();
  $('confirmForm').onsubmit = async event => {
    event.preventDefault();
    if (busy || needsRefresh || !batch.length || !window.RioAccess?.isUnlocked() || window.RioContext?.branch !== 'DEPOSITO' || localStorage.getItem('rio_workspace_branch_v1') !== 'DEPOSITO') return;
    const codigoPersonal = $('staff').value.trim(); if (!/^\d+$/.test(codigoPersonal)) return;
    $('reviewDialog').close(); busy = true; render(); $('results').hidden=false; $('outcomes').innerHTML='';
    let ok = 0, failed = 0;
    for (const row of batch) {
      $('summary').textContent = `Procesando ${ok+failed+1} de ${batch.length}…`;
      let message;
      try {
        await request('action',{id:row.id,version:row.version,estado:'CONFIRMADO OK',codigo:codigoPersonal,observacion:'',destino:'',files:[]});
        row.estado='CONFIRMADO OK'; selected.delete(key(row)); ok++; message='Confirmado OK';
        for (const rows of snapshots.values()) for (const cached of rows) if (identity(cached) === identity(row)) cached.estado='CONFIRMADO OK';
      } catch (error) {failed++;needsRefresh=true;message=`No confirmado o respuesta no recibida: ${error.message}. Actualizá el listado antes de volver a intentarlo.`;}
      const li=document.createElement('li');li.textContent=`${row.remito} · ${row.hacia}: ${message}`;$('outcomes').append(li);
      render();
    }
    $('summary').textContent=`${ok} confirmados · ${failed} requieren revisión.`;
    selected.clear(); batch=[]; busy=false; render();
    $('status').textContent='Confirmación terminada. Actualizá para comprobar el estado del servidor.';
  };
  window.addEventListener('beforeunload',event=>{if(busy && batch.length){event.preventDefault();event.returnValue='';}});
  load();
})();
