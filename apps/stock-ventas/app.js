const state={data:null,filtered:[],page:1,pageSize:100};
const $=id=>document.getElementById(id); const fmt=new Intl.NumberFormat('es-AR');
const fields=['branch','supplier','unit','classification','line','group','color','size'];

async function init(){
  try{const source=window.STOCK_VENTAS_API_URL||'sample-data.json';const r=await fetch(source);if(!r.ok)throw Error();state.data=await r.json();hydrate();}
  catch{$('rows').innerHTML='<tr><td colspan="7" class="empty">No se pudo abrir la muestra. Usá “Importar CSV” o ejecutá la app desde el servidor local.</td></tr>';}
}
function hydrate(){
  const d=state.data;$('reportDate').textContent=formatDate(d.reportDate);$('sourceName').textContent=d.sourceFile;
  $('reportMeta').textContent=`${fmt.format(d.records.length)} variantes · ${d.branches.length} locales · recibido ${formatDate(d.receivedAt)}`;
  fields.forEach(k=>fillSelect(k,k==='branch'?d.branches:[...new Set(d.records.map(x=>x[k]).filter(Boolean))].sort(localeSort)));
  state.page=1;applyFilters();
}
function fillSelect(id,values){const el=$(id),label=el.options[0]?.textContent||'Todos';el.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}
function branchValues(r){const b=$('branch').value;if(!b)return [r.stock,r.sales];const x=r.branches[b]||[0,0];return x}
function applyFilters(){
  if(!state.data)return;const q=$('search').value.trim().toLocaleLowerCase('es');const cq=$('code').value.trim().toLocaleLowerCase('es');
  state.filtered=state.data.records.filter(r=>{const [stock,sales]=branchValues(r);return(!q||`${r.code} ${r.article}`.toLocaleLowerCase('es').includes(q))&&(!cq||r.code.toLocaleLowerCase('es').includes(cq))&&fields.filter(x=>x!=='branch').every(k=>!$(k).value||r[k]===$(k).value)&&(!$('onlyStock').checked||stock>0)&&(!$('onlySales').checked||sales!==0)});
  const sort=$('sort').value;state.filtered.sort((a,b)=>sort==='code'?localeSort(a.code,b.code):branchValues(b)[sort==='stock'?0:1]-branchValues(a)[sort==='stock'?0:1]);
  const sums=state.filtered.reduce((a,r)=>{const [s,v]=branchValues(r);a.s+=s;a.v+=v;if(s<=0)a.z++;a.c.add(r.code);return a},{s:0,v:0,z:0,c:new Set});
  $('stockKpi').textContent=fmt.format(sums.s);$('salesKpi').textContent=fmt.format(sums.v);$('articlesKpi').textContent=fmt.format(sums.c.size);$('noStockKpi').textContent=fmt.format(sums.z);$('resultCount').textContent=`${fmt.format(state.filtered.length)} resultados`;
  $('stockHint').textContent=$('branch').value||'todos los locales';state.page=Math.min(state.page,Math.max(1,Math.ceil(state.filtered.length/state.pageSize)));renderRows();
}
function renderRows(){const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize)),start=(state.page-1)*state.pageSize,rows=state.filtered.slice(start,start+state.pageSize);$('rows').innerHTML=rows.length?rows.map(r=>{const [s,v]=branchValues(r);return`<tr><td class="product"><strong>${esc(r.code)}</strong><span>${esc(r.article)}</span></td><td>${esc(r.supplier||'—')}</td><td>${esc(r.group||'—')}</td><td>${esc(r.color||'—')}</td><td>${esc(r.size||'—')}</td><td class="num ${s<0?'negative':''}">${fmt.format(s)}</td><td class="num sales">${fmt.format(v)}</td></tr>`}).join(''):'<tr><td colspan="7" class="empty">No hay resultados para estos filtros.</td></tr>';$('pageInfo').textContent=`Página ${state.page} de ${pages}`;$('prevBtn').disabled=state.page<=1;$('nextBtn').disabled=state.page>=pages}
function parseCsv(text,fileName){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(parseLine);if(lines.length<5||lines[3][8]!=='Artículo - Código')throw Error('El CSV no tiene el formato esperado de zNube.');
  const branches=[];for(let i=13;i<=29;i+=2)if(lines[2][i])branches.push([lines[2][i],i]);const carry=Array(13).fill('');const records=[];
  for(const row of lines.slice(4)){for(let i=0;i<=12;i++){if(row[i]){carry[i]=row[i];for(let j=i+1;j<=12;j++)carry[j]=''}}if(!carry[8]||!carry[12])continue;const bv={};for(const [name,i] of branches)bv[name]=[num(row[i]),num(row[i+1])];records.push({supplier:carry[0],unit:carry[3],classification:carry[6],line:carry[7],code:carry[8],group:carry[9],article:carry[10],color:carry[11],size:carry[12],stock:num(row[31]),sales:num(row[32]),branches:bv})}
  const m=fileName.match(/(\d{4})(\d{2})(\d{2})/);return{schemaVersion:1,reportDate:m?`${m[1]}-${m[2]}-${m[3]}`:new Date().toISOString().slice(0,10),receivedAt:new Date().toISOString(),sourceFile:fileName,branches:branches.map(x=>x[0]),records};
}
function parseLine(line){const out=[];let x='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){x+='"';i++}else q=!q}else if(c===','&&!q){out.push(x);x=''}else x+=c}out.push(x);return out}
function exportCsv(){if(!state.data)return;const head=['Fecha','Local','Proveedor','Unidad','Clasificación','Línea','Código','Grupo','Artículo','Color','Talle','Stock','Venta'];const b=$('branch').value||'Total';const body=state.filtered.map(r=>{const [s,v]=branchValues(r);return[state.data.reportDate,b,r.supplier,r.unit,r.classification,r.line,r.code,r.group,r.article,r.color,r.size,s,v]});download([head,...body].map(x=>x.map(csvCell).join(',')).join('\r\n'),'stock-ventas-filtrado.csv','text/csv;charset=utf-8');toast(`Exportadas ${fmt.format(body.length)} filas`)}
function download(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF',content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function num(v){const n=Number(String(v||'0').replace(',','.'));return Number.isFinite(n)?n:0}function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function localeSort(a,b){return String(a).localeCompare(String(b),'es',{numeric:true})}function formatDate(v){if(!v)return'—';return new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v.length===10?v+'T12:00:00':v))}function toast(t){$('toast').textContent=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2400)}
fields.concat(['search','code','onlyStock','onlySales','sort']).forEach(id=>$(id).addEventListener(id==='search'||id==='code'?'input':'change',()=>{state.page=1;applyFilters()}));
$('clearBtn').onclick=()=>{fields.concat(['search','code']).forEach(id=>$(id).value='');$('onlyStock').checked=$('onlySales').checked=false;state.page=1;applyFilters()};$('prevBtn').onclick=()=>{state.page--;renderRows()};$('nextBtn').onclick=()=>{state.page++;renderRows()};$('exportBtn').onclick=exportCsv;$('importBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;state.data=parseCsv(await f.text(),f.name);hydrate();toast('CSV importado correctamente')}catch(err){toast(err.message)}};init();
