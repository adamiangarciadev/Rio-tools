/* Descargas administrativas; comparte el reporte y los filtros de Precios WEB. */
var ListasAdministrativas = (() => {
  'use strict';
  const brands = ['Andressa','Exclusive','Kaury','Trenda','Tiento','Brigitte','Sexy Lali','Natubel','Marcela Koury','Lara','Bakhou','Sigry','Belén','B&K','Gabela','Vella','XY'].sort((a,b)=>a.localeCompare(b,'es'));
  const cacheKey = 'rio_listas_administrativas_reporte_v1';
  const validReport = report => !!report?.ok && Array.isArray(report.rows) && report.rows.length>0;
  function readCache(storage,source) {
    try {const cached=JSON.parse(storage.getItem(cacheKey));return cached?.source===source&&validReport(cached.report)?cached.report:null;}catch{return null;}
  }
  function saveCache(storage,source,report) {
    if(!validReport(report))return false;
    try {storage.setItem(cacheKey,JSON.stringify({source,report}));return true;}catch{return false;}
  }
  const norm = value => PreciosCore.norm(value);
  const compare = (a,b) => a.localeCompare(b,'es',{numeric:true,sensitivity:'base'});
  function prepare(report, list, selected = brands, options = {}) {
    if (![1,3,20].includes(list)) throw new Error('Lista inválida.');
    if (!report.ok || !Array.isArray(report.rows)) throw new Error(report.error || 'Reporte de precios inválido.');
    const allowed = new Map(selected.map(b=>[norm(b),b])), key = 'lista'+list;
    const grouped = new Map(); let missing = 0, conflicts = 0, unknownType = 0;
    (list===20?report.l20Rows||[]:report.rows).forEach(row => {
      const brand = allowed.get(norm(row.proveedor));
      if (!brand || PreciosCore.condition(row.clasificacion)!=='Línea') return;
      // Una discrepancia entre listas no permite asegurar que sea de línea en ambas.
      if (row.conflicto || row.conflictoGrupo) { conflicts++; return; }
      if (row[key] === null || row[key] === undefined || !Number.isFinite(row[key]) || row[key]<0) { missing++; return; }
      const type = norm(row['grupoLista'+list] || row.grupo || row.tipoPrenda || row.rubro || row.categoria || row.familia);
      if (type === 'MEDIAS' && !options.includeMedias) return;
      if (!type) unknownType++;
      const summer = /TRAJE[S]? DE BANO|BOMBACHA[S]? (?:DE )?MALLA|^MALLA BOMBACHA$|^MALLAS?$|^VERANO$/.test(type);
      const underwear = /^(?:BOMBACHAS?|PACKS?(?: DE)? BOMBACHAS?)$/.test(type);
      const section = summer ? 'Verano' : underwear ? 'Bombachas y packs' : 'Línea';
      const groupKey = JSON.stringify([brand,section]);
      if (!grouped.has(groupKey)) grouped.set(groupKey,{brand,section,rows:new Map()});
      const group = grouped.get(groupKey), itemKey = JSON.stringify([row.articulo,row[key]]);
      if (!group.rows.has(itemKey)) group.rows.set(itemKey,{article:String(row.articulo),price:row[key],sizes:new Set()});
      if (row.talle) group.rows.get(itemKey).sizes.add(String(row.talle));
    });
    const sectionOrder = {'Línea':0,'Bombachas y packs':1,'Verano':2};
    const sections = [...grouped.values()].sort((a,b)=>compare(a.brand,b.brand)||sectionOrder[a.section]-sectionOrder[b.section]).map(g=>{
      const rows=[...g.rows.values()].sort((a,b)=>compare(a.article,b.article)||a.price-b.price);
      const counts=new Map();rows.forEach(r=>counts.set(r.article,(counts.get(r.article)||0)+1));
      return {...g, rows:rows.map(r=>({...r,sizes:[...r.sizes].sort(compare).join('/'),showSizes:counts.get(r.article)>1}))};
    });
    return {sections,missing,conflicts,unknownType,count:sections.reduce((n,g)=>n+g.rows.length,0)};
  }
  function pdf(report,list,selected,JsPDF,options = {}) {
    const result=prepare(report,list,selected,options);
    if (!result.count) throw new Error('No hay artículos de línea con precio para estas marcas.');
    if (result.unknownType) throw new Error('El reporte todavía no incluye el tipo de prenda para separar Verano. Falta completar ese dato en la fuente.');
    const doc=new JsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const margin=6, columns=8, width=(297-margin*2)/columns, top=25, bottom=200, line=3.25;
    let column=0,y=top,page=1;
    const dateValue=report.sources?.['lista'+list]?.date || report.updatedAt;
    const date=new Date(dateValue);
    if (!Number.isFinite(date.getTime())) throw new Error('El reporte no tiene una fecha de origen válida.');
    const dateText=date.toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});
    const money=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
    function header(){
      doc.setTextColor(35);doc.setFont('times','normal');doc.setFontSize(34);doc.text('RÍO',margin,17);
      doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('LISTA DE PRECIOS · LÍNEA',43,10);
      doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text('lenceriario.com  |  ventas@lenceriario.com',43,15);
      doc.text(`${list===20?'L20':'LISTA '+list} · FECHA ${dateText}`,291,10,{align:'right'});
      doc.setFontSize(6);doc.text('Marcas en orden alfabético · Artículos de menor a mayor',43,20);
      doc.text(`Página ${page}`,291,205,{align:'right'});
    }
    function next(){column++;y=top;if(column===columns){doc.addPage();column=0;page++;header();}}
    function section(g,continued){
      const x=margin+column*width;
      doc.setFillColor(240);doc.setDrawColor(100);doc.setLineWidth(.15);doc.rect(x,y,width,6,'FD');
      doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(g.brand.toUpperCase(),x+width/2,y+4.1,{align:'center'});y+=6;
      doc.setFillColor(65);doc.rect(x,y,width,4,'F');doc.setTextColor(255);doc.setFontSize(5.5);doc.text(g.section.toUpperCase()+(continued?' (CONT.)':''),x+width/2,y+2.8,{align:'center'});doc.setTextColor(35);y+=4;
    }
    header();
    result.sections.forEach(g=>{
      if(y+10+line>bottom) next();section(g,false);
      g.rows.forEach(r=>{
        const label=r.article+(r.showSizes?' · T '+r.sizes:'');
        doc.setFont('helvetica','normal');doc.setFontSize(5.6);
        const labels=doc.splitTextToSize(label,width*.47-1.5),height=Math.max(line,labels.length*2.3+1);
        if(y+height>bottom){next();section(g,true);}
        const x=margin+column*width;
        doc.setDrawColor(150);doc.rect(x,y,width,height);doc.line(x+width*.48,y,x+width*.48,y+height);
        doc.text(labels,x+.7,y+2.3);doc.text('$ '+money.format(r.price),x+width-.7,y+2.3,{align:'right'});y+=height;
      });
    });
    return {doc,...result};
  }
  function init(){
    const picker=document.getElementById('lpMarcas');if(!picker)return;
    const status=document.getElementById('lpEstado'),buttons=[...document.querySelectorAll('[data-price-list]')];
    function updateBrands(rows = []) {
      const previous=new Map([...picker.querySelectorAll('input')].map(input=>[norm(input.value),input.checked]));
      const defaults=new Set(brands.map(norm));
      const available=new Map(brands.map(brand=>[norm(brand),brand]));
      rows.forEach(row=>{const brand=String(row.proveedor||'').trim();if(brand&&!available.has(norm(brand)))available.set(norm(brand),brand);});
      picker.replaceChildren();
      [...available.values()].sort(compare).forEach(brand=>{
        const label=document.createElement('label'),input=document.createElement('input');
        input.type='checkbox';input.value=brand;input.checked=previous.has(norm(brand))?previous.get(norm(brand)):defaults.has(norm(brand));
        label.append(input,document.createTextNode(brand));picker.append(label);
      });
    }
    updateBrands();
    let report=null,notice='',loading=false;
    try {report=readCache(window.localStorage,window.PRECIOS_API_URL);}catch{}
    if(report){updateBrands([...report.rows,...report.l20Rows||[]]);notice='Mostrando la última copia guardada en este navegador.';render();}
    async function load(){
      if(loading)return;
      loading=true;document.getElementById('lpActualizar').disabled=true;
      if(report){notice='Mostrando la copia guardada mientras se consultan los precios actualizados.';render();}
      else {buttons.forEach(b=>b.disabled=true);status.textContent='Consultando las listas de Precios WEB…';}
      try{
        const response=await fetch(window.PRECIOS_API_URL+'?accion=reporte&_='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(45000)});
        if(!response.ok)throw new Error(`Precios WEB respondió HTTP ${response.status}. Revisá que la implementación de Apps Script esté publicada y accesible.`);
        const nextReport=await response.json();if(!validReport(nextReport))throw new Error(nextReport.error||'No hay precios disponibles.');
        report=nextReport;
        let saved=false;try {saved=saveCache(window.localStorage,window.PRECIOS_API_URL,report);}catch{}
        notice=saved?'Copia actualizada y guardada en este navegador.':'Precios actualizados. No se pudo guardar la copia en este navegador.';
        updateBrands([...report.rows,...report.l20Rows||[]]);
        render();
      }catch(e){
        if(report){notice='No se pudo actualizar: '+e.message+' Se conserva la última copia disponible.';render();}
        else status.textContent='No se pudieron cargar las listas: '+e.message;
      }finally{loading=false;document.getElementById('lpActualizar').disabled=false;}
    }
    function render(){
      if(!report)return;
      const selected=[...picker.querySelectorAll('input:checked')].map(i=>i.value);
      const stats=[1,3,20].map(n=>prepare(report,n,selected,{includeMedias:document.getElementById('lpMedias').checked}));
      buttons.forEach((b,i)=>b.disabled=!stats[i].count||!!stats[i].unknownType);
      status.textContent=stats.some(s=>s.unknownType)?'El reporte de Precios WEB aún no trae el tipo de prenda. La descarga se habilitará al incorporar ese dato para separar Verano correctamente.':`Lista 1: ${stats[0].count} filas · Lista 3: ${stats[1].count} filas · L20: ${stats[2].count} filas. `;
      if(!report.l20Rows?.length)status.textContent+=' L20 pendiente: '+(report.l20Error||'actualizá el script de Precios WEB para incorporar esta lista.')+' ';
      if(stats.some(s=>s.missing||s.conflicts))status.textContent+=' Se excluyen los artículos sin precio o con clasificación contradictoria.';
      if(report.syncError)status.textContent+=' Aviso de la fuente: '+report.syncError;
      [1,3,20].forEach(n=>{const date=report.sources?.['lista'+n]?.date;if(date)status.textContent+=` ${n===20?'L20':'Lista '+n}: `+new Date(date).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+'.';});
      if(notice)status.textContent+=' '+notice;
    }
    picker.addEventListener('change',render);
    document.getElementById('lpMedias').addEventListener('change',render);
    buttons.forEach(button=>button.addEventListener('click',()=>{
      try{const list=Number(button.dataset.priceList),selected=[...picker.querySelectorAll('input:checked')].map(i=>i.value);const output=pdf(report,list,selected,window.jspdf.jsPDF,{includeMedias:document.getElementById('lpMedias').checked});output.doc.save(list===20?'rio-l20-linea.pdf':`rio-lista-${list}-linea.pdf`);}
      catch(e){status.textContent=e.message;}
    }));
    document.getElementById('lpActualizar').addEventListener('click',load);load();
  }
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',init);
  return {brands,prepare,pdf,readCache,saveCache};
})();
if(typeof module!=='undefined')module.exports=ListasAdministrativas;
