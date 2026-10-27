const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseLrc,qqTrack,jsonText,createServices,qqAccountId}=require('../services');
test('LRC: multiple timestamps, hundredths, offsets and metadata',()=>{
  assert.deepEqual(parseLrc('[ar:歌手]\n[offset:-500]\n[00:01.50][00:03.125]第一行\n[00:02]第二行'),[
    {time:1,text:'第一行'},{time:1.5,text:'第二行'},{time:2.625,text:'第一行'}]);
});
test('QQ legacy and current metadata map to same desktop track',()=>{
  const old=qqTrack({songmid:'abc',songname:'A &amp; B',albummid:'album',songid:123,singer:[{name:'歌手'}],interval:42});
  const modern=qqTrack({mid:'abc',name:'A &amp; B',album:{mid:'album'},id:123,singer:[{name:'歌手'}],interval:42});
  assert.deepEqual(old,modern);assert.equal(old.title,'A & B');assert.equal(qqTrack({}),null);
});
test('JSONP is parsed without executing remote script',()=>{
  assert.deepEqual(jsonText('callback({"code":0});'),{code:0});
  assert.throws(()=>jsonText('alert("attack")'));
});
test('QQ search falls back from rejected primary API to legacy endpoint',async()=>{
  const calls=[];
  const service=createServices(async(url,options)=>{calls.push([url,options]);return {ok:true,text:async()=>JSON.stringify(calls.length===1?{code:0,req_1:{code:2000}}:{code:0,data:{song:{list:[{songmid:'abc',songname:'歌'}]}}})};});
  const tracks=await service.qqSearch('中文 & spaces');assert.equal(tracks[0].mid,'abc');assert.match(calls[1][0],/%26/);
});
test('QQ ticket requests use media identifiers and do not invent a URL without permission',async()=>{
  let payload;
  const service=createServices(async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({req_1:{data:{midurlinfo:[{purl:''}]}}})};});
  await assert.rejects(()=>service.qqStream({mid:'song123',mediaMid:'media456'},'uin=o0123; qqmusic_key=test','lossless'),/已尝试可用音质/);
  assert.deepEqual(payload.req_1.param.filename,['C400media456.m4a','C400media456media456.m4a']);assert.equal(payload.req_1.param.uin,'123');
});
test('Bilibili response errors remain errors rather than fabricated tracks',async()=>{
  const service=createServices(async()=>({ok:true,text:async()=>'{"code":-403,"message":"权限不足"}'}));
  await assert.rejects(()=>service.biliVideo('BV1GJ411x7h7'),/权限不足/);
  await assert.rejects(()=>service.biliVideo('not-a-video'),/BV/);
});
test('Bilibili selects the best ordinary audio without silently selecting VIP FLAC',async()=>{
  const service=createServices(async()=>({ok:true,text:async()=>JSON.stringify({code:0,data:{dash:{audio:[{baseUrl:'https://cdn.example/low',bandwidth:64000},{baseUrl:'https://cdn.example/high',bandwidth:128000}],flac:{audio:{baseUrl:'https://cdn.example/vip'}}}}})}));
  const result=await service.biliStream({bvid:'BV1GJ411x7h7',cid:123},'',{verify:false});assert.equal(result.url,'https://cdn.example/high');
});
test('QQ music identity takes precedence over browser QQ identity',()=>{
  assert.equal(qqAccountId('uin=o00123; str_musicid=789; musicid=456'),'789');
  assert.equal(qqAccountId('wxuin=00042'),'42');assert.equal(qqAccountId('uin=invalid'),'');
});
test('Logged-in library reads both groups and exposes favorites without importing songs',async()=>{
  const calls=[];
  const service=createServices(async url=>{calls.push(url);const data=url.includes('created_diss')?{disslist:[{dissid:'123',dirid:201,diss_name:'我喜欢',song_count:357},{dissid:'456',diss_name:'自建',song_count:4}]}:{cdlist:[{dissid:'789',dissname:'收藏歌单',songnum:8}]};return {ok:true,text:async()=>JSON.stringify({code:0,data})};});
  const library=await service.qqLibrary('musicid=42; qqmusic_key=example');
  assert.equal(library.favorites.remoteId,'123');assert.equal(library.favorites.count,357);assert.equal(library.created.length,1);assert.equal(library.collected.length,1);assert.equal(calls.length,2);assert.equal(library.warnings.length,0);
});
test('QQ favorites pagination uses authenticated directory 201 and advances correctly',async()=>{
  let body;
  const service=createServices(async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({code:0,playlist:{code:0,data:{songlist:[{mid:'song1',name:'歌曲'}],total_song_num:357,hasmore:1,dirinfo:{title:'我喜欢'}}}})};});
  const page=await service.qqCloudPlaylist({id:'favorites',title:'我喜欢'},200,'musicid=42; qqmusic_key=example');
  assert.equal(body.playlist.param.dirid,201);assert.equal(body.playlist.param.disstid,0);assert.equal(body.playlist.param.song_begin,200);assert.equal(page.nextOffset,201);assert.equal(page.total,357);
});
test('QQ lyrics prefer modern LRC endpoint and merge translations',async()=>{
  const data={lyric:Buffer.from('[00:01.50]Original').toString('base64'),trans:Buffer.from('[00:01.50]译文').toString('base64')};
  const service=createServices(async()=>({ok:true,text:async()=>JSON.stringify({lyric:{data}})}));
  assert.deepEqual(await service.qqLyrics({mid:'mid',catalogId:123}),[{time:1.5,text:'Original',translation:'译文'}]);
});

