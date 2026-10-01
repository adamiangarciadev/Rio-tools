/* Compartido entre el navegador, Apps Script y las pruebas. */
var PreciosCore = (function () {
  'use strict';
  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  function csv(text) {
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0];
    const delimiter = (first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length ? ';' : ',';
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && (c === delimiter || c === '\n' || c === '\r')) {
        row.push(field); field = '';
        if (c !== delimiter) { if (c === '\r' && text[i + 1] === '\n') i++; if (row.some(x => x.trim())) rows.push(row); row = []; }
      } else field += c;
    }
    if (quoted) throw new Error('CSV incompleto: comillas sin cerrar.');
    row.push(field); if (row.some(x => x.trim())) rows.push(row);
    return rows;
  }
  function price(value) {
    const raw = String(value).trim();
    if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(raw)) throw new Error('Precio inválido: ' + raw);
    return Number(raw.replace(/\./g, '').replace(',', '.'));
  }
  function parse(text, expected) {
    const table = csv(text), headers = (table.shift() || []).map(norm);
    const columns = ['PROVEEDOR - DESCRIPCION', 'ARTICULO - CODIGO', 'CLASIFICACION', 'TALLE', 'LISTA DE PRECIOS - NUMERO', 'PRECIO'].map(h => headers.indexOf(h));
    if (columns.includes(-1)) throw new Error('El CSV no tiene las columnas del reporte de precios zNube.');
    const entries = new Map();
    table.forEach((row, index) => {
      const values = columns.map(i => String(row[i] == null ? '' : row[i]).trim());
      const [proveedor, articulo, clasificacion, talle, lista, raw] = values;
      if (!articulo || norm(lista) !== expected) throw new Error('Fila ' + (index + 2) + ': artículo o lista inválidos.');
      const id = JSON.stringify([proveedor, articulo, talle]);
      const item = { id, proveedor, articulo, clasificacion, talle, precio: price(raw) };
      const previous = entries.get(id);
      if (previous && (previous.precio !== item.precio || previous.clasificacion !== clasificacion)) throw new Error('Duplicado contradictorio: ' + articulo + ' / ' + talle);
      entries.set(id, item);
    });
    if (!entries.size) throw new Error('La lista está vacía.');
    return entries;
  }
  function merge(one, three) {
    return [...new Set([...one.keys(), ...three.keys()])].map(id => {
      const a = one.get(id), b = three.get(id), source = a || b;
      return { id, proveedor: source.proveedor, articulo: source.articulo, clasificacion: source.clasificacion, talle: source.talle,
        lista1: a ? a.precio : null, lista3: b ? b.precio : null,
        diferencia: a && b && a.precio > 0 ? (b.precio - a.precio) / a.precio : null,
        conflicto: !!(a && b && a.clasificacion !== b.clasificacion) };
    }).sort((a,b) => a.proveedor.localeCompare(b.proveedor) || a.articulo.localeCompare(b.articulo) || a.talle.localeCompare(b.talle));
  }
  function condition(value) { const n = norm(value); return n.includes('DISC') ? 'Discontinuo' : n.includes('LINEA') ? 'Línea' : n ? 'Otra clasificación' : 'Sin clasificación'; }
  function tienda(text) {
    const table=csv(text), headers=(table.shift()||[]).map(norm), index=headers.indexOf('SKU');
    if(index<0)throw new Error('El archivo de Tiendanube no tiene una columna SKU.');
    const sourceRows=table.map((row,i)=>{const sku=String(row[index]||'').trim();return {fila:i+2,sku,articulo:sku.split('#')[0].trim()};});
    if(!sourceRows.length)throw new Error('El CSV de Tiendanube está vacío.');
    return {sourceRows,articles:[...new Set(sourceRows.filter(r=>r.articulo).map(r=>r.articulo))],emptyCount:sourceRows.filter(r=>!r.articulo).length};
  }
  function matchTienda(rows, imported) {
    const index=new Map(); rows.forEach(r=>{if(!index.has(r.articulo))index.set(r.articulo,[]);index.get(r.articulo).push(r);});
    return imported.articles.flatMap(articulo=>index.get(articulo)||[{id:'tienda-missing:'+JSON.stringify(articulo),proveedor:'',articulo,clasificacion:'Sin coincidencia',talle:'',lista1:null,lista3:null,diferencia:null,missing:true}]);
  }
  function unify(rows) {
    const groups=new Map();
    rows.forEach(row=>{
      const key=JSON.stringify([row.proveedor,row.articulo,row.clasificacion,row.lista1,row.lista3,!!row.conflicto,!!row.missing]);
      if(!groups.has(key))groups.set(key,{row:{...row,id:'unified:'+key},sizes:new Set()});
      const group=groups.get(key); if(row.talle)group.sizes.add(row.talle);
    });
    return [...groups.values()].map(group=>({...group.row,talle:[...group.sizes].sort((a,b)=>a.localeCompare(b,'es',{numeric:true})).join(' / ')}));
  }
  return { norm, csv, parse, merge, condition, tienda, matchTienda, unify };
})();

