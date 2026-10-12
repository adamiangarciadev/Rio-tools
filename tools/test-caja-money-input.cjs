const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=require('../apps/movimientos-caja/money-input.js');
test('montos argentinos mantienen miles y centavos sin alterar el valor guardado',()=>{assert.equal(m.edit('1234567,50'),'1.234.567,50');assert.equal(m.read('1.234.567,50'),1234567.5);assert.equal(m.display(1234.56),'1.234,56');assert.equal(m.read(''), '');assert.equal(m.read('0'),0);});
test('rechaza letras, importes negativos, centavos excesivos y montos fuera de rango',()=>{for(const v of ['-1','abc','1,234','1,2,3','1.000.000.000'])assert.throws(()=>m.read(v));});
test('formato conserva el cursor al escribir en el medio del importe',()=>{const input={value:'12345,50',selectionStart:3,setSelectionRange(start){this.caret=start;}};assert.equal(m.update(input),12345.5);assert.equal(input.value,'12.345,50');assert.equal(input.caret,4);});
