// Crear un proyecto separado y copiar también core.js como Core.gs.
const PRECIOS_TZ = 'America/Argentina/Buenos_Aires';

function instalarPreciosWeb() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'actualizarPreciosProgramado') ScriptApp.deleteTrigger(t);
  });
  // Chequeo cada cinco minutos: evita la variación de +/-15 min de nearMinute.
  ScriptApp.newTrigger('actualizarPreciosProgramado').timeBased().everyMinutes(5).create();
  actualizarPreciosProgramado();
}

function actualizarPreciosProgramado() {
  const props = PropertiesService.getScriptProperties();
  try { actualizarPreciosWeb(); }
  catch (error) { props.setProperty('syncError', error.message); console.error(error); }
}

function actualizarPreciosWeb() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const now = new Date();
    const one = buscarListaPrecios_(1), three = buscarListaPrecios_(3);
    const props = PropertiesService.getScriptProperties(), id = props.getProperty('reportFileId');
    const fingerprint = JSON.stringify([one.source.messageId,three.source.messageId]);
    if(id && props.getProperty('completedSources')===fingerprint){props.setProperty('syncError','');return;}
    const day = Utilities.formatDate(new Date(Math.min(new Date(one.source.date).getTime(),new Date(three.source.date).getTime())),PRECIOS_TZ,'yyyy-MM-dd');
    // Se validan ambas listas antes de reemplazar el reporte anterior.
    const rows = PreciosCore.merge(PreciosCore.parse(one.text, 'LISTA1'), PreciosCore.parse(three.text, 'LISTA3'));
    const report = {ok:true,day,updatedAt:now.toISOString(),sources:{lista1:one.source,lista3:three.source},rows};
    const json = JSON.stringify(report);
    if (id) DriveApp.getFileById(id).setContent(json);
    else {
      const folder = DriveApp.createFolder('Rio - Precios WEB');
      const file = folder.createFile('precios-web.json',json,MimeType.PLAIN_TEXT);
      props.setProperty('reportFileId',file.getId());
    }
    props.setProperties({completedSources:fingerprint,syncError:''});
    return report;
  } finally {lock.releaseLock();}
}

function buscarListaPrecios_(list) {
  const subject = 'Reporte zNube - PRECIOS LISTA' + list;
  const matches = [], query = 'from:znube@zoologic.com.ar subject:"' + subject + '" has:attachment';
  for (let offset=0; ; offset+=100) {
    const threads=GmailApp.search(query,offset,100);
    threads.forEach(thread=>thread.getMessages().forEach(message=>{
      const date=message.getDate();
      const sender=message.getFrom().toLowerCase();
      if(message.getSubject().trim()!==subject || !/^(?:znube@zoologic\.com\.ar|.*<znube@zoologic\.com\.ar>)$/.test(sender)) return;
      matches.push({message,date});
    }));
    if(threads.length<100)break;
  }
  matches.sort((a,b)=>b.date-a.date);
  if(!matches.length)throw new Error('No se encontró un mail de LISTA'+list+'. Se conserva el último reporte completo.');
  const latest=matches[0], message=latest.message;
  const attachments=message.getAttachments({includeInlineImages:false}).filter(a=>/\.csv$/i.test(a.getName()) && new RegExp('LISTA'+list+'\\.CSV$','i').test(a.getName()));
  if(attachments.length!==1)throw new Error('El último mail de '+subject+' no tiene un único CSV válido.');
  return {text:attachments[0].getDataAsString('UTF-8'),source:{date:latest.date.toISOString(),filename:attachments[0].getName(),messageId:message.getId()}};
}

function doGet() {
  try {
    const props=PropertiesService.getScriptProperties(), id=props.getProperty('reportFileId');
    if(!id)throw new Error(props.getProperty('syncError') || 'Todavía no se procesaron ambas listas.');
    const report=JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString());
    report.syncError=props.getProperty('syncError') || '';
    return preciosJson_(report);
  } catch(error){return preciosJson_({ok:false,error:error.message});}
}
function preciosJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
