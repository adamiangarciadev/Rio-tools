(function(root){
  'use strict';
  function cents(value){
    const n=Number(value||0);
    if(!Number.isFinite(n)||n<0||n>999999999)throw new Error('Ingresá un monto válido, entre 0 y 999.999.999.');
    return Math.round(n*100);
  }
  function calculate(d){
    const sum=(rows,key='amount')=>(rows||[]).reduce((s,r)=>s+cents(r[key]),0);
    const expenses=sum(d.expenses), vouchersCash=(d.vouchers||[]).filter(r=>r.kind==='cash').reduce((s,r)=>s+cents(r.amount),0);
    const vouchersGoods=(d.vouchers||[]).filter(r=>r.kind==='goods').reduce((s,r)=>s+cents(r.amount),0);
    const withdrawals=sum(d.withdrawals), depositsCash=(d.deposits||[]).filter(r=>r.kind==='cash').reduce((s,r)=>s+cents(r.amount),0);
    const deposits=sum(d.deposits), shippingCash=sum(d.shipping,'cash'), shippingDigital=sum(d.shipping,'digital');
    const hasF9=d.f9!==undefined&&d.f9!==null&&d.f9!=='';
    const saleTotal=hasF9?cents(d.f9):cents(d.cashSales)+cents(d.mp)+cents(d.cards)+cents(d.go)+vouchersGoods;
    const cashSales=hasF9?saleTotal-cents(d.mp)-cents(d.cards)-cents(d.go)-vouchersGoods:cents(d.cashSales);
    const expected=cashSales-expenses-vouchersCash-withdrawals-depositsCash;
    const difference=cents(d.counted)-expected, surplus=Math.max(difference,0), shortage=Math.max(-difference,0);
    // Reconstruct cash sales from counted cash and cash movements.
    const cash=cents(d.counted)+expenses+vouchersCash+withdrawals+depositsCash;
    const final=cash+cents(d.mp)+cents(d.cards)+cents(d.go)+vouchersGoods-surplus+shortage-shippingCash-shippingDigital;
    return Object.fromEntries(Object.entries({expenses,vouchersCash,vouchersGoods,vouchers:vouchersCash+vouchersGoods,withdrawals,deposits,shippingCash,shippingDigital,shipping:shippingCash+shippingDigital,saleTotal,cashSales,expected,difference,surplus,shortage,cash,final}).map(([k,v])=>[k,v/100]));
  }
  function shared(d,branch){
    const own=calculate(d);
    if(branch==='WEB')return {...own,difference:0,surplus:0,shortage:0,cash:own.cashSales,final:own.saleTotal-own.shipping};
    if(branch!=='AV2'||!d.sharedDrawer)return own;
    const web=d.webClose?.data?shared(d.webClose.data,'WEB'):null;
    if(!web)return own;
    const localSale=d.f9Mode==='combined'?own.saleTotal-web.saleTotal:own.saleTotal;
    if(localSale<0)throw new Error('El F9 total no puede ser menor que el F9 WEB. Revisá el modo elegido.');
    const adjustment=localSale-own.saleTotal;
    const local={...own,difference:0,surplus:0,shortage:0,cash:own.cashSales+adjustment,saleTotal:localSale,cashSales:own.cashSales+adjustment,expected:own.expected+adjustment,final:localSale-own.shipping};
    const expected=local.expected+web.expected;
    const difference=Math.round((Number(d.counted||0)-expected)*100)/100;
    return {...local,cash:Math.round((Number(d.counted||0)+local.cashSales-local.expected+web.cashSales-web.expected)*100)/100,local,web,expected,difference,surplus:Math.max(difference,0),shortage:Math.max(-difference,0),saleTotal:localSale+web.saleTotal,shipping:local.shipping+web.shipping,final:local.final+web.final,localCounted:Number(d.counted||0)-web.expected};
  }
  root.CajaMath={cents,calculate,shared};
  if(typeof module!=='undefined')module.exports=root.CajaMath;
})(typeof window!=='undefined'?window:globalThis);
