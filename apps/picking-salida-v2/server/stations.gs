/* Account-free operator access. Secrets are issued once per workstation, never bundled in the web. */
function stationHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function stationSecret_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function stations_(){return JSON.parse(PropertiesService.getScriptProperties().getProperty('PICKING_STATIONS')||'[]');}
function stationActor_(token){
 PickDomain.assert(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'AUTH','Este equipo todavía no está habilitado.');
 var hash=stationHash_(token),s=stations_().find(function(x){return x.enabled&&x.tokenHash===hash;});
 PickDomain.assert(s,'AUTH','La habilitación del equipo no es válida. Pedí una nueva a Sistemas.');
 return {sub:'station:'+s.id,email:'',name:s.name,role:s.role,origins:s.origins};
}
function activatePickingStation_(code){
 PickDomain.assert(typeof code==='string'&&/^[a-f0-9]{64}$/.test(code),'AUTH','Código de habilitación inválido.');
 var lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
  var list=stations_(),hash=stationHash_(code),s=list.find(function(x){return x.enabled&&x.activationHash===hash&&x.activationExpires>Date.now();});
  PickDomain.assert(s,'AUTH','El código venció o ya fue utilizado. Solicitá uno nuevo.');
  var token=stationSecret_();s.tokenHash=stationHash_(token);delete s.activationHash;delete s.activationExpires;s.activatedAt=Date.now();
  PropertiesService.getScriptProperties().setProperty('PICKING_STATIONS',JSON.stringify(list));
  return {stationToken:token,stationName:s.name,role:s.role};
 }finally{lock.releaseLock();}
}
/* Run manually in the private editor. Ten operator workstations + one supervisor.
   Codes expire after 24 hours, are consumed once, and are not operator passwords. */
function preparePickingStations(){
 var lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
  PickDomain.assert(!stations_().length,'EXISTS','Los equipos ya están creados. No se reemplazan habilitaciones existentes.');
  var list=[],codes=[];
  for(var i=0;i<11;i++){
   var code=stationSecret_(),name=i===10?'SUPERVISOR':'PUESTO '+String(i+1).padStart(2,'0');
   list.push({id:Utilities.getUuid(),name:name,role:i===10?'admin':'operator',origins:['DEPOSITO'],enabled:true,activationHash:stationHash_(code),activationExpires:Date.now()+86400000});
   codes.push({equipo:name,codigo:code});
  }
  PropertiesService.getScriptProperties().setProperty('PICKING_STATIONS',JSON.stringify(list));
  console.log('Códigos privados de habilitación (24 h, un uso). Entregar solo al administrador de cada equipo: '+JSON.stringify(codes));
 }finally{lock.releaseLock();}
}
/* For recovery, edit stationId inside this function in the PRIVATE editor before running.
   Disabled devices are rejected immediately by every request. */
function reissuePickingStation(){
 var stationId='REEMPLAZAR_POR_ID_DEL_EQUIPO';
 var lock=LockService.getScriptLock();lock.waitLock(10000);
 try{var list=stations_(),s=list.find(function(x){return x.id===stationId;});PickDomain.assert(s,'STATION','Seleccioná un ID de equipo existente.');var code=stationSecret_();s.enabled=true;s.activationHash=stationHash_(code);s.activationExpires=Date.now()+86400000;delete s.tokenHash;PropertiesService.getScriptProperties().setProperty('PICKING_STATIONS',JSON.stringify(list));console.log(s.name+' — código privado de un uso: '+code);}finally{lock.releaseLock();}
}
