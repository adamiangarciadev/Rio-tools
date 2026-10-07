const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const LocalStore=require('./local-store.cjs'),engine=require('../server/engine.js'),D=require('../shared/domain.js');
const root=path.resolve(__dirname,'../../..'),store=new LocalStore(path.join(__dirname,'../local-data/demo.json')),api=engine.create(store);
const actor={sub:'local-demo',email:'ensayo@local.test',role:'admin',origins:['DEPOSITO','AV2','SARMIENTO','PUEYRREDON']};
const port=Number(process.env.PORT||8770);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.svg':'image/svg+xml','.csv':'text/csv; charset=utf-8','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.url==='/api'&&req.method==='POST'){
    // Only local browser requests; do not expose the demo on a public interface.
    const origin=req.headers.origin;if(origin&&origin!==`http://127.0.0.1:${port}`&&origin!==`http://localhost:${port}`){res.writeHead(403).end();return;}
    try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2200000)throw Error('Pedido demasiado grande.');}const input=JSON.parse(raw);let result;
      if(input.action==='demoFault'){store.fault={stage:'after_txt'};result={armed:true};}
      else if(input.action==='demoRecover'){store.offset+=9*60000;result={jobs:api.recover(20)};}
      else result=api.handle(input,actor);
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,version:2,...result}));
    }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,version:2,code:e.code||'SERVER',error:e.message,retryable:e.permanent!==true}));}return;
  }
  const url=new URL(req.url,`http://127.0.0.1:${port}`);let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{res.writeHead(400).end();return;}
  let file=path.resolve(root,'.'+decoded);if(!file.startsWith(root+path.sep)||/(^|[\\/])(node_modules|server|gateway|deployment|local-data|tests|\.git)([\\/]|$)/.test(file)){res.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404).end('No encontrado');return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
server.listen(port,'127.0.0.1',()=>console.log(`Ensayo local: http://127.0.0.1:${port}/apps/picking-salida-v2/?demo=1`));
setInterval(()=>{try{api.recover(10);}catch(e){console.error('Recuperación de ensayo:',e.message);}},30000).unref();
