const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('apps/banco-medios/dropbox.gs', 'utf8');
const calls = [];
const config = {DROPBOX_APP_KEY:'key',DROPBOX_APP_SECRET:'secret',DROPBOX_REFRESH_TOKEN:'refresh',DROPBOX_SHARED_LINK:'https://www.dropbox.com/root?rlkey=x&dl=0'};
const context = {
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>config[key]})},
  jsonOutput:value=>value,
  UrlFetchApp:{fetch:(url, options)=>{
    calls.push({url, options});
    let result;
    if(url.endsWith('oauth2/token')) result={access_token:'private-token'};
    else if(url.endsWith('files/list_folder')) {
      assert.equal(JSON.parse(options.payload).shared_link.url,config.DROPBOX_SHARED_LINK);
      result={entries:[{'.tag':'folder',name:'Marca'},{'.tag':'file',name:'foto.jpg',id:'image',size:1024},{'.tag':'file',name:'documento.pdf'}],has_more:true,cursor:'server-cursor'};
    } else if(url.endsWith('files/list_folder/continue')) result={entries:[{'.tag':'file',name:'foto2.png',id:'image2',size:1024},{'.tag':'file',name:'Campana.MP4',id:'video',size:2048}],has_more:false};
    else result={url:'https://www.dropbox.com/scl/fo/root/file?rlkey=x&dl=0'};
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(result)};
  }}
};
vm.createContext(context);vm.runInContext(source,context);
const result=context.dropboxImages({path:'/Marca'});
assert.equal(result.ok,true);assert.equal(result.items.length,3);assert.equal(result.total,3);
assert.equal(result.items[2].kind,'video');
const searched=context.dropboxImages({path:'/Marca',q:'FOTO2'});
assert.equal(searched.total,1);assert.equal(searched.items[0].nombre,'foto2.png');
assert.equal(context.dropboxImages({path:'/Marca',type:'video'}).items[0].nombre,'Campana.MP4');
assert.equal(context.dropboxImages({path:'/Marca',type:'image'}).total,2);
assert.equal(context.dropboxImages({path:'/Marca',q:'inexistente'}).total,0);
assert.equal(result.folders[0].path,'/Marca/Marca');
for(const item of result.items){assert.equal(new URL(item.previewUrl).searchParams.get('raw'),'1');assert.equal(new URL(item.downloadUrl).searchParams.get('dl'),'1');}
assert(!JSON.stringify(result).includes('private-token'));
assert(!JSON.stringify(result).includes('secret'));
const count=calls.length;
assert.equal(context.dropboxImages({path:'/../other'}).ok,false);
assert.equal(calls.length,count);
assert.equal(context.dropboxImages({path:'/Marca',offset:3}).items.length,0);
for(const call of calls) assert(!/write|delete|upload|create_shared/.test(call.url));
console.log('Dropbox: busqueda sin distinguir mayusculas, videos, filtros, paginacion y acceso de lectura verificados.');
