(function(root){
'use strict';
const text=v=>String(v??'').trim();
// La fuente entrega estos campos como «código descripción».
// Si no hay descripción separada, conservar el valor completo.
const description=v=>{const value=text(v),match=value.match(/^\S+\s+(.+)$/);return match?match[1].trim():value};
const canonical=v=>text(v).replace(/^\d+\s+/, '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const compare=(a,b)=>text(a).localeCompare(text(b),'es',{numeric:true,sensitivity:'base'});
const defaults={GrupoBK:['sigry','lara','b&k','bakhou','gabela','belen'],Anderessa:['andressa','exclusive']};
function normalize(data){
 if(!Array.isArray(data.records)||!/^\d{4}-\d{2}-\d{2}$/.test(data.reportDate||''))throw Error('El reporte no tiene el formato esperado.');
 const rows=new Map(),branches=new Set();
 for(const r of data.records){
  if(!r.branches||typeof r.branches!=='object'||Array.isArray(r.branches))throw Error('Faltan los stocks por sucursal.');
  let stock=0;
  for(const [name,values] of Object.entries(r.branches)){
   branches.add(name);
   const value=values?.[0];
   if(!Array.isArray(values)||value==null||text(value)===''||!Number.isFinite(Number(value)))throw Error('Hay un stock inválido en el reporte.');
   stock+=Number(value);
  }
  const row={supplier:description(r.supplier)||'Sin proveedor',article:text(r.code),color:description(r.color),size:description(r.size),stock};
  const key=JSON.stringify([row.supplier,row.article,row.color,row.size]);
  if(rows.has(key))rows.get(key).stock+=stock;else rows.set(key,row);
 }
 return {rows:[...rows.values()].sort(sortRows),branches:[...branches].sort(compare),reportDate:data.reportDate};
}
function sortRows(a,b){return compare(a.supplier,b.supplier)||compare(a.article,b.article)||compare(a.color,b.color)||compare(a.size,b.size)}
function fromTables(tables,filename){
 const rows=new Map();let count=0,hasSales=null;
 const aliases=[['NOMBRE','PROVEEDOR','NOMBREPROVEEDOR'],['ARTICULO','ART','CODIGO'],['COLORDESCRIPCION','COLOR','DESCRIPCIONCOLORESORIGINAL'],['TALLE'],['CANTIDAD','STOCKRIO','STOCK','STOCKACTUAL']];
 for(const table of tables){
  if(!table.rows.some(r=>r.some(v=>text(v))))continue;
  const header=table.rows.findIndex(r=>aliases.every(names=>r.some(v=>names.includes(canonical(v)))));
  if(header<0)throw Error(`La hoja ${table.name} no tiene las columnas Nombre, Artículo, Color descripción, Talle y Cantidad.`);
  const indexes=aliases.map(names=>table.rows[header].findIndex(v=>names.includes(canonical(v))));
  const salesIndex=table.rows[header].findIndex(v=>['CANTVEND','CANTIDADVENDIDA','VENTASRIO','VENTAS'].includes(canonical(v)));
  if(hasSales!==null&&hasSales!==(salesIndex>=0))throw Error('Todas las hojas deben incluir las mismas columnas de stock y ventas.');
  hasSales=salesIndex>=0;
  for(let i=header+1;i<table.rows.length;i++){
   const source=table.rows[i];if(!source.some(v=>text(v)))continue;
   const [supplier,article,color,size,quantity]=indexes.map(index=>source[index]);
   if(!text(article)||!text(supplier))throw Error(`Falta proveedor o artículo en ${table.name}, fila ${i+1}.`);
   let value=text(quantity).replace(/\s/g,'');
   if(value.includes(','))value=value.includes('.')?value.replace(/\./g,'').replace(',','.'):value.replace(',','.');
   if(!value||!Number.isFinite(Number(value)))throw Error(`Cantidad inválida en ${table.name}, fila ${i+1}.`);
   const row={supplier:text(supplier),article:text(article),color:text(color),size:text(size),stock:Number(value)};
   if(hasSales){let sale=text(source[salesIndex]).replace(/\s/g,'');if(sale.includes(','))sale=sale.replace(/\./g,'').replace(',','.');if(!sale||!Number.isFinite(Number(sale)))throw Error(`Venta inválida en ${table.name}, fila ${i+1}.`);row.sales=Number(sale)}
   const key=JSON.stringify([row.supplier,row.article,row.color,row.size]);
   if(rows.has(key)){rows.get(key).stock+=row.stock;if(hasSales)rows.get(key).sales+=row.sales}else rows.set(key,row);count++;
  }
 }
 if(!count)throw Error('El archivo no contiene filas de stock.');
 const date=text(filename).match(/_(\d{4})(\d{2})(\d{2})_/);
 return {rows:[...rows.values()].sort(sortRows),branches:[],reportDate:date?`${date[1]}-${date[2]}-${date[3]}`:'archivo',sourceFile:filename,sourceRows:count,hasSales:!!hasSales};
}
function resolveGroup(members,suppliers){const keys=new Set(members.map(canonical));return {found:suppliers.filter(s=>keys.has(canonical(s))),missing:members.filter(m=>!suppliers.some(s=>canonical(s)===canonical(m)))}}
function sheets(rows,options={}){
 const groups=new Map(),used=new Set();
 for(const row of rows){if(!groups.has(row.supplier))groups.set(row.supplier,[]);groups.get(row.supplier).push(row)}
 return [...groups].map(([supplier,items])=>{
  const base=supplier.replace(/[\\/?*\[\]:\x00-\x1f]/g,' ').replace(/^'+|'+$/g,'').trim().slice(0,31)||'Proveedor';
  let name=base,n=2;while(used.has(name.toLowerCase())){const suffix=` (${n++})`;name=base.slice(0,31-suffix.length)+suffix}used.add(name.toLowerCase());
  return {name,rows:[['Proveedor','Artículo','Color','Talle','Stock Río',...(options.sales?[`Ventas Río (${options.period})`]:[])],...items.sort(sortRows).map(r=>[r.supplier,r.article,r.color,r.size,r.stock,...(options.sales?[r.sales]:[])])]};
 });
}
const api={normalize,fromTables,sortRows,resolveGroup,sheets,defaults,canonical};
if(typeof module!=='undefined')module.exports=api;else root.StockProviders=api;
})(typeof window!=='undefined'?window:globalThis);
