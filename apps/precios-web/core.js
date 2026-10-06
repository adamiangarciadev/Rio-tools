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
    const table = csv(text), originalHeaders = table.shift() || [];
    const cleanHeader = value => norm(value).replace(/[\uFEFF\u200B]/g,'').replace(/[\u2010-\u2015]/g,'-').replace(/\s*-\s*/g,' - ').replace(/\s+/g,' ').trim();
    const headers = originalHeaders.map(cleanHeader);
    const fields = [
      ['Proveedor',['PROVEEDOR - DESCRIPCION','PROVEEDOR']],
      ['Artículo',['ARTICULO - CODIGO','ARTICULO']],
      ['Clasificación',['CLASIFICACION','CLASIFICACION - DESCRIPCION']],
      ['Talle',['TALLE','TALLE - CODIGO']],
      ['Lista de precios',['LISTA DE PRECIOS - NUMERO','LISTA DE PRECIO - NUMERO']],
      ['Precio',['PRECIO']]
    ];
    const findColumn = names => names.reduce((found,name)=>found>=0?found:headers.indexOf(name),-1);
    const columns = fields.map(([,names])=>findColumn(names));
    const missing = fields.filter((_,i)=>columns[i]<0).map(([name])=>name);
    if (missing.length) throw new Error('CSV '+expected+': faltan columnas '+missing.join(', ')+'. Encabezados recibidos: '+originalHeaders.join(' | '));
    const groupColumn = findColumn(['GRUPO - DESCRIPCION','GRUPO']);
    const entries = new Map();
    table.forEach((row, index) => {
      const values = columns.map(i => String(row[i] == null ? '' : row[i]).trim());
      const [proveedor, articulo, clasificacion, talle, lista, raw] = values;
      if (!articulo || norm(lista) !== expected) throw new Error('Fila ' + (index + 2) + ': artículo o lista inválidos.');
      const id = JSON.stringify([proveedor, articulo, talle]);
      const grupo = groupColumn < 0 ? '' : String(row[groupColumn] || '').trim();
      const item = { id, proveedor, articulo, clasificacion, grupo, talle, precio: price(raw) };
      const previous = entries.get(id);
      if (previous && (previous.precio !== item.precio || previous.clasificacion !== clasificacion || previous.grupo !== grupo)) throw new Error('Duplicado contradictorio: ' + articulo + ' / ' + talle);
      entries.set(id, item);
    });
    if (!entries.size) throw new Error('La lista está vacía.');
    return entries;
  }
  function merge(one, three) {
    return [...new Set([...one.keys(), ...three.keys()])].map(id => {
      const a = one.get(id), b = three.get(id), source = a || b;
      return { id, proveedor: source.proveedor, articulo: source.articulo, clasificacion: source.clasificacion, grupo: source.grupo || (b && b.grupo) || '',
        grupoLista1: a ? a.grupo || '' : '', grupoLista3: b ? b.grupo || '' : '',
        conflictoGrupo: !!(a && b && a.grupo && b.grupo && norm(a.grupo) !== norm(b.grupo)), talle: source.talle,
        lista1: a ? a.precio : null, lista3: b ? b.precio : null,
        diferencia: a && b && a.precio > 0 ? (b.precio - a.precio) / a.precio : null,
        conflicto: !!(a && b && classificationKey(a.clasificacion) !== classificationKey(b.clasificacion)) };
    }).sort((a,b) => a.proveedor.localeCompare(b.proveedor) || a.articulo.localeCompare(b.articulo) || a.talle.localeCompare(b.talle));
  }
  function condition(value) { const n = norm(value); return n.includes('DISC') ? 'Discontinuo' : n.includes('LINEA') ? 'Línea' : n ? 'Otra clasificación' : 'Sin clasificación'; }
  function classificationKey(value) {
    const n=norm(value);
    // zNube permite exportar la descripción sola o precedida por su código.
    if (n==='LINEA' || n==='LINEA LINEA') return 'LINEA';
    if (n==='DISCONTINUO' || n==='DISC DISCONTINUO') return 'DISCONTINUO';
    if (n==='PROMO' || n==='PROMO PROMO') return 'PROMO';
    return n;
  }
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
      const key=JSON.stringify([row.proveedor,row.articulo,row.clasificacion,row.grupo,row.grupoLista1,row.grupoLista3,!!row.conflictoGrupo,row.lista1,row.lista3,!!row.conflicto,!!row.missing]);
      if(!groups.has(key))groups.set(key,{row:{...row,id:'unified:'+key},sizes:new Set()});
      const group=groups.get(key); if(row.talle)group.sizes.add(row.talle);
    });
    return [...groups.values()].map(group=>({...group.row,talle:[...group.sizes].sort((a,b)=>a.localeCompare(b,'es',{numeric:true})).join(' / ')}));
  }
  return { norm, csv, parse, merge, condition, tienda, matchTienda, unify };
})();
if (typeof module !== 'undefined') module.exports = PreciosCore;
