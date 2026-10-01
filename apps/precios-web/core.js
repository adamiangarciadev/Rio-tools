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
  return { norm, csv, parse, merge, condition, tienda, matchTienda };
})();
if (typeof module !== 'undefined') module.exports = PreciosCore;
