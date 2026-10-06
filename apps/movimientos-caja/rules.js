(function(root){
 'use strict';
 const concepts=['VIATICO','PASEO COMERCIAL','PAGO A','ARTICULOS DE LIMPIEZA','LIBRERIA','HONORARIOS','GASTOS DE GERENCIA','FLETE','FIORINO','FERRETERIA','FARMACIA','DESAYUNO','COMIDA SABADO','BIDONES DE AGUA','ALMUERZO','ALMACEN','ALMUERZO JOHA','ALMUERZO VERO','ALMUERZO FRANCO'];
 const personConcepts=new Set(['VIATICO','PAGO A','DESAYUNO','ALMUERZO']);
 const upper=value=>String(value??'').toLocaleUpperCase('es-AR');
 function normalize(data){
  const d=JSON.parse(JSON.stringify(data));
  for(const key of ['responsible','notes'])if(d[key]!==undefined)d[key]=upper(d[key]);
  for(const section of ['expenses','vouchers','withdrawals','deposits','shipping'])for(const r of d[section]||[]){
   for(const key of ['name','signature','concept','person','otherAccount'])if(r[key]!==undefined)r[key]=upper(r[key]);
   if(r.account&&r.account!=='other')r.account=upper(r.account);
   if(section==='expenses'&&concepts.includes(r.concept))r.name=r.concept+(personConcepts.has(r.concept)&&r.person?' - '+r.person.trim():'');
  }
  return d;
 }
 function validateExpenses(rows){
  for(const r of rows||[]){
   if(!concepts.includes(r.concept))throw new Error('ELEGÍ UN CONCEPTO PREDETERMINADO PARA CADA GASTO.');
   if(personConcepts.has(r.concept)&&!String(r.person||'').trim())throw new Error('INDICÁ A QUIÉN CORRESPONDE EL GASTO '+r.concept+'.');
   if(String(r.person||'').length>120)throw new Error('EL NOMBRE DEL DESTINATARIO NO PUEDE SUPERAR 120 CARACTERES.');
  }
 }
 root.CajaRules={concepts,personConcepts,upper,normalize,validateExpenses};
 if(typeof module!=='undefined')module.exports=root.CajaRules;
})(typeof window!=='undefined'?window:globalThis);
