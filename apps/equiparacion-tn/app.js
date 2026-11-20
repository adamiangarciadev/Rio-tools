(() => {
  'use strict';
  if (!window.RioContext?.canUse({slug:'equiparacion-tn',restricted:true})) return;
  const $ = id => document.getElementById(id);
  let index, file, result, reportDate, fileVersion = 0;
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function group(container, title, headers, rows) {
    const details = element('details'), summary = element('summary'), wrap = element('div');
    details.className = 'move-card';
    summary.append(element('h3',title));
    details.append(summary);
    wrap.className = 'stock-table-wrap';
    details.append(wrap);
    details.addEventListener('toggle', () => {
      if (!details.open || wrap.childElementCount) return;
      const table = element('table');
      table.className = 'stock-table';
      const heading = table.createTHead().insertRow();
      headers.forEach(h => heading.append(element('th',h)));
      const body = table.createTBody();
      for (const row of rows) {
        const tr = body.insertRow();
        row.forEach(value => tr.append(element('td',value)));
      }
      wrap.append(table);
    });
    container.append(details);
  }

  function render() {
    $('plans').replaceChildren();
    $('issues').replaceChildren();
    result = file && index ? RioTN.prepare(file,index) : null;
    $('exportBtn').disabled = !result?.moves.length;
    if (!result) {
      $('summary').textContent = file ? 'Esperando el reporte de Río.' : 'Elegí un CSV para preparar la reposición.';
      return;
    }
    const {moves, issues, reviewed} = result;
    const units = moves.reduce((sum,m) => sum+m.qty, 0);
    $('summary').textContent = reviewed+' variantes con stock menor a 5 · '+units+' unidades a preparar';
    const branches = new Map();
    for (const m of moves) {
      if (!branches.has(m.from)) branches.set(m.from, []);
      branches.get(m.from).push([m.sku,m.name,m.stock,m.qty]);
    }
    for (const [branch,rows] of branches) {
      const qty = rows.reduce((sum,r) => sum+r[3], 0);
      group($('plans'),branch+' · '+qty+' u.', ['SKU','Artículo','Stock TN','Enviar'], rows);
    }
    if (!moves.length) $('plans').textContent = 'Sin movimientos sugeridos.';
    if (issues.length) group($('issues'),issues.length+' casos para revisar',['SKU o fila','Motivo'],issues);
    else $('issues').textContent = 'Sin pendientes.';
  }

  $('file').onchange = async event => {
    const selected = event.target.files[0], version = ++fileVersion;
    file = null;
    render();
    $('fileStatus').textContent = selected ? 'Leyendo el CSV…' : '';
    if (!selected) return;
    try {
      const buffer = await selected.arrayBuffer();
      if (version !== fileVersion) return;
      let source;
      try { source = new TextDecoder('utf-8',{fatal:true}).decode(buffer); }
      catch { source = new TextDecoder('windows-1252').decode(buffer); }
      file = RioTN.readFile(source);
      $('fileStatus').textContent = selected.name;
    } catch (e) { $('fileStatus').textContent = e.message; }
    render();
  };

  async function load() {
    index = null;
    render();
    $('reportDate').textContent = '—';
    $('reloadBtn').disabled = true;
    $('dataStatus').textContent = 'Consultando el reporte de Río…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),60000);
    try {
      const url = new URL(window.STOCK_VENTAS_API_URL);
      url.searchParams.set('v',Date.now());
      const response = await fetch(url,{cache:'no-store',signal:controller.signal});
      if (!response.ok) throw Error();
      const report = await response.json();
      if (!Array.isArray(report.records) || !/^\d{4}-\d{2}-\d{2}$/.test(report.reportDate)) throw Error();
      index = RioTN.indexReport(report);
      reportDate = report.reportDate;
      $('reportDate').textContent = reportDate.split('-').reverse().join('/');
      $('dataStatus').textContent = report.records.length.toLocaleString('es-AR')+' variantes en Río';
    } catch { $('dataStatus').textContent = 'No se pudo cargar el reporte. Volvé a actualizarlo.'; }
    finally { clearTimeout(timer); $('reloadBtn').disabled = false; render(); }
  }

  $('exportBtn').onclick = () => {
    if (!result?.moves.length) return;
    const csv = Papa.unparse({fields:['Desde','Destino','Artículo','Cód. color','Cód. talle','SKU','Descripción','Stock TN','Enviar'],
      data:result.moves.map(m => [m.from,m.to,...m.sku.split('#'),m.sku,m.name,m.stock,m.qty])},
      {delimiter:';',escapeFormulae:true});
    const link = element('a');
    link.href = URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
    link.download = 'equiparacion-tn-'+reportDate+'.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href),1000);
  };
  $('reloadBtn').onclick = load;
  load();
})();
