const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
for(const f of ['app.js','storage.js','shared/domain.js','server/engine.js','server/google-adapter.gs','server/entry.gs','deployment/Code.gs','sw.js'])new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const match of html.matchAll(/(?:src|href)="([^"?#]+)"/g)){const f=match[1];if(!f.startsWith('http')&&!fs.existsSync(path.resolve(root,f)))throw Error('Missing asset: '+f);}
console.log('Syntax and linked local assets verified.');
