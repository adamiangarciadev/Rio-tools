(function(root){
 'use strict';
 const display=value=>value===''||value===null||value===undefined?'':new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(Number(value));
 function edit(value){
  const raw=String(value).replace(/\./g,'');
  if(!/^\d*(,\d{0,2})?$/.test(raw))throw new Error('Usá números y coma para los centavos (ejemplo: 1.234,50).');
  const [integer,decimal]=raw.split(',');
  if(!integer&&decimal===undefined)return '';
  return (integer||'0').replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(decimal!==undefined?','+decimal:'');
 }
 function read(value){
  const formatted=edit(value);
  if(formatted==='')return '';
  const n=Number(formatted.replace(/\./g,'').replace(',','.'));
  if(!Number.isFinite(n)||n<0||n>999999999)throw new Error('Ingresá un monto entre 0 y 999.999.999.');
  return n;
 }
 function update(input){
  const before=input.value,position=input.selectionStart??before.length;
  const count=before.slice(0,position).replace(/\./g,'').length;
  const value=read(before);input.value=edit(before);
  let caret=0,seen=0;while(caret<input.value.length&&seen<count){if(input.value[caret]!=='.')seen++;caret++;}
  input.setSelectionRange(caret,caret);return value;
 }
 root.CajaMoney={display,edit,read,update};
 if(typeof module!=='undefined')module.exports=root.CajaMoney;
})(typeof window!=='undefined'?window:globalThis);
