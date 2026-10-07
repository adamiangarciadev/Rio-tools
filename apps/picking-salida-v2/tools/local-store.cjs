const crypto=require('node:crypto'), fs=require('node:fs'), path=require('node:path');
const D=require('../shared/domain.js');
class LocalStore {
  constructor(file){this.file=file;this.data=file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{jobs:{},files:{},rows:{},counter:0,heartbeat:0};this.offset=0;this.fault=null;this.locked=false;}
  now=()=>Date.now()+this.offset;
  uuid=()=>crypto.randomUUID();
  hash=s=>crypto.createHash('sha256').update(s).digest('hex');
  businessDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(this.now());
  route=(o,d)=>D.BRANCHES.includes(o)&&D.BRANCHES.includes(d)?o+'>'+d:'';
  ids=()=>[this.uuid(),this.uuid()];
  flush(){if(this.file){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data));fs.renameSync(this.file+'.tmp',this.file);}}
  hit(stage){if(this.fault?.stage===stage){const f=this.fault;this.fault=null;const e=new Error('Corte de ensayo: '+stage);if(f.crash)e.crash=true;throw e;}}
  lock(fn){if(this.locked)throw Error('Nested lock');this.locked=true;try{return fn();}finally{this.locked=false;}}
  get(id){return this.data.jobs[id]?structuredClone(this.data.jobs[id]):null;}
  save(j){this.hit('before_save_'+j.state);this.data.jobs[j.id]=structuredClone(j);this.flush();this.hit('after_save_'+j.state);}
  reserveNumber(j){this.hit('before_number');const n=this.data.counter+1;j.remito=String(n);j.state='NUMBERED';this.data.counter=n;this.data.jobs[j.id]=structuredClone(j);this.flush();this.hit('after_number');return j;}
  ensureManifest(j,body){this.ensure(j.manifestId,j.id+'.json','backup',body,!!j.accepted,'manifest');}
  readManifest(j){return this.data.files[j.manifestId]?.body||null;}
  ensure(id,name,parent,body,verified,stage){this.hit('before_'+stage);let f=this.data.files[id];if(!f){D.assert(!verified,'FILE_MISSING','El TXT ya verificado fue retirado. Requiere revisión.');this.data.files[id]={body,name,parent};this.flush();}else D.assert(f.body===body&&f.name===name&&f.parent===parent,'FILE_CONTENT','Archivo inconsistente.');this.hit('after_'+stage);}
  ensureTxt(j,body,verified){this.ensure(j.txtId,j.fileName,j.folderId,body,verified,'txt');}
  verifyTxt(j,body){const f=this.data.files[j.txtId];return !!f&&f.body===body&&f.name===j.fileName&&f.parent===j.folderId;}
  publish(j){this.hit('before_publish');const row={id:j.id,remito:j.remito,txtId:j.txtId,count:j.count};if(this.data.rows[j.id])D.assert(JSON.stringify(this.data.rows[j.id])===JSON.stringify(row),'ROW_CONFLICT','Fila modificada.');else {this.data.rows[j.id]=row;this.flush();}this.hit('after_publish');}
  verifyPublication(j){return this.data.rows[j.id]?.txtId===j.txtId;}
  pending(limit){return Object.values(this.data.jobs).filter(j=>!['READY','ATTENTION','CANCELLED'].includes(j.state)&&(j.leaseUntil||0)<=this.now()&&(j.nextAt||0)<=this.now()).slice(0,limit).map(j=>j.id);}
  history(m,actor){D.assert(/^\d{6}$/.test(m||''),'MONTH','Mes inválido.');return Object.values(this.data.jobs).filter(j=>j.id.startsWith(m)&&(actor.role==='admin'||j.owner===actor.sub)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,500);}
  heartbeat(){this.data.heartbeat=this.now();this.flush();}
  health(actor){return {mode:'demo',role:actor.role,origins:actor.origins,routes:actor.origins.flatMap(o=>D.BRANCHES.map(d=>o+'>'+d)),lastRecovery:this.data.heartbeat,stale:false};}
}
module.exports=LocalStore;
