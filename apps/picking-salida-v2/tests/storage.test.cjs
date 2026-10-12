require('fake-indexeddb/auto');
const {test}=require('node:test'),assert=require('node:assert/strict'),Dexie=require('dexie'),Storage=require('../storage.js');
test('durable draft survives reopening; competing tabs cannot overwrite; frozen payload immutable',async()=>{
 const name='test-'+crypto.randomUUID(),a=Storage.create(Dexie,name),b=Storage.create(Dexie,name);await a.open();await b.open();let j=await a.create({origen:'DEPOSITO'});const first=j;
 j=await a.change(j.id,j.revision,x=>{x.scans.push({id:crypto.randomUUID(),code:'000123'});return x;});
 await assert.rejects(()=>b.change(first.id,first.revision,x=>{x.scans=[];return x;}),/otra pestaña/);
 a.close();await a.open();assert.equal((await a.get(j.id)).scans[0].code,'000123');
 j=await a.freeze(j.id,j.revision,{scans:j.scans});await assert.rejects(()=>b.change(j.id,j.revision,x=>x),/cerrado/);
 await a.remote(j.id,{state:'READY'});assert.equal((await a.get(j.id)).scans.length,1);a.close();b.close();await Dexie.delete(name);
});
