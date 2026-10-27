const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createJournal}=require('../diagnostics');
test('Playback diagnostics omit credentials and signed URLs and survive a restart',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musicone-log-'));
  try{
    const journal=createJournal(dir);journal.record({source:'qq',stage:'media',result:'cdn_http',status:403,cookie:'SECRET_COOKIE',url:'https://example/secret?vkey=SECRET'});
    let saved;
    for(let i=0;i<30;i++){try{saved=await fs.readFile(path.join(dir,'playback-diagnostics.json'),'utf8');break;}catch{await new Promise(r=>setTimeout(r,10));}}
    assert.ok(saved);assert.ok(!saved.includes('SECRET'));assert.equal(JSON.parse(saved)[0].status,403);
    const restored=createJournal(dir);for(let i=0;i<30&&!restored.read().length;i++)await new Promise(r=>setTimeout(r,10));assert.equal(restored.read()[0].result,'cdn_http');
  }finally{assert.ok(dir.startsWith(path.join(os.tmpdir(),'musicone-log-')));await fs.rm(dir,{recursive:true});}
});
