const {test}=require('node:test');const assert=require('node:assert/strict');
const {qualityOrder,resolveQqPlayback,probeAudio,classifyAudio}=require('../playback');
const envelope=()=>({uin:'42'}),track={id:'qq:song',mid:'song',mediaMid:'media',providerType:111};
function ticket(filename,bases=['https://a.qq.com/']){return {code:0,req_1:{code:0,data:{sip:bases,midurlinfo:[{purl:filename,result:0}]}}};}
test('Automatic quality order never upgrades beyond the preference',()=>{
  assert.deepEqual(qualityOrder('lossless'),['lossless','high','standard','aac']);assert.deepEqual(qualityOrder('high'),['high','standard','aac']);assert.deepEqual(qualityOrder('standard'),['standard','aac']);
});
test('Failed FLAC tickets downgrade to working MP3 and reject HTML from a bad CDN',async()=>{
  const qualities=[];let provider;
  const context={comm:envelope,mobileComm:envelope,request:async(_u,_c,_r,body)=>{const p=body.req_1.param;qualities.push(p.filename[0].slice(0,4));provider=p.songtype;return p.filename[0].startsWith('F000')?{code:0,req_1:{data:{midurlinfo:[]}}}:ticket('M800media.mp3',['https://bad.qq.com/','https://good.qq.com/']);},fetcher:async url=>new Response(url.includes('bad.')?'<html>Denied</html>':Buffer.from('ID3-audio'),{status:200,headers:{'Content-Type':url.includes('bad.')?'text/html':'audio/mpeg'}})};
  const result=await resolveQqPlayback(track,'','lossless',context);
  assert.equal(result.quality,'high');assert.equal(result.label,'320kbps');assert.equal(result.downgraded,true);assert.equal(new URL(result.url).hostname,'good.qq.com');assert.deepEqual(provider,[111,111]);assert.deepEqual(qualities,['F000','F000','M800']);
  assert.ok(result.attempts.some(a=>a.result==='non_audio_response'));
});
test('A failed first ticket endpoint still permits the compatibility endpoint',async()=>{
  let calls=0;
  const result=await resolveQqPlayback(track,'','lossless',{comm:envelope,mobileComm:envelope,verify:false,request:async()=>{if(++calls===1)throw new Error('network');return ticket('F000media.flac');}});
  assert.equal(result.quality,'lossless');assert.equal(calls,2);
});
test('Decoder recovery excludes a codec and continues at lower quality',async()=>{
  const requested=[];
  const result=await resolveQqPlayback(track,'','lossless',{comm:envelope,mobileComm:envelope,excludeQualities:['lossless'],verify:false,request:async(_u,_c,_r,b)=>{const f=b.req_1.param.filename[0];requested.push(f);return ticket(f);}});
  assert.equal(result.quality,'high');assert.ok(requested.every(f=>!f.startsWith('F000')));
});
test('Media probes reject HTTP errors and non-audio payloads',async()=>{
  assert.equal(classifyAudio(Buffer.from('{"error":"expired"}'),'application/json'),'invalid');
  assert.equal((await probeAudio(async()=>new Response(null,{status:403}),'https://a.qq.com/a','https://y.qq.com/')).reason,'cdn_http');
});
test('Cancellation prevents resolution of another song from continuing',async()=>{
  const c=new AbortController();c.abort();let calls=0;
  await assert.rejects(()=>resolveQqPlayback(track,'','high',{comm:envelope,mobileComm:envelope,signal:c.signal,request:async()=>{calls++;return ticket('M800media.mp3');}}));assert.equal(calls,0);
});
