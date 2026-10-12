(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 let lastError='';
 function refresh(){
  $('dockTotal').textContent=document.querySelector('#summary .final dd')?.textContent||'$ 0,00';
  const error=$('status').classList.contains('error');
  $('dockState').textContent=error?'Revisá el mensaje de la planilla':$('saveButton').disabled?'Guardando cierre…':$('status').textContent.includes('Planilla guardada')?'Cierre guardado':'Borrador · guardá para confirmar el cierre';
  $('dockSave').disabled=$('saveButton').disabled;
  if(error&&$('status').textContent!==lastError){
   lastError=$('status').textContent;
   if(document.activeElement?.closest('.close-dock')){
    const field=$('sheet').querySelector(':invalid');
    if(field){field.focus({preventScroll:true});field.scrollIntoView({behavior:'smooth',block:'center'});}
    else $('status').scrollIntoView({behavior:'smooth',block:'center'});
   }
  }
  if(!error)lastError='';
  document.querySelector('.close-steps a').classList.toggle('done',!!$('f9').value&&!!$('responsible').value);
  for(const table of document.querySelectorAll('#movementSections table')){
   const headers=[...table.querySelectorAll('th')].map(th=>th.textContent);
   for(const row of table.querySelectorAll('tbody tr')){
    let column=0;for(const cell of row.cells){if(cell.classList.contains('print-value'))continue;if(!cell.classList.contains('remove'))cell.dataset.label=headers[column]||'';column++;}
   }
  }
 }
 $('dockSave').onclick=()=>$('saveButton').click();
 $('dockPrint').onclick=()=>$('printButton').click();
 const observer=new MutationObserver(refresh);
 observer.observe($('sheet'),{childList:true,subtree:true});
 observer.observe($('status'),{childList:true,attributes:true,attributeFilter:['class']});
 observer.observe($('saveButton'),{attributes:true,attributeFilter:['disabled']});
 $('sheet').addEventListener('input',refresh);
 document.querySelectorAll('.close-steps a').forEach(link=>link.addEventListener('click',()=>{document.querySelector(link.getAttribute('href'))?.scrollIntoView({behavior:'smooth',block:'start'});}));
 refresh();
})();
