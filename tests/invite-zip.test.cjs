const fs = require('node:fs'); const Module = require('node:module'); const assert = require('node:assert/strict'); const zlib=require('node:zlib');
const root=require('node:path').resolve(__dirname, '..'); const ts=require(root+'/node_modules/typescript'); const JSZip=require(root+'/node_modules/jszip');
const mod=new Module(root+'/src/lib/invite-zip.ts'); mod.filename=root+'/src/lib/invite-zip.ts'; mod.paths=Module._nodeModulePaths(root+'/src/lib');
mod._compile(ts.transpileModule(fs.readFileSync(root+'/src/lib/invite-zip.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,mod.filename);
const {listZip,readZipEntry,newZipBudget,inspectZip,ZIP_LIMITS}=mod.exports;
let checks=0; const check=(ok,message)=>{assert.ok(ok,message);checks++};
const zip=async entries=>{const z=new JSZip(); for(const [name,data] of entries) z.file(name,data);return z.generateAsync({type:'uint8array',compression:'STORE'});};
const rejects=async(fn,re)=>{await assert.rejects(fn,re);checks++};
(async()=>{
 const data=await zip([['目录/a.docx','first'],['b.docx','second'],['x.pdf','pdf'],['__MACOSX/junk','junk'],['.hidden','junk']]);
 const b=newZipBudget();const rows=await listZip(data,'外层.zip',1,b);
 check(rows.length===3,'hidden ignored');check(rows[0].path==='外层.zip / 目录/a.docx','Chinese UTF8 path');check(b.actual===0,'directory does not inflate');
 check(new TextDecoder().decode(await readZipEntry(rows[1],b,()=>{}))==='second','selected content');check(b.actual===6,'only selected content consumed');
 const inner=await zip([['中文.doc','hello']]);const outer=await zip([['内层.zip',inner]]);const nb=newZipBudget();const nr=await listZip(outer,'外层.zip',1,nb);const nested=await listZip(await readZipEntry(nr[0],nb,()=>{}),nr[0].path,2,nb);check(nested[0].path==='外层.zip / 内层.zip / 中文.doc','nested path');
 const cn=new JSZip();cn.file('测试.docx','ok');const gbk=await cn.generateAsync({type:'uint8array',encodeFileName:name=>name==='测试.docx'?Uint8Array.from([0xb2,0xe2,0xca,0xd4,46,100,111,99,120]):new TextEncoder().encode(name)});
 // Remove Unicode extra-field IDs to exercise the GBK fallback rather than JSZip's Unicode helper.
 for(let i=0;i<gbk.length-3;i++)if(gbk[i]===0x75&&gbk[i+1]===0x70){gbk[i]=0x76;gbk[i+1]=0x70;}
 check((await listZip(gbk,'中文.zip',1,newZipBudget()))[0].name==='测试.docx','GBK fallback');
 await rejects(()=>listZip(Uint8Array.from([1,2,3]),'bad.zip',1,newZipBudget()),/损坏|有效/);
 const encrypted=data.slice();let c=-1;for(let i=0;i<encrypted.length-4;i++)if(new DataView(encrypted.buffer).getUint32(i,true)===0x02014b50){c=i;break;}
 const ev=new DataView(encrypted.buffer);ev.setUint16(c+8,ev.getUint16(c+8,true)|1,true);await rejects(()=>listZip(encrypted,'encrypted.zip',1,newZipBudget()),/加密/);
 const many=data.slice();new DataView(many.buffer).setUint16(many.length-12,501,true);await rejects(()=>listZip(many,'many.zip',1,newZipBudget()),/500 个/);
 const bomb=data.slice();new DataView(bomb.buffer).setUint32(c+24,ZIP_LIMITS.expanded+1,true);await rejects(()=>listZip(bomb,'bomb.zip',1,newZipBudget()),/500MB/);
 await rejects(()=>listZip(new Uint8Array(ZIP_LIMITS.archive+1),'large.zip',1,newZipBudget()),/100MB/);
 const exhausted=newZipBudget();exhausted.actual=ZIP_LIMITS.expanded-1;await rejects(()=>readZipEntry(rows[0],exhausted,()=>{}),/500MB/);
 const broken=data.slice();broken[Buffer.from(broken).indexOf('first')]^=1;const br=await listZip(broken,'broken.zip',1,newZipBudget());await rejects(()=>readZipEntry(br[0],newZipBudget(),()=>{}),/损坏/);
 const component=fs.readFileSync(root+'/src/components/tenders/InviteZipPicker.vue','utf8');const view=fs.readFileSync(root+'/src/views/TendersView.vue','utf8');
 check(component.includes('row.depth >= ZIP_LIMITS.depth')&&component.includes('row.depth < ZIP_LIMITS.depth'),'depth UI guards');check(component.includes('selected.value.length >= remaining.value'),'selection cap');check(component.includes('for (const id of selected.value)'),'selection ordering');check(view.includes('files.forEach(file => addUpload(file, false))'),'existing upload validation reused');
 console.log(JSON.stringify({checks,jszipVersion:require(root+'/node_modules/jszip/package.json').version,minifiedBytes:fs.statSync(root+'/node_modules/jszip/dist/jszip.min.js').size,gzipBytes:zlib.gzipSync(fs.readFileSync(root+'/node_modules/jszip/dist/jszip.min.js')).length},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});


