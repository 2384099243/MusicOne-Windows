'use strict';
const crypto=require('node:crypto');
const QUALITY={lossless:{prefix:'F000',ext:'flac',label:'FLAC'},high:{prefix:'M800',ext:'mp3',label:'320kbps'},standard:{prefix:'M500',ext:'mp3',label:'128kbps'},aac:{prefix:'C400',ext:'m4a',label:'AAC'}};
const LEVELS=Object.keys(QUALITY);
function qualityOrder(preference='standard'){return LEVELS.slice(Math.max(0,LEVELS.indexOf(preference)));}
function actualQuality(url){const name=decodeURIComponent(new URL(url).pathname.split('/').pop()||'');return LEVELS.find(q=>name.toUpperCase().startsWith(QUALITY[q].prefix))||null;}
function candidateId(url,quality){const u=new URL(url);return crypto.createHash('sha256').update(`${quality}|${u.hostname}${u.pathname}`).digest('hex').slice(0,20);}
function classifyAudio(bytes,type=''){
  const b=Buffer.from(bytes);const text=b.subarray(0,64).toString('utf8').trimStart();
  if(/^(?:<!doctype|<html|<\?xml|\{\s*"|\[\s*\{)/i.test(text)||/text\/|json|xml/.test(type))return 'invalid';
  if(b.subarray(0,3).toString()==='ID3'||(b.length>1&&b[0]===255&&(b[1]&224)===224))return 'mpeg';
  if(b.subarray(0,4).toString()==='fLaC')return 'flac';
  if(b.subarray(0,4).toString()==='OggS')return 'ogg';
  if(b.subarray(0,4).toString()==='RIFF')return 'wav';
  if(['ftyp','styp','moof'].includes(b.subarray(4,8).toString()))return 'mp4';
  if(/audio\//.test(type)&&b.length>0)return 'audio';
  return 'unknown';
}
async function probeAudio(fetcher,url,referer,signal){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);
  let response;
  try{
    response=await fetcher(url,{headers:{Range:'bytes=0-127',Referer:referer},signal:AbortSignal.any([controller.signal,...(signal?[signal]:[])])});
    if(!response.ok)return {ok:false,reason:'cdn_http',status:response.status};
    const reader=response.body?.getReader();if(!reader)return {ok:false,reason:'empty_media'};
    const chunks=[];let size=0;
    while(size<16){const {value,done}=await reader.read();if(done)break;chunks.push(Buffer.from(value).subarray(0,128));size+=value.length;}
    const format=classifyAudio(Buffer.concat(chunks).subarray(0,128),response.headers.get('content-type')||'');
    await reader.cancel().catch(()=>{});
    if(format==='invalid'||format==='unknown')return {ok:false,reason:format==='invalid'?'non_audio_response':'unrecognized_audio'};
    return {ok:true,format,status:response.status};
  }catch(error){if(signal?.aborted)throw error;return {ok:false,reason:'cdn_network'};}
  finally{clearTimeout(timer);if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{});}
}
async function resolveQqPlayback(track,cookie,preference,context){
  if(!/^[a-zA-Z0-9]+$/.test(track.mid||''))throw new Error('歌曲标识无效，请刷新歌单后重试');
  const {request,comm,mobileComm,fetcher,verify=true,signal}=context;
  const exclude=new Set(context.exclude||[]),skip=new Set(context.excludeQualities||[]),attempts=[];
  const combined=AbortSignal.any([AbortSignal.timeout(28000),...(signal?[signal]:[])]);
  const media=/^[a-zA-Z0-9]+$/.test(track.mediaMid||'')?track.mediaMid:track.mid;
  const guid=crypto.randomInt(1000000000,9999999999).toString();
  for(const quality of qualityOrder(preference)){
    if(skip.has(quality))continue;
    const spec=QUALITY[quality];
    const filenames=[...new Set([`${spec.prefix}${media}.${spec.ext}`,`${spec.prefix}${media}${media}.${spec.ext}`])];
    for(const platform of ['23','20']){
      if(combined.aborted)break;
      const event={quality,platform,stage:'ticket'};
      try{
        const param={guid,songmid:filenames.map(()=>track.mid),songtype:filenames.map(()=>Number(track.providerType)||0),uin:comm(cookie).uin,loginflag:1,platform,filename:filenames};
        if(platform==='23')Object.assign(param,{h5queryversion:1,nettype:'',cms:0,firstlogin:1,newver:1,nohash:0,quality:spec.prefix});
        const j=await request('https://u.y.qq.com/cgi-bin/musicu.fcg',cookie,'https://y.qq.com/',{comm:platform==='23'?mobileComm(cookie):comm(cookie),req_1:{module:'music.vkey.GetVkey',method:'UrlGetVkey',param}},{signal:combined,timeout:8000,userAgent:platform==='23'?'QQMusic 14090008(android 14)':undefined});
        if([301,401].includes(Number(j.code))){const error=new Error('QQ 音乐登录已过期，请重新登录');error.terminal=true;throw error;}
        const data=j.req_1?.data;
        const items=(data?.midurlinfo||[]).filter(x=>x.purl&&(!x.result||Number(x.result)===0));
        if(!items.length){attempts.push({...event,result:'unavailable',code:Number(data?.midurlinfo?.[0]?.result||j.req_1?.code||j.code||0)});continue;}
        for(const item of items){
          const urls=[...new Set([...(data.sip||[]),'https://isure.stream.qqmusic.qq.com/'].map(base=>{try{return new URL(item.purl,base).href.replace(/^http:/,'https:');}catch{return '';}}))].filter(Boolean);
          for(const url of urls.slice(0,3)){
            const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.qq.com'))continue;
            const actual=actualQuality(url);
            if(!actual||skip.has(actual)||(actual!==quality&&!(quality==='standard'&&actual==='aac')))continue;
            const id=candidateId(url,actual);if(exclude.has(id))continue;
            const probe=verify?await probeAudio(fetcher,url,'https://y.qq.com/',combined):{ok:true};
            if(!probe.ok){attempts.push({quality:actual,platform,stage:'media',result:probe.reason,status:probe.status});continue;}
            attempts.push({quality:actual,platform,stage:'media',result:'ready'});
            return {url,referer:'https://y.qq.com/',label:QUALITY[actual].label,quality:actual,requestedQuality:preference,downgraded:actual!==preference,candidateId:id,trial:/trial|[?&]src=/i.test(url),attempts};
          }
        }
        attempts.push({...event,result:'no_compatible_media'});
      }catch(error){
        if(signal?.aborted)throw error;
        attempts.push({...event,result:error.terminal?'login_expired':'request_failed'});
        if(error.terminal){error.attempts=attempts;throw error;}
      }
    }
  }
  const error=new Error(combined.aborted?'音源响应超时，已结束本次重试，请稍后重试':'已尝试可用音质，仍未获得可播放音源。请检查登录、歌曲权限或稍后重试');error.attempts=attempts;throw error;
}
module.exports={QUALITY,qualityOrder,actualQuality,candidateId,classifyAudio,probeAudio,resolveQqPlayback};
