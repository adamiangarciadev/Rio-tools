;(() => {
 'use strict';
 const API='https://hczekjyagyoxdqkzdimd.supabase.co/functions/v1/mt2-web-api';
 const $=id=>document.getElementById(id);
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={branch:'',items:[],offset:0,sequence:0,busy:false,loading:false};
 async function api(op,data={}){
  const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,op}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'No se pudo completar la operación');return result;
 }
 const status=text=>{$('statusMsg').textContent=text;};
 function empty(text){$('tableBody').innerHTML='<tr><td colspan="8">'+escape(text)+'</td></tr>';}
 function render(){
  if(!state.items.length){empty('No hay remitos pendientes de clientes para estos filtros.');return;}
  $('tableBody').innerHTML=state.items.map((r,i)=>'<tr>'+
   ['fecha','remito','desde','cliente','vendedor','total_prendas'].map(k=>'<td>'+escape(r[k])+'</td>').join('')+
   '<td><span class="badge pending">PENDIENTE</span></td><td class="actions-cell"><div class="row-actions">'+
   ['FACTURA','CANCELADO'].map(s=>'<button class="btn small '+(s==='FACTURA'?'warn':'danger')+'" data-index="'+i+'" data-state="'+s+'">Afectar a '+s+'</button>').join('')+'</div></td></tr>').join('');
 }
 async function load(){
  if(!state.branch||state.busy)return;
  const seq=++state.sequence,branch=state.branch;state.loading=true;$('btnReload').disabled=true;
  status('Consultando remitos de '+branch+'…');
  try{
   const data=await api('client_list',{sucursal:branch,offset:state.offset,search:$('searchInput').value.trim()});
   if(seq!==state.sequence)return;
   if(state.offset>=data.total&&state.offset>0){state.offset=Math.max(0,Math.floor((data.total-1)/50)*50);return await load();}
   state.items=data.items;render();$('totalVisible').textContent=String(data.total);
   $('crcPage').textContent='Página '+(state.offset/50+1)+' · '+data.total+' pendientes';
   $('crcPrev').disabled=!state.offset;$('crcNext').disabled=!data.has_more;
   $('lastUpdate').textContent=new Date().toLocaleTimeString('es-AR');status('Remitos desde el 22/09/2026 · Sin límite de antigüedad · '+branch);
  }catch(e){if(seq===state.sequence)status('No se pudo actualizar. '+e.message);}
  finally{if(seq===state.sequence){state.loading=false;$('btnReload').disabled=false;}}
 }
 async function init(){
  $('btnClearSucursal').hidden=true;$('btnReload').onclick=load;
  let timer;$('searchInput').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{state.offset=0;load();},300);};
  $('crcPrev').onclick=()=>{state.offset=Math.max(0,state.offset-50);load();};
  $('crcNext').onclick=()=>{state.offset+=50;load();};
  $('tableBody').onclick=async e=>{
   const button=e.target.closest('button[data-index]');if(!button||state.busy||state.loading)return;
   const r=state.items[Number(button.dataset.index)],target=button.dataset.state;
   if(!r||!confirm('¿Querés marcar el remito '+r.remito+' como '+target+'?'))return;
   state.busy=true;++state.sequence;$('tableBody').querySelectorAll('button').forEach(b=>b.disabled=true);
   try{await api('client_action',{sucursal:r.desde,remito:r.remito,version:r.version,estado:target});}
   catch(e){alert(e.message);}
   finally{state.busy=false;await load();$('tableBody').querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  try{
   const data=await api('client_branches');
   const select=$('sucursalSelect');select.innerHTML='<option value="">Seleccionar sucursal</option>';
   data.sucursales.forEach(b=>select.add(new Option(b,b)));
   const context=window.RioContext?.branch,wanted=context==='AV2'?'AVELLANEDA 2':context;
   state.branch=data.sucursales.includes(wanted)?wanted:'';
   select.value=state.branch;select.disabled=true;select.closest('.field').hidden=true;
   $('currentSucursal').textContent=state.branch||'Sin seleccionar';
   if(!state.branch){empty('Elegí la sucursal desde el inicio.');status('No hay sucursal seleccionada.');return;}
   await load();setInterval(()=>{if(!document.hidden&&!state.busy&&!state.loading)load();},30000);
  }catch(e){empty('No se pudo conectar.');status(e.message);}
 }
 document.addEventListener('DOMContentLoaded',init);
})();
