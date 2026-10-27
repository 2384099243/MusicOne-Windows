const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {parseRange,localMediaResponse}=require('../media');
test('Local seeking validates and bounds byte ranges',()=>{
  assert.deepEqual(parseRange('bytes=3-9',10),{start:3,end:9});assert.deepEqual(parseRange('bytes=3-',10),{start:3,end:9});assert.deepEqual(parseRange('bytes=-2',10),{start:8,end:9});
  assert.equal(parseRange('bytes=20-30',10),false);assert.equal(parseRange('bytes=2-1',10),false);assert.equal(parseRange('bytes=0-1,5-6',10),false);
});
test('Local audio responses preserve full length and support real partial reads',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musicone-media-test-'));const file=path.join(dir,'中文.wav');await fs.writeFile(file,Buffer.from('0123456789'));
  try{
    const full=await localMediaResponse(file,new Request('https://local/'));assert.equal(full.headers.get('Content-Length'),'10');assert.equal(full.headers.get('Content-Type'),'audio/wav');assert.equal(await full.text(),'0123456789');
    const part=await localMediaResponse(file,new Request('https://local/',{headers:{Range:'bytes=2-5'}}));assert.equal(part.status,206);assert.equal(part.headers.get('Content-Range'),'bytes 2-5/10');assert.equal(await part.text(),'2345');
  }finally{await fs.rm(file);await fs.rmdir(dir);}
});
