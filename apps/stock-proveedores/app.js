(()=>{
'use strict';
if(!window.RioContext?.canUse({slug:'stock-proveedores',restricted:true}))return;
const core=window.StockProviders,$=id=>document.getElementById(id),selected=new Set(),fmt=new Intl.NumberFormat('es-AR'),storage='rio_stock_provider_groups_v1';
let data=null,groups={...core.defaults},filtered=[],generation=0;
try{const saved=JSON.parse(localStorage.getItem(storage)||'{}');for(const [name,members]of Object.entries(saved))if(Array.isArray(members)&&members.every(m=>typeof m==='string'))groups[name]=members}catch{}
const suppliers=()=>data?[...new Set(data.rows.map(r=>r.supplier))].sort((a,b)=>a.localeCompare(b,'es')):[];
function groupOptions(){ $('group').replaceChildren(new Option('Elegí un conjunto',''));for(const name of Object.keys(groups))$('group').add(new Option(name,name)) }
function providerList(){const query=core.canonical($('search').value);$('providers').replaceChildren();for(const supplier of suppliers().filter(s=>core.canonical(s).includes(query))){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=selected.has(supplier);box.onchange=()=>{box.checked?selected.add(supplier):selected.delete(supplier);$('group').value='';$('groupStatus').textContent='';render()};label.append(box,document.createTextNode(supplier));$('providers').append(label)}}
function render(){filtered=data?data.rows.filter(r=>selected.has(r.supplier)&&(!$('positive').checked||r.stock>0)):[];$('summary').textContent=`${selected.size} proveedores seleccionados · ${fmt.format(filtered.length)} variantes · ${fmt.format(filtered.reduce((sum,r)=>sum+r.stock,0))} unidades`;$('export').disabled=!filtered.length||!window.XLSX;$('rows').replaceChildren();for(const row of filtered.slice(0,200)){const tr=document.createElement('tr');for(const value of [row.supplier,row.article,row.color,row.size,fmt.format(row.stock)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('rows').append(tr)}$('limit').textContent=filtered.length>200?`Mostrando 200 de ${fmt.format(filtered.length)} variantes. La descarga incluye todas.`:''}
async function load(){data=null;filtered=[];render();$('reload').disabled=true;$('status').textContent='Leyendo el reporte diario…';$('branches').textContent='';providerList();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);try{const url=new URL(window.STOCK_VENTAS_API_URL);url.searchParams.set('v',Date.now());const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('La fuente no pudo entregar el reporte.');data=core.normalize(await response.json());for(const s of selected)if(!suppliers().includes(s))selected.delete(s);$('status').textContent=`Reporte: ${data.reportDate} · ${fmt.format(data.rows.length)} variantes · ${data.branches.length} sucursales${window.XLSX?'':' · No se pudo cargar el generador de Excel. Recargá la página.'}`;$('branches').textContent=data.branches.join(' · ');$('groupStatus').textContent='';providerList();render()}catch(error){data=null;render();$('status').textContent=error.name==='AbortError'?'La consulta tardó demasiado. Volvé a actualizar.':error.message}finally{clearTimeout(timer);$('reload').disabled=false}}
$('group').onchange=()=>{selected.clear();const result=core.resolveGroup(groups[$('group').value]||[],suppliers());result.found.forEach(s=>selected.add(s));$('groupStatus').textContent=result.missing.length?`No encontrados en el reporte: ${result.missing.join(', ')}. Revisá los nombres antes de exportar.`:'';providerList();render()};
$('all').onclick=()=>{suppliers().forEach(s=>selected.add(s));$('group').value='';$('groupStatus').textContent='';providerList();render()};$('none').onclick=()=>{selected.clear();$('group').value='';$('groupStatus').textContent='';providerList();render()};$('search').oninput=providerList;$('positive').onchange=render;$('reload').onclick=load;
$('save').onclick=()=>{const name=$('groupName').value.trim();if(!name||!selected.size){$('groupStatus').textContent='Ingresá un nombre y seleccioná al menos un proveedor.';return}if(Object.hasOwn(groups,name)){$('groupStatus').textContent='Ese conjunto ya existe. Usá otro nombre.';return}const next={...groups,[name]:[...selected]};try{localStorage.setItem(storage,JSON.stringify(next));groups=next;groupOptions();$('group').value=name;$('groupName').value='';$('groupStatus').textContent='Conjunto guardado.'}catch{$('groupStatus').textContent='No se pudo guardar el conjunto en este navegador.'}};
function periodRange(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>Number(parts.find(p=>p.type===t).value);
 const today=new Date(Date.UTC(get('year'),get('month')-1,get('day'))),end=new Date(today),start=new Date(today);
 if($('salesPeriod').value==='previous'){start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-1);end.setUTCDate(0)}
 else if($('salesPeriod').value==='rolling')start.setUTCDate(start.getUTCDate()-29);else start.setUTCDate(1);
 return `${start.toISOString().slice(0,10)} a ${end.toISOString().slice(0,10)}`;
}
function exportOptions(){const sales=$('exportContent').value==='sales';$('salesOptions').hidden=!sales;$('periodDates').textContent=periodRange();$('confirmPeriod').checked=false;$('exportMessage').textContent=''}
$('export').onclick=()=>{if(!data||!filtered.length)return;$('exportContent').value='stock';$('exportContent').options[1].disabled=!data.hasSales;exportOptions();$('exportMessage').textContent=data.hasSales?'':'Esta fuente no incluye ventas con un período confirmado. Subí un comparativo de stock y ventas para incluirlas.';$('exportDialog').showModal()};
$('exportContent').onchange=exportOptions;$('salesPeriod').onchange=exportOptions;
$('confirmExport').onclick=()=>{if(!data||!filtered.length||!window.XLSX)return;const sales=$('exportContent').value==='sales',period=periodRange();if(sales&&(!data.hasSales||!$('confirmPeriod').checked)){$('exportMessage').textContent='Confirmá que el período del archivo coincide con las fechas indicadas.';return}try{const workbook=XLSX.utils.book_new();for(const sheet of core.sheets(filtered,{sales,period})){const ws=XLSX.utils.aoa_to_sheet(sheet.rows);ws['!cols']=[{wch:26},{wch:22},{wch:24},{wch:12},{wch:16},...(sales?[{wch:44}]:[])];ws['!autofilter']={ref:ws['!ref']};XLSX.utils.book_append_sheet(workbook,ws,sheet.name)}const group=$('group').value.replace(/[^a-z0-9_-]/gi,'_')||'seleccion';XLSX.writeFile(workbook,`stock-rio-${group}-${data.reportDate}${sales?'-ventas-'+period.replace(/ /g,'_'):''}.xlsx`);$('exportDialog').close()}catch{$('exportMessage').textContent='No se pudo generar el Excel. Volvé a intentar.'}};
const apiLoad=load;
$('reload').onclick=async()=>{if($('stockFile').disabled)return;generation++;$('stockFile').disabled=true;try{await apiLoad()}finally{$('stockFile').disabled=false}};
$('stockFile').onchange=async()=>{
 const file=$('stockFile').files[0];if(!file)return;
 const ticket=++generation;data=null;selected.clear();$('group').value='';$('groupStatus').textContent='';$('branches').textContent='';providerList();render();$('reload').disabled=true;$('stockFile').disabled=true;$('status').textContent=`Leyendo ${file.name}…`;
 try{
  if(!window.XLSX)throw Error('No se pudo cargar el lector de Excel. Recargá la página.');
  const buffer=await file.arrayBuffer();if(ticket!==generation)return;
  const book=XLSX.read(buffer,{type:'array'});
  const tables=book.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:false})}));
  data=core.fromTables(tables,file.name);
  $('status').textContent=`Archivo: ${file.name} · ${fmt.format(data.sourceRows)} filas · ${fmt.format(data.rows.length)} variantes${data.reportDate==='archivo'?'':` · Fecha del nombre de archivo: ${data.reportDate}`}`;
  $('branches').textContent='Stock tomado de la columna Cantidad del archivo. El archivo no detalla sucursales.';
  providerList();render();
 }catch(error){data=null;render();$('status').textContent=`No se pudo cargar el archivo: ${error.message}`}
 finally{$('reload').disabled=false;$('stockFile').disabled=false;$('stockFile').value=''}
};
groupOptions();render();
})();
