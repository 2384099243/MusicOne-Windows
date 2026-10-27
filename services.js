'use strict';
// Protocols adapted from HGODLK/MusicOne: QqApiClient, QqJsonMappers and BiliApi.
const {resolveQqPlayback,probeAudio,candidateId}=require('./playback');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36';
const {parseLrc,parseQrc}=require('./lyric-parser');
const QQ = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const decode = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function jsonText(text) {
  text = text.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) text = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
  const parsed=JSON.parse(text);
  if (!parsed || typeof parsed!=='object') throw new Error('Invalid API response');
  return parsed;
}
function decodeLyric(text) {
  text=String(text||'').trim();
  if(!text)return '';
  if(!text.includes('[')&&!text.includes('<'))text=Buffer.from(text,'base64').toString('utf8');
  return text.replace(/&#10;/g,'\n').replace(/&#13;/g,'\r').replace(/&#91;/g,'[').replace(/&#93;/g,']');
}
function qqAccountId(cookie) {
  const values=Object.fromEntries(String(cookie).split(';').map(p=>p.trim()).filter(p=>p.includes('=')).map(p=>[p.slice(0,p.indexOf('=')),p.slice(p.indexOf('=')+1)]));
  for(const field of ['str_musicid','musicid','qqmusic_uin','userid','user_id','uin','wxuin','ptui_loginuin','luin','pt2gguin','superuin','p_uin']) {
    const value=(values[field]||'').trim().replace(/^o/,'').replace(/^0+/,'');if(/^\d+$/.test(value))return value;
  }
  return '';
}
function qqTrack(s) {
  const mid = s.songmid || s.mid;
  if (!mid) return null;
  const albumMid = s.albummid || s.album?.mid || s.album?.pmid;
  return {id: `qq:${mid}`, source: 'qq', mid, catalogId: s.songid || s.id || 0,
    mediaMid: s.file?.media_mid || s.strMediaMid || '', providerType:Number(s.type)||0,
    title: decode(s.songname || s.name), artist: (s.singer || []).map(x => decode(x.name)).join(' / ') || '未知歌手',
    album: decode(s.albumname || s.album?.name), duration: Number(s.interval || 0),
    cover: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg` : '',
    vip: Boolean(s.pay?.pay_play), size: s.file || {}};
}
function checkBili(j) {
  if (j.code !== 0) throw new Error(`哔哩哔哩：${j.message || '请求失败'}（${j.code}）`);
  return j.data;
}
function createServices(fetcher = global.fetch) {
  const detailsCache=new Map();
  async function request(url, cookie = '', referer = 'https://y.qq.com/', body, options={}) {
    const headers = {'User-Agent': options.userAgent||UA, Referer: referer, ...(cookie ? {Cookie: cookie} : {})};
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetcher(url, {method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.any([AbortSignal.timeout(options.timeout||18000),...(options.signal?[options.signal]:[])])});
    if (!response.ok) throw new Error(`音源服务器返回 HTTP ${response.status}`);
    const text = await response.text();
    try { return jsonText(text); } catch { throw new Error('音源没有返回有效数据，可能需要登录或稍后重试'); }
  }
  const cookieValue = (cookie, name) => cookie.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
  function comm(cookie) {return {ct:24,cv:4747474,format:'json',inCharset:'utf-8',outCharset:'utf-8',platform:'yqq.json',needNewCode:1,uin:qqAccountId(cookie) || '0'};}
  function mobileComm(cookie) {
    const key=['musickey','qqmusic_key','qm_keyst','authst','p_skey','skey'].map(name=>cookieValue(cookie,name)).find(Boolean)||'';
    return {ct:11,cv:14090008,v:14090008,chid:'10003505',qq:comm(cookie).uin,authst:key,tmeAppID:'qqmusic',tmeLoginType:Number(cookieValue(cookie,'loginType'))||(key.startsWith('W_X')?1:2),format:'json'};
  }
  async function qqSearch(query, cookie = '', page = 1) {
    const body = {comm:comm(cookie),req_1:{module:'music.search.SearchCgiService',method:'DoSearchForQQMusicDesktop',param:{query,search_type:0,page_num:page,num_per_page:30,sin:(page-1)*30,ein:page*30,highlight:0,cat:2,grp:1,nqc_flag:0,remoteplace:'txt.mqq.all',multi_zhida:0,sem:0}}};
    let primaryError;
    try {
      const j = await request(QQ, cookie, undefined, body);
      if (j.code !== 0 || j.req_1?.code !== 0) throw new Error(`QQ 音乐搜索受限（${j.req_1?.code ?? j.code}），可先登录账号再试`);
      const data = j.req_1.data;
      if (data?.meta?.is_filter < 0) throw new Error('QQ 音乐搜索被平台限制，请先登录账号，或使用“平台页面”搜索');
      const list = data?.body?.song?.list || data?.song?.list;
      if (list) return list.map(qqTrack).filter(Boolean);
      throw new Error('QQ 音乐未返回搜索结果');
    } catch (e) { primaryError = e; }
    try {
      const j = await request(`https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent(query)}&format=json&p=${page}&n=30`,cookie,'https://y.qq.com/portal/search.html');
      if (j.code !== 0 || !j.data?.song?.list) throw primaryError;
      if (!j.data.song.list.length && primaryError) throw primaryError;
      return j.data.song.list.map(qqTrack).filter(Boolean);
    } catch { throw primaryError; }
  }
  async function qqStream(track,cookie='',quality='standard',options={}) {
    let metadata=detailsCache.get(track.mid);
    if(!metadata&&(!track.mediaMid||track.mediaMid===track.mid||track.providerType===undefined)){
      try{
        const root=await request(QQ,cookie,undefined,{comm:comm(cookie),req_1:{module:'music.pf_song_detail_svr',method:'get_song_detail_yqq',param:{song_mid:track.mid,song_type:Number(track.providerType)||0,song_id:Number(track.catalogId)||0}}},{signal:options.signal,timeout:4500});
        const detail=qqTrack(root.req_1?.data?.track_info||{});
        if(detail?.mid===track.mid){metadata=detail;detailsCache.set(track.mid,detail);if(detailsCache.size>200)detailsCache.delete(detailsCache.keys().next().value);}
      }catch(error){if(options.signal?.aborted)throw error;}
    }
    const resolved=metadata?{...track,...metadata}:track;
    return {...await resolveQqPlayback(resolved,cookie,quality,{request,comm,mobileComm,fetcher,...options}),metadata:metadata||undefined};
  }
  async function qqLyrics(track,cookie='') {
    try {
      const j=await request(QQ,cookie,undefined,{comm:{ct:19,cv:0,tmeAppID:'qqmusiclight'},lyric:{module:'music.musichallSong.PlayLyricInfo',method:'GetPlayLyricInfo',param:{songMID:track.mid,songID:Number(track.catalogId)||0,platform:0,needNew:1,crypt:0,qrc:0,roma:0,trans:1}}});
      const data=j.lyric?.data;const timed=parseQrc(decodeLyric(data?.qrc));const original=timed.length?timed:parseLrc(decodeLyric(data?.lyric));
      if(original.length){const translated=parseLrc(decodeLyric(data?.trans));return original.map(l=>({...l,translation:translated.find(t=>Math.abs(t.time-l.time)<.15)?.text||''}));}
    } catch { /* Legacy endpoint remains a fallback for older song records. */ }
    const j=await request(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(track.mid)}&format=json&nobase64=1`,cookie,'https://y.qq.com/portal/player.html');
    return parseLrc(decodeLyric(j.lyric));
  }
  function requireQqData(j,label) {
    if((j.code!==undefined&&Number(j.code)!==0)||!j.data)throw new Error(`${label}读取失败，请更新 QQ 音乐登录后重试`);
    return j.data;
  }
  const unique=values=>[...new Map(values.map(p=>[p.id,p])).values()];
  const playlistShell=(item,kind)=>{
    const remoteId=String(item.dissid||item.tid||'').replace(/^0$/,'');
    const dirId=Number(item.dirid)||0;
    const title=decode(item.diss_name||item.dissname||item.title||item.name||'');
    if((!remoteId&&!dirId)||!title)return null;
    const favorite=dirId===201||['我喜欢','我喜欢的音乐'].includes(title.replace(/\s/g,''));
    return {id:favorite?'favorites':remoteId||`dir:${dirId}`,remoteId,dirId,title:favorite?'我喜欢':title,kind:favorite?'favorites':kind,count:Number(item.song_count||item.song_num||item.song_cnt||item.songnum||0),cover:String(item.diss_cover||item.picurl||item.logo||item.cover||'').replace(/^\/\//,'https://').replace(/^http:/,'https:')};
  };
  async function qqLibrary(cookie='') {
    const userId=qqAccountId(cookie);
    if(!cookie||!userId)throw new Error('请先登录 QQ 音乐，登录后自动读取你的音乐库');
    async function created() {
      const all=[];
      for(let offset=0;offset<2000;offset+=100){
        const query=new URLSearchParams({hostuin:userId,sin:String(offset),size:'100',format:'json',inCharset:'utf8',outCharset:'utf-8'});
        const data=requireQqData(await request(`https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?${query}`,cookie),'自建歌单');
        const list=data.disslist||data.list||[];all.push(...list.map(p=>playlistShell(p,'created')).filter(Boolean));if(list.length<100)break;
      }return unique(all);
    }
    async function collected() {
      const all=[];
      for(let offset=0;offset<2000;offset+=100){
        const query=new URLSearchParams({format:'json',inCharset:'utf8',outCharset:'utf-8',platform:'yqq.json',needNewCode:'0',loginUin:userId,hostUin:'0',notice:'0',g_tk:'5381',ct:'20',cid:'205360956',userid:userId,reqtype:'3',sin:String(offset),ein:String(offset+99)});
        const data=requireQqData(await request(`https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?${query}`,cookie),'收藏歌单');
        const list=data.cdlist||[];all.push(...list.map(p=>playlistShell(p,'collected')).filter(Boolean));if(list.length<100)break;
      }return unique(all);
    }
    const results=await Promise.allSettled([created(),collected()]);
    const lists=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    const favorite=lists.find(p=>p.kind==='favorites')||{id:'favorites',remoteId:'',dirId:201,title:'我喜欢',kind:'favorites',count:null,cover:''};
    return {favorites:favorite,created:unique(lists.filter(p=>p.kind==='created'&&!['qzone背景音乐','本地上传'].includes(p.title.replace(/\s/g,'').toLowerCase()))),collected:unique(lists.filter(p=>p.kind==='collected')),warnings:results.filter(r=>r.status==='rejected').map(r=>r.reason.message)};
  }
  async function qqCloudPlaylist(playlist,offset=0,cookie='') {
    if(!cookie||!qqAccountId(cookie))throw new Error('请先登录 QQ 音乐');
    const favorite=playlist.id==='favorites';
    const remoteId=String(playlist.remoteId||'');
    if(!favorite&&!/^\d+$/.test(remoteId)&&!Number(playlist.dirId))throw new Error('云端歌单标识无效');
    const requestOffset=Math.max(0,Math.floor(Number(offset)||0));
    let primaryError;
    try {
      const j=await request(QQ,cookie,undefined,{comm:mobileComm(cookie),playlist:{module:'music.srfDissInfo.DissInfo',method:'CgiGetDiss',param:{disstid:favorite?0:Number(remoteId)||0,dirid:favorite?201:(!remoteId?Number(playlist.dirId):0),song_begin:requestOffset,song_num:200,tag:true,userinfo:true,orderlist:true,onlysonglist:false}}});
      if(j.code!==0||j.playlist?.code!==0)throw new Error('QQ 音乐暂时无法读取歌单，请更新登录');
      const data=j.playlist.data;
      if(!Array.isArray(data?.songlist)||Number(data.code||0)!==0||Number(data.subcode||0)!==0)throw new Error('QQ 音乐未返回歌单内容');
      const tracks=data.songlist.map(qqTrack).filter(Boolean),total=Number(data.total_song_num??playlist.count??tracks.length);
      const hasMore=data.hasmore!==undefined?Boolean(Number(data.hasmore)):requestOffset+data.songlist.length<total;
      return {title:decode(data.dirinfo?.title||data.dirinfo?.dissname||playlist.title),tracks,total,nextOffset:hasMore&&data.songlist.length?requestOffset+data.songlist.length:null};
    }catch(e){primaryError=e;}
    if(remoteId){
      const legacy=await qqPlaylist(remoteId,cookie);
      if(requestOffset>0)return {title:legacy.title,tracks:[],total:legacy.tracks.length,nextOffset:null,warning:'平台分页接口暂不可用，仅显示已读取的歌曲'};
      return {title:legacy.title,tracks:legacy.tracks,total:legacy.tracks.length,nextOffset:null,warning:legacy.partial?'平台仅返回部分歌曲，请稍后刷新重试':''};
    }
    throw primaryError;
  }
  async function qqPlaylist(input,cookie='') {
    const id = String(input).match(/(?:id=|disstid=|playlist\/)(\d+)/)?.[1] || (/^\d+$/.test(input.trim()) ? input.trim() : '');
    if (!id) throw new Error('请粘贴完整 QQ 音乐歌单链接或数字歌单 ID；暂不支持短链接');
    const j=await request(`https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${id}&format=json`,cookie,'https://y.qq.com/');
    const data=j.cdlist?.[0];
    if (!data) throw new Error('无法读取歌单，请检查链接、公开状态和账号权限');
    return {title:decode(data.dissname),tracks:(data.songlist||[]).map(qqTrack).filter(Boolean),partial:(data.songnum||0)>(data.songlist||[]).length};
  }
  async function biliVideo(input,cookie='') {
    const bvid=String(input).match(/BV[a-zA-Z0-9]{10}/)?.[0];
    if (!bvid) throw new Error('请输入 BV 号或含 BV 号的完整视频链接');
    const d=checkBili(await request(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,cookie,'https://www.bilibili.com/'));
    return (d.pages||[]).map(p=>({id:`bili:${bvid}:${p.cid}`,source:'bili',bvid,cid:p.cid,title:d.pages.length>1?`${decode(d.title)} · ${decode(p.part)}`:decode(d.title),artist:decode(d.owner?.name),album:'哔哩哔哩',duration:p.duration,cover:d.pic?.replace(/^http:/,'https:')||''}));
  }
  async function biliStream(track,cookie='',options={}) {
    const signal=AbortSignal.any([AbortSignal.timeout(26000),...(options.signal?[options.signal]:[])]);
    if (!/^BV[a-zA-Z0-9]{10}$/.test(track.bvid||'') || !/^\d+$/.test(String(track.cid))) throw new Error('视频标识无效');
    const referer=`https://www.bilibili.com/video/${track.bvid}`;
    const d=checkBili(await request(`https://api.bilibili.com/x/player/playurl?bvid=${track.bvid}&cid=${track.cid}&qn=127&fnval=4048&fourk=1`,cookie,referer,undefined,{signal}));
    const streams=[...(d.dash?.audio||[])].sort((a,b)=>{
      const compatibility=x=>String(x.codecs||'').startsWith('mp4a')?1:0;
      return compatibility(b)-compatibility(a)||b.bandwidth-a.bandwidth;
    });
    const attempts=[];const excluded=new Set(options.exclude||[]);
    for(const audio of streams){
      if(signal.aborted)break;
      const urls=[audio.baseUrl||audio.base_url,...(audio.backupUrl||audio.backup_url||[])].filter(u=>/^https?:\/\//.test(u)).map(u=>u.replace(/^http:/,'https:'));
      for(const url of [...new Set(urls)].slice(0,4)){
        if(signal.aborted)break;
        const id=candidateId(url,String(audio.id));if(excluded.has(id))continue;
        let result;
        try{result=options.verify===false?{ok:true}:await probeAudio(fetcher,url,referer,signal);}catch(error){if(options.signal?.aborted)throw error;attempts.push({stage:'media',result:'timeout'});break;}
        attempts.push({stage:'media',quality:String(audio.id),result:result.ok?'ready':result.reason,status:result.status});
        if(result.ok)return {url,backups:urls.filter(u=>u!==url),referer,label:`${String(audio.codecs||'').startsWith('mp4a')?'AAC':'音频'} · ${Math.round(audio.bandwidth/1000)}kbps`,candidateId:id,quality:String(audio.id),attempts};
      }
    }
    const error=new Error('哔哩哔哩音频暂不可用，已尝试备用地址和兼容音质');error.attempts=attempts;throw error;
  }
  async function biliFolders(cookie='') {
    const account=checkBili(await request('https://api.bilibili.com/x/web-interface/nav',cookie,'https://www.bilibili.com/'));
    if (!account.isLogin) throw new Error('请先登录哔哩哔哩账号');
    const d=checkBili(await request(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${account.mid}`,cookie,'https://www.bilibili.com/'));
    return (d.list||[]).map(x=>({id:String(x.id),title:decode(x.title),count:x.media_count}));
  }
  async function biliFolder(id,page=1,cookie='') {
    if (!/^\d+$/.test(id)) throw new Error('收藏夹 ID 无效');
    const d=checkBili(await request(`https://api.bilibili.com/x/v3/fav/resource/list?media_id=${id}&pn=${page}&ps=20&order=mtime&platform=web`,cookie,'https://www.bilibili.com/'));
    return {tracks:(d.medias||[]).filter(x=>x.bvid&&!(x.attr&1)).map(x=>({id:`bili:${x.bvid}:${x.cid||0}`,source:'bili',bvid:x.bvid,cid:x.cid||0,title:decode(x.title),artist:decode(x.upper?.name),album:'哔哩哔哩',duration:x.duration,cover:(x.cover||'').replace(/^http:/,'https:')})),hasMore:Boolean(d.has_more)};
  }
  return {qqSearch,qqStream,qqLyrics,qqPlaylist,qqLibrary,qqCloudPlaylist,biliVideo,biliStream,biliFolders,biliFolder};
}
module.exports={createServices,parseLrc,qqTrack,jsonText,qqAccountId,decodeLyric,UA};
