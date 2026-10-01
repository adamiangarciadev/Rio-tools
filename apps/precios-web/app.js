(() => {
  'use strict';
  const $ = id => document.getElementById(id), core = PreciosCore;
  let data = [], master = [], imported = null, filtered = [], page = 0, selected = new Set(), busy = false;
  const size = 100, money = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}), percent = new Intl.NumberFormat('es-AR',{style:'percent',maximumFractionDigits:2});
  const status = (text, warning=false) => { $('status').textContent=text; $('status').classList.toggle('warning',warning); };
  function options(id, values) { const input=$(id); input.replaceChildren(new Option('Todas / todos','')); [...new Set(values)].sort().forEach(v => input.add(new Option(v || (id==='provider'?'Sin proveedor':'Sin clasificación'),v || '__empty__'))); }
  function load(report, manual=false) {
    if (!Array.isArray(report.rows) || !report.rows.length) throw new Error('Todavía no hay un par de listas disponible.');
    master=core.unify(report.rows); data=imported?core.matchTienda(master,imported):master;
    const available=new Set(data.map(r=>r.id));selected=new Set([...selected].filter(id=>available.has(id))); page=0;
    if(imported)renderTienda();
    options('provider',data.map(r=>r.proveedor)); options('classification',data.map(r=>r.clasificacion));
    const incomplete=data.filter(r=>r.lista1===null || r.lista3===null).length, conflicts=data.filter(r=>r.conflicto).length;
    const date = value => new Date(value).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});
    $('dates').textContent=manual?'Carga manual · no reemplaza el reporte automático.':`Procesado: ${date(report.updatedAt)} · Lista 1: ${date(report.sources.lista1.date)} · Lista 3: ${date(report.sources.lista3.date)}`;
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date());
    const stale=!manual && report.day!==today;
    status(`${data.length.toLocaleString('es-AR')} artículos y talles · ${incomplete} sin ambas listas · ${conflicts} con clasificación distinta entre listas.${stale?' Atención: todavía se muestra un reporte de un día anterior.':''}${report.syncError?' '+report.syncError:''}`,stale||incomplete>0||conflicts>0||!!report.syncError);
    filter();
  }
  function resetFilters(){['article','provider','condition','classification','complete'].forEach(id=>$(id).value='');$('selectedOnly').checked=false;}
  function renderTienda(){
    const known=new Set(master.map(r=>r.articulo)), missing=imported.articles.filter(a=>!known.has(a)).length;
    $('tiendaStatus').textContent=`${imported.sourceRows.length} filas del archivo · ${imported.articles.length} artículos únicos · ${missing} sin coincidencia · ${imported.emptyCount} filas sin SKU utilizable. Los artículos sin coincidencia también se incluyen con precios vacíos.`;
    $('tiendaRows').replaceChildren();
    const fragment=document.createDocumentFragment();
    imported.sourceRows.forEach(r=>{const tr=document.createElement('tr');[r.fila,r.sku,r.articulo,!r.articulo?'Sin SKU':known.has(r.articulo)?'Encontrado':'Sin coincidencia'].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});fragment.append(tr);});
    $('tiendaRows').append(fragment);$('tiendaDetail').hidden=false;$('tiendaReset').hidden=false;
  }
  $('tiendaImport').onclick=async()=>{
    try{
      if(!master.length)throw new Error('Esperá a que carguen las listas de precios.');
      const file=$('tiendaFile').files[0];if(!file)throw new Error('Elegí el CSV de Tiendanube.');
      const buffer=await file.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('windows-1252').decode(buffer);}
      imported=core.tienda(text);data=core.matchTienda(master,imported);selected=new Set(data.map(r=>r.id));
      options('provider',data.map(r=>r.proveedor));options('classification',data.map(r=>r.clasificacion));resetFilters();renderTienda();filter();
    }catch(e){$('tiendaStatus').textContent=e.message;}
  };
  $('tiendaReset').onclick=()=>{imported=null;data=master;selected.clear();options('provider',data.map(r=>r.proveedor));options('classification',data.map(r=>r.clasificacion));resetFilters();$('tiendaStatus').textContent='';$('tiendaDetail').hidden=true;$('tiendaReset').hidden=true;filter();};
  function filter() {
    const query=core.norm($('article').value), supplier=$('provider').value, classification=$('classification').value;
    filtered=data.filter(r => core.norm(r.articulo).includes(query) && (!supplier||r.proveedor===(supplier==='__empty__'?'':supplier)) && (!$('condition').value||core.condition(r.clasificacion)===$('condition').value) && (!classification || r.clasificacion===(classification==='__empty__'?'':classification)) && (!$('selectedOnly').checked||selected.has(r.id)) && (!$('complete').value || ($('complete').value==='both' ? r.lista1!==null&&r.lista3!==null : r.lista1===null||r.lista3===null)));
    page=0; render();
  }
  function render() {
    page=Math.min(page,Math.max(0,Math.ceil(filtered.length/size)-1));
    $('rows').replaceChildren();
    filtered.slice(page*size,(page+1)*size).forEach(r => {
      const tr=document.createElement('tr'), td=document.createElement('td'), checkbox=document.createElement('input');
      checkbox.type='checkbox'; checkbox.checked=selected.has(r.id); checkbox.setAttribute('aria-label',`Seleccionar ${r.articulo}, talle ${r.talle || 'sin talle'}`);
      checkbox.addEventListener('change',()=>{checkbox.checked?selected.add(r.id):selected.delete(r.id); $('selectedOnly').checked?filter():render();}); td.append(checkbox); tr.append(td);
      [r.proveedor,r.articulo,r.clasificacion+(r.conflicto?' ⚠ Clasificación distinta':''),r.talle||'—',r.lista1===null?'Sin precio':money.format(r.lista1),r.lista3===null?'Sin precio':money.format(r.lista3),r.diferencia===null?'—':percent.format(r.diferencia)].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;tr.append(cell);});
      $('rows').append(tr);
    });
    $('count').textContent=`${filtered.length.toLocaleString('es-AR')} filas filtradas · ${selected.size.toLocaleString('es-AR')} seleccionadas en total`;
    $('export').disabled=!selected.size; $('prev').disabled=page===0; $('next').disabled=(page+1)*size>=filtered.length;
    $('page').textContent=`Página ${page+1} de ${Math.max(1,Math.ceil(filtered.length/size))}`;
  }
  async function readFile(file) {
    if (!file) throw new Error('Elegí un archivo para cada lista.');
    const text=await file.text(); if (!file.name.toLowerCase().endsWith('.eml')) return text;
    const parts=text.split(/\r?\n(?=Content-Type:)/i);
    const attachment=parts.find(p => /^Content-Type:\s*application\/octet-stream/i.test(p)&& /\.csv"?/i.test(p.split(/\r?\n\r?\n/)[0]));
    if (!attachment || !/Content-Transfer-Encoding:\s*base64/i.test(attachment)) throw new Error('No se encontró el adjunto CSV en el mail.');
    const encoded=attachment.split(/\r?\n\r?\n/).slice(1).join('\n\n').split(/\r?\n--/)[0].replace(/\s/g,'');
    return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));
  }
  $('import').onclick=async()=>{try{const [a,b]=await Promise.all([readFile($('file1').files[0]),readFile($('file3').files[0])]);load({rows:core.merge(core.parse(a,'LISTA1'),core.parse(b,'LISTA3'))},true);}catch(e){status(e.message,true);}};
  async function refresh() {
    if (busy) return;
    if (!window.PRECIOS_API_URL) {status('La conexión a Gmail está pendiente de activar. Podés cargar los dos mails o CSV manualmente.',true);return;}
    busy=true; $('refresh').disabled=true;
    try {const response=await fetch(window.PRECIOS_API_URL+'?accion=reporte'); if(!response.ok)throw new Error('No se pudo consultar el reporte.'); const report=await response.json();if(!report.ok)throw new Error(report.error);load(report);}catch(e){status(`No se pudo actualizar: ${e.message}. ${data.length?'Se conservan los precios de esta pantalla.':''}`,true);}finally{busy=false;$('refresh').disabled=false;}
  }
  ['article','provider','condition','classification','complete','selectedOnly'].forEach(id=>$(id).addEventListener(id==='article'?'input':'change',filter));
  $('select').onclick=()=>{filtered.forEach(r=>selected.add(r.id));render();}; $('clear').onclick=()=>{selected.clear();filter();};
  $('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('refresh').onclick=refresh;
  $('export').onclick=()=>{
    if(!window.XLSX){status('No se cargó la herramienta de Excel. Revisá la conexión y recargá la página.',true);return;}
    const rows=[['proveedor','articulo','clasificacion','talle','lista1','lista3','diferencia porcentual'],...data.filter(r=>selected.has(r.id)).map(r=>[r.proveedor,r.articulo,r.clasificacion,r.talle,r.lista1,r.lista3,r.diferencia])];
    const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=[24,22,38,16,18,18,25].map(wch=>({wch}));sheet['!autofilter']={ref:sheet['!ref']};
    for(let i=1;i<rows.length;i++)for(let c=4;c<=6;c++){const cell=sheet[XLSX.utils.encode_cell({r:i,c})];if(cell)cell.z=c===6?'0.00%':'#,##0.00';}
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Precios WEB');
    if(imported){const known=new Set(master.map(r=>r.articulo));const original=XLSX.utils.aoa_to_sheet([['Fila CSV','SKU original','Artículo','Coincidencia'],...imported.sourceRows.map(r=>[r.fila,r.sku,r.articulo,!r.articulo?'Sin SKU':known.has(r.articulo)?'Encontrado':'Sin coincidencia'])]);original['!cols']=[12,36,24,24].map(wch=>({wch}));XLSX.utils.book_append_sheet(book,original,'CSV Tiendanube');}
    XLSX.writeFile(book,'precios-web.xlsx');
  };
  render();refresh();setInterval(()=>{if(!document.hidden)refresh();},300000);
})();
