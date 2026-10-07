/* Manual integration check: synthetic data, only the isolated pilot resources. */
function smokeTestPickingV2(){
 var cfg=pickingConfig_();PickDomain.assert(cfg.mode==='pilot','MODE','El ensayo solo se ejecuta en piloto.');
 var props=PropertiesService.getScriptProperties(),id=props.getProperty('PICKING_SMOKE_ID');
 if(!id){id=Utilities.formatDate(new Date(),'America/Argentina/Buenos_Aires','yyyyMMdd')+'_'+Utilities.getUuid();props.setProperty('PICKING_SMOKE_ID',id);}
 var p={version:2,id:id,responsable:'DAVID',origen:'DEPOSITO',destino:'AV2',bultos:1,catalogVersion:'ENSAYO-INTEGRACION-V2',reviewedUnknown:true,scans:[{id:'prueba-evento-0001',code:'ENSAYO!NEGRO!M'},{id:'prueba-evento-0002',code:'ENSAYO!NEGRO!M'}]};
 var actor={sub:'pilot-server-test',email:Session.getEffectiveUser().getEmail(),role:'admin',origins:['DEPOSITO']},store=pickingGoogleStore_(cfg),engine=PickEngine.create(store);
 var first=engine.handle({action:'submit',payload:p},actor).job;
 var second=engine.handle({action:'submit',payload:p},actor).job;
 PickDomain.assert(first.state==='READY'&&second.state==='READY'&&first.remito===second.remito&&first.fileId===second.fileId,'TEST','Ensayo incompleto: '+JSON.stringify(second));
 var content=engine.handle({action:'download',id:id},actor).content;
 PickDomain.assert(content==='ENSAYO!NEGRO!M\nENSAYO!NEGRO!M','TEST','Contenido distinto del original.');
 console.log(JSON.stringify({test:'PASS',id:id,remito:second.remito,txtId:second.fileId,count:second.count,duplicateSubmission:'same ID, same remito, same TXT'}));
}
