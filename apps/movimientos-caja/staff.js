(function(root){
 'use strict';
 const URL='https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec';
 const KEY='asistencia_padron_cache_v1';
 function normalize(rows){return rows.map(r=>({id:String(r.id??r.vendedor_id??'').trim(),nombre:String(r.nombre??r.vendedor_nombre??r.apellido_nombre??'').trim(),activo:r.activo})).filter(r=>r.id&&r.nombre&&r.activo!==false).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es-AR'));}
 function cache(){try{const c=JSON.parse(localStorage.getItem(KEY));return c&&Array.isArray(c.rows)&&Date.now()-Number(c.ts)<86400000?normalize(c.rows):[];}catch{return [];}}
 async function load(){const r=await fetch(URL+'?accion=padron_all',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('No se pudo consultar el padrón de Asistencia.');const d=await r.json();const rows=d.data?.rows||d.data?.padron||d.data?.vendedores;if(!d.ok||!Array.isArray(rows)||!rows.length)throw new Error('El padrón de Asistencia no está disponible.');try{localStorage.setItem(KEY,JSON.stringify({ts:Date.now(),version:d.data?.version||'',rows}));}catch{}return normalize(rows);}
 root.CajaStaff={cache,load};
})(window);