// Crear un proyecto separado y copiar también core.js como Core.gs.
const PRECIOS_TZ = 'America/Argentina/Buenos_Aires';

function instalarPreciosWeb() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'actualizarPreciosProgramado') ScriptApp.deleteTrigger(t);
  });
  // Chequeo cada cinco minutos: evita la variación de +/-15 min de nearMinute.
  ScriptApp.newTrigger('actualizarPreciosProgramado').timeBased().everyMinutes(5).create();
  actualizarPreciosProgramado();
}

function actualizarPreciosProgramado() {
  const props = PropertiesService.getScriptProperties();
  try { actualizarPreciosWeb(); }
  catch (error) { props.setProperty('syncError', error.message); console.error(error); }
}

function actualizarPreciosWeb() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const now = new Date();
    const one = buscarListaPrecios_(1), three = buscarListaPrecios_(3);
    const props = PropertiesService.getScriptProperties(), id = props.getProperty('reportFileId');
    const fingerprint = JSON.stringify([one.source.messageId,three.source.messageId]);
    if(id && props.getProperty('completedSources')===fingerprint){props.setProperty('syncError','');return;}
    const day = Utilities.formatDate(new Date(Math.min(new Date(one.source.date).getTime(),new Date(three.source.date).getTime())),PRECIOS_TZ,'yyyy-MM-dd');
    // Se validan ambas listas antes de reemplazar el reporte anterior.
    const rows = PreciosCore.merge(PreciosCore.parse(one.text, 'LISTA1'), PreciosCore.parse(three.text, 'LISTA3'));
    const report = {ok:true,day,updatedAt:now.toISOString(),sources:{lista1:one.source,lista3:three.source},rows};
    const json = JSON.stringify(report);
    if (id) DriveApp.getFileById(id).setContent(json);
    else {
      const folder = DriveApp.createFolder('Rio - Precios WEB');
      const file = folder.createFile('precios-web.json',json,MimeType.PLAIN_TEXT);
      props.setProperty('reportFileId',file.getId());
    }
    props.setProperties({completedSources:fingerprint,syncError:''});
    return report;
  } finally {lock.releaseLock();}
}

function buscarListaPrecios_(list) {
  const subject = 'Reporte zNube - PRECIOS LISTA' + list;
  const matches = [], query = 'from:znube@zoologic.com.ar subject:"' + subject + '" has:attachment';
  for (let offset=0; ; offset+=100) {
    const threads=GmailApp.search(query,offset,100);
    threads.forEach(thread=>thread.getMessages().forEach(message=>{
      const date=message.getDate();
      const sender=message.getFrom().toLowerCase();
      if(message.getSubject().trim()!==subject || !/^(?:znube@zoologic\.com\.ar|.*<znube@zoologic\.com\.ar>)$/.test(sender)) return;
      matches.push({message,date});
    }));
    if(threads.length<100)break;
  }
  matches.sort((a,b)=>b.date-a.date);
  if(!matches.length)throw new Error('No se encontró un mail de LISTA'+list+'. Se conserva el último reporte completo.');
  const latest=matches[0], message=latest.message;
  const attachments=message.getAttachments({includeInlineImages:false}).filter(a=>/\.csv$/i.test(a.getName()) && new RegExp('LISTA'+list+'\\.CSV$','i').test(a.getName()));
  if(attachments.length!==1)throw new Error('El último mail de '+subject+' no tiene un único CSV válido.');
  return {text:attachments[0].getDataAsString('UTF-8'),source:{date:latest.date.toISOString(),filename:attachments[0].getName(),messageId:message.getId()}};
}

function doGet() {
  try {
    const props=PropertiesService.getScriptProperties(), id=props.getProperty('reportFileId');
    if(!id)throw new Error(props.getProperty('syncError') || 'Todavía no se procesaron ambas listas.');
    const report=JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString());
    report.syncError=props.getProperty('syncError') || '';
    return preciosJson_(report);
  } catch(error){return preciosJson_({ok:false,error:error.message});}
}
function preciosJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
