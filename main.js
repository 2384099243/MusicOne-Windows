'use strict';
const {app,BrowserWindow,ipcMain,dialog,protocol,net,session,safeStorage,shell,nativeImage,nativeTheme} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {createServices,parseLrc,qqAccountId,UA} = require('./services');
const {localMediaResponse}=require('./media');
const {createJournal}=require('./diagnostics');
const {paletteFromPixels}=require('./palette');
const {createAppearanceController}=require('./appearance');
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData',path.join(process.env.MUSICONE_QA_DIR || app.getPath('temp'),'MusicOne-QA'));
app.setName('MusicOne Windows');
protocol.registerSchemesAsPrivileged([{scheme:'musicone',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const AUDIO = new Set(['.mp3','.flac','.wav','.m4a','.aac','.ogg','.opus','.webm','.mp4']);
const media = new Map();
const localFiles = new Map();
const artworkCache=new Map();
let win, state, stateFile, saveChain=Promise.resolve(),streamAbort,journal,appearance,lyricsWindowState=null;
const emptyState = () => ({version:1,library:[],favorites:[],playlists:[],cookies:{},volume:0.8,quality:'standard',theme:'system'});
const services = createServices((url,options)=>net.fetch(url,options));
function publicState() { const {cookies,...rest}=state;return {...rest,appearance:appearance.snapshot(),accounts:{qq:Boolean(cookies.qq),bili:Boolean(cookies.bili)}}; }
function persist() {
  const snapshot=JSON.stringify(state,null,2);
  saveChain=saveChain.catch(()=>{}).then(async()=>{
    const temporary = stateFile+'.tmp';
    await fs.writeFile(temporary,snapshot,'utf8');
    await fs.rename(temporary,stateFile);
  });
  return saveChain;
}
function getCookie(source) {
  if (!state.cookies[source]) return '';
  try {return safeStorage.decryptString(Buffer.from(state.cookies[source],'base64'));} catch {return '';}
}
async function setCookie(source,value) {
  if (!['qq','bili'].includes(source)) throw new Error('未知音源');
  if (/[\r\n]/.test(value) || value.length>64000) throw new Error('Cookie 格式无效');
  if (value && !safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全保存登录凭证');
  if (value) state.cookies[source]=safeStorage.encryptString(value).toString('base64');
  else delete state.cookies[source];
  await persist();return publicState();
}
function registerFile(file) {
  const absolute=path.resolve(file);
  const id='local:'+crypto.createHash('sha256').update(absolute.toLowerCase()).digest('hex').slice(0,24);
  localFiles.set(id,absolute);
  const title=path.basename(absolute,path.extname(absolute));
  const parts=title.split(' - ');
  return {id,source:'local',title:parts.length>1?parts.slice(1).join(' - '):title,artist:parts.length>1?parts[0]:'本地音乐',album:path.basename(path.dirname(absolute)),duration:0,cover:'',filePath:absolute};
}
async function importPaths(paths) {
  const tracks=[];let count=0;
  async function visit(file,depth=0) {
    if (count>=20000 || depth>25) return;
    try {
      const stat=await fs.lstat(file);
      if (stat.isSymbolicLink()) return;
      if(stat.isDirectory()) {for (const entry of await fs.readdir(file)) await visit(path.join(file,entry),depth+1);}
      else if(AUDIO.has(path.extname(file).toLowerCase())) {tracks.push(registerFile(file));count++;}
    } catch { /* inaccessible files do not stop the rest of the selected folder */ }
  }
  for(const file of paths) await visit(file);
  const existing=new Map(state.library.map(t=>[t.id,t]));
  tracks.forEach(t=>existing.set(t.id,t));state.library=[...existing.values()];await persist();
  return {state:publicState(),added:tracks.length};
}
function guard(handler) { return async(event,...args)=>{
  if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame) return {ok:false,error:'无效调用'};
  try{return {ok:true,value:await handler(...args)};}catch(e){return {ok:false,error:e.message||'操作失败'};}
};}
function setupIpc() {
  ipcMain.on('appearance-initial',event=>{event.returnValue=event.sender===win.webContents?appearance.snapshot():null;});
  const handlers={
    'state':()=>publicState(),
    'appearance':async preference=>{const value=appearance.set(preference);state.theme=value.preference;await persist();return value;},
    'lyrics-mode':async enter=>{
      const beforeBounds=win.getContentBounds();let target;
      if(enter===true){if(!lyricsWindowState)lyricsWindowState={wasFullScreen:win.isFullScreen()};target=true;}
      else{target=lyricsWindowState?.wasFullScreen||false;lyricsWindowState=null;}
      if(win.isFullScreen()!==target){
        await new Promise(resolve=>{
          const event=target?'enter-full-screen':'leave-full-screen';let timer;
          const finish=()=>{clearTimeout(timer);win.removeListener(event,finish);resolve();};
          win.once(event,finish);timer=setTimeout(finish,1400);win.setFullScreen(target);
        });
      }
      return {beforeBounds,afterBounds:win.getContentBounds(),isFullScreen:win.isFullScreen()};
    },
    'import':async(kind)=>{const result=await dialog.showOpenDialog(win,{title:kind==='folder'?'选择音乐文件夹':'选择音乐文件',properties:kind==='folder'?['openDirectory']:['openFile','multiSelections'],filters:[{name:'音乐',extensions:[...AUDIO].map(x=>x.slice(1))}]});return result.canceled?null:importPaths(result.filePaths);},
    'search':async(query,page)=>services.qqSearch(String(query).slice(0,200),getCookie('qq'),Math.max(1,Math.min(100,Number(page)||1))),
    'qq-playlist':input=>services.qqPlaylist(String(input),getCookie('qq')),
    'qq-library':()=>services.qqLibrary(getCookie('qq')),
    'qq-cloud-playlist':(playlist,offset)=>services.qqCloudPlaylist(playlist,offset,getCookie('qq')),
    'bili-video':input=>services.biliVideo(String(input),getCookie('bili')),
    'bili-folders':()=>services.biliFolders(getCookie('bili')),
    'bili-folder':(id,page)=>services.biliFolder(String(id),Number(page)||1,getCookie('bili')),
    'stream':async(track,quality,options={})=>{
      streamAbort?.abort();const controller=new AbortController();streamAbort=controller;
      const fingerprint=crypto.createHash('sha256').update(String(track.id)).digest('hex').slice(0,10);
      const record=event=>journal.record({source:track.source,track:fingerprint,requestedQuality:quality,...event});
      record({stage:'start',result:'resolving',recovery:options.recovery||0});
      let entry;
      try{
      if(track.source==='local') {
        const file=localFiles.get(track.id);
        if(!file) throw new Error('本地音乐记录不存在，请重新导入');
        await fs.access(file);entry={file,label:path.extname(file).slice(1).toUpperCase()};
      } else if(track.source==='qq') entry={...await services.qqStream(track,getCookie('qq'),quality,{...options,verify:true,signal:controller.signal}),source:'qq'};
      else if(track.source==='bili') {
        if(!track.cid) {const tracks=await services.biliVideo(track.bvid,getCookie('bili'));track={...track,cid:tracks[0]?.cid};}
        entry={...await services.biliStream(track,getCookie('bili'),{...options,verify:true,signal:controller.signal}),source:'bili'};
      } else throw new Error('不支持的音源');
      if(controller.signal.aborted)throw new Error('播放请求已取消');
      for(const attempt of entry.attempts||[])record(attempt);
      const token=crypto.randomUUID();media.set(token,entry);
      while(media.size>12) media.delete(media.keys().next().value);
      return {url:`musicone://media/${token}`,label:entry.label,trial:entry.trial||false,candidateId:entry.candidateId,quality:entry.quality,requestedQuality:quality,downgraded:entry.downgraded||false,metadata:entry.metadata};
      }catch(error){for(const attempt of error.attempts||[])record(attempt);record({stage:'finish',result:controller.signal.aborted?'cancelled':'failed'});throw error;}
    },
    'cancel-stream':()=>streamAbort?.abort(),
    'playback-report':event=>journal.record({source:String(event.source||''),stage:'player',result:String(event.result||'').slice(0,60),code:Number(event.code)||0,recovery:Number(event.recovery)||0}),
    'diagnostics':()=>journal.read(),
    'diagnostics-export':async()=>{const result=await dialog.showSaveDialog(win,{title:'保存播放诊断',defaultPath:'MusicOne-播放诊断.json',filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return false;await fs.writeFile(result.filePath,JSON.stringify(journal.read(),null,2),'utf8');return true;},
    'artwork':async track=>{
      const key=track.source==='local'?track.id:String(track.cover||'');if(artworkCache.has(key))return artworkCache.get(key);
      let bytes;
      if(track.source==='local'){
        const file=localFiles.get(track.id);if(!file)return null;
        const folder=path.dirname(file),stem=file.slice(0,-path.extname(file).length);
        for(const candidate of [stem+'.jpg',stem+'.png',path.join(folder,'cover.jpg'),path.join(folder,'cover.png'),path.join(folder,'folder.jpg')]){try{if((await fs.stat(candidate)).size<=5*1024*1024){bytes=await fs.readFile(candidate);break;}}catch{}}
      }else{
        let url;try{url=new URL(track.cover);}catch{return null;}
        const allowed=['qq.com','gtimg.cn','qpic.cn','hdslb.com','biliimg.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
        if(url.protocol!=='https:'||!allowed)return null;
        const response=await net.fetch(url.href,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)return null;
        const reader=response.body.getReader(),chunks=[];let length=0;
        try{while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>5*1024*1024)return null;chunks.push(Buffer.from(chunk.value));}}finally{await reader.cancel().catch(()=>{});}
        bytes=Buffer.concat(chunks);
      }
      if(!bytes)return null;const picture=nativeImage.createFromBuffer(bytes);if(picture.isEmpty())return null;
      const palette=paletteFromPixels(picture.resize({width:40,height:40}).toBitmap());
      const result={...palette,image:picture.resize({width:600}).toDataURL()};artworkCache.set(key,result);if(artworkCache.size>80)artworkCache.delete(artworkCache.keys().next().value);return result;
    },
    'lyrics':async track=>{
      if(track.source==='qq') return services.qqLyrics(track,getCookie('qq'));
      if(track.source==='local') {const file=localFiles.get(track.id);if(!file)return [];try{return parseLrc(await fs.readFile(file.slice(0,-path.extname(file).length)+'.lrc','utf8'));}catch{return [];}}
      return [];
    },
    'import-lyrics':async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'LRC 歌词',extensions:['lrc']}]});return r.canceled?null:parseLrc(await fs.readFile(r.filePaths[0],'utf8'));},
    'favorite':async track=>{const i=state.favorites.findIndex(x=>x.id===track.id);if(i>=0)state.favorites.splice(i,1);else state.favorites.push(cleanTrack(track));await persist();return publicState();},
    'playlist-create':async name=>{const title=String(name).trim().slice(0,80);if(!title)throw new Error('请输入歌单名称');state.playlists.push({id:crypto.randomUUID(),title,tracks:[]});await persist();return publicState();},
    'playlist-import':async(title,tracks)=>{if(!Array.isArray(tracks)||tracks.length>20000)throw new Error('歌单数据无效');state.playlists.push({id:crypto.randomUUID(),title:String(title).trim().slice(0,80)||'导入歌单',tracks:[...new Map(tracks.map(t=>[t.id,cleanTrack(t)])).values()]});await persist();return publicState();},
    'playlist-add':async(id,track)=>{const p=state.playlists.find(x=>x.id===id);if(!p)throw new Error('歌单不存在');if(!p.tracks.some(x=>x.id===track.id))p.tracks.push(cleanTrack(track));await persist();return publicState();},
    'playlist-remove-track':async(id,trackId)=>{const p=state.playlists.find(x=>x.id===id);if(p)p.tracks=p.tracks.filter(x=>x.id!==trackId);await persist();return publicState();},
    'playlist-delete':async id=>{state.playlists=state.playlists.filter(x=>x.id!==id);await persist();return publicState();},
    'remove-local':async id=>{state.library=state.library.filter(x=>x.id!==id);state.favorites=state.favorites.filter(x=>x.id!==id);for(const p of state.playlists)p.tracks=p.tracks.filter(x=>x.id!==id);localFiles.delete(id);await persist();return publicState();},
    'preferences':async value=>{state.volume=Math.max(0,Math.min(1,Number(value.volume)||0));state.quality=['standard','high','lossless'].includes(value.quality)?value.quality:'standard';await persist();return publicState();},
    'cookie':setCookie,
    'logout':async source=>{await session.fromPartition('persist:'+source).clearStorageData();return setCookie(source,'');},
    'login':source=>openLogin(source),
    'platform':(source,track)=>openPlatform(source,track),
    'open-source':()=>shell.openExternal('https://github.com/HGODLK/MusicOne'),
    'window':action=>{if(action==='minimize')win.minimize();else if(action==='maximize'){if(win.isMaximized())win.unmaximize();else win.maximize();}else if(action==='close')win.close();}
  };
  for(const [name,handler] of Object.entries(handlers)) ipcMain.handle(name,guard(handler));
}
async function openPlatform(source,track) {
  if(!['qq','bili'].includes(source))throw new Error('未知音源');
  let url=source==='qq'?'https://y.qq.com/':'https://www.bilibili.com/';
  if(source==='qq'&&/^[a-zA-Z0-9]+$/.test(track?.mid||''))url=`https://y.qq.com/n/ryqq/songDetail/${track.mid}`;
  if(source==='bili'&&/^BV[a-zA-Z0-9]{10}$/.test(track?.bvid||''))url=`https://www.bilibili.com/video/${track.bvid}`;
  const platform=new BrowserWindow({parent:win,width:1150,height:800,title:source==='qq'?'QQ 音乐 · 平台页面':'哔哩哔哩 · 平台页面',autoHideMenuBar:true,webPreferences:{partition:'persist:'+source,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const allowed=hostname=>source==='qq'?(hostname==='qq.com'||hostname.endsWith('.qq.com')):(hostname==='bilibili.com'||hostname.endsWith('.bilibili.com'));
  platform.webContents.on('will-navigate',(event,target)=>{try{if(!allowed(new URL(target).hostname))event.preventDefault();}catch{event.preventDefault();}});
  platform.webContents.setWindowOpenHandler(({url:target})=>{try{if(allowed(new URL(target).hostname))platform.loadURL(target);}catch{}return {action:'deny'};});
  await platform.loadURL(url);return true;
}
function cleanTrack(t) {
  const fields=['id','source','mid','mediaMid','providerType','catalogId','bvid','cid','title','artist','album','duration','cover','vip'];
  return Object.fromEntries(fields.filter(k=>t[k]!==undefined).map(k=>[k,t[k]]));
}
async function openLogin(source) {
  if(!['qq','bili'].includes(source))throw new Error('未知音源');
  const ses=session.fromPartition('persist:'+source);
  const login=new BrowserWindow({parent:win,width:1000,height:760,title:source==='qq'?'登录 QQ 音乐':'登录哔哩哔哩',autoHideMenuBar:true,webPreferences:{partition:'persist:'+source,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const allowed=hostname=>source==='qq'?(hostname==='qq.com'||hostname.endsWith('.qq.com')||hostname==='weixin.qq.com'):(hostname==='bilibili.com'||hostname.endsWith('.bilibili.com'));
  login.webContents.on('will-navigate',(event,url)=>{try{if(!allowed(new URL(url).hostname))event.preventDefault();}catch{event.preventDefault();}});
  login.webContents.setWindowOpenHandler(({url})=>{try{if(allowed(new URL(url).hostname))login.loadURL(url);}catch{}return {action:'deny'};});
  let captureTimer;
  function credentialSignature(value){
    const values=Object.fromEntries(value.split(';').map(p=>p.trim()).filter(p=>p.includes('=')).map(p=>[p.slice(0,p.indexOf('=')),p.slice(p.indexOf('=')+1)]));
    return source==='qq'?qqAccountId(value)+'|'+['qqmusic_key','qm_keyst','musickey','authst'].map(k=>values[k]||'').join('|'):(values.SESSDATA||'');
  }
  let lastSignature=credentialSignature(getCookie(source));
  async function capture() {
    const relevant=await ses.cookies.get({url:source==='qq'?'https://y.qq.com/':'https://api.bilibili.com/'});
    const has=source==='qq'?relevant.some(c=>['qqmusic_key','qm_keyst','musickey','authst'].includes(c.name)&&c.value):relevant.some(c=>c.name==='SESSDATA'&&c.value);
    const value=relevant.map(c=>`${c.name}=${c.value}`).join('; ');
    const signature=credentialSignature(value);
    if(has&&signature!==lastSignature&&(source!=='qq'||qqAccountId(value))) {await setCookie(source,value);lastSignature=signature;if(!win.isDestroyed())win.webContents.send('accounts-changed',{...publicState(),changedSource:source});}
  }
  const changed=()=>{clearTimeout(captureTimer);captureTimer=setTimeout(()=>capture().catch(()=>{}),1000);};
  ses.cookies.on('changed',changed);
  login.on('closed',()=>{clearTimeout(captureTimer);capture().catch(()=>{}).finally(()=>ses.cookies.removeListener('changed',changed));});
  login.loadURL(source==='qq'?'https://y.qq.com/':'https://passport.bilibili.com/login');
  return true;
}
async function ready() {
  await fs.mkdir(app.getPath('userData'),{recursive:true});stateFile=path.join(app.getPath('userData'),'musicone-state.json');
  journal=createJournal(app.getPath('userData'));
  try{state={...emptyState(),...JSON.parse(await fs.readFile(stateFile,'utf8'))};}catch{state=emptyState();}
  appearance=createAppearanceController(nativeTheme,state.theme,value=>{
    if(win&&!win.isDestroyed()){win.setBackgroundColor(value.resolved==='dark'?'#212121':'#f6f8fa');win.webContents.send('appearance-changed',value);}
  });
  state.theme=appearance.snapshot().preference;
  for(const t of state.library) if(t.filePath)localFiles.set(t.id,t.filePath);
  protocol.handle('musicone',async request=>{
    const url=new URL(request.url);const entry=media.get(url.pathname.slice(1));
    if(url.hostname!=='media'||!entry)return new Response('Not found',{status:404});
    try {
      const headers={};if(request.headers.get('range'))headers.Range=request.headers.get('range');
      if(entry.file)return localMediaResponse(entry.file,request);
      headers['User-Agent']=UA;headers.Referer=entry.referer;
      // Playback credentials are used only for API tickets, never sent to media CDN hosts.
      let response;
      for(const target of [entry.url,...(entry.backups||[])].slice(0,4)) {
        try{response=await net.fetch(target,{headers,signal:request.signal});if(response.ok)return response;await response.body?.cancel();}catch(e){if(request.signal.aborted)throw e;}
      }
      return new Response('Platform media unavailable',{status:502});
    }catch{return new Response('Media unavailable',{status:502});}
  });
  win=new BrowserWindow({width:1280,height:840,minWidth:960,minHeight:650,show:!smoke,frame:false,backgroundColor:appearance.snapshot().resolved==='dark'?'#212121':'#f6f8fa',icon:path.join(__dirname,'assets','icon.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.on('leave-full-screen',()=>{if(lyricsWindowState){lyricsWindowState=null;win.webContents.send('lyrics-window-exit');}});
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('before-input-event',(event,input)=>{if(input.key==='F12'&&process.argv.includes('--dev'))win.webContents.toggleDevTools();});
  setupIpc();
  await win.loadFile(path.join(__dirname,'index.html'));
  if(smoke)await runSmoke();
}
async function runSmoke() {
  const qa=process.env.MUSICONE_QA_DIR||app.getPath('temp');
  try {
    const fixture=process.env.MUSICONE_QA_AUDIO;
    if(fixture)await importPaths([fixture]);
    const fixtureState=publicState();
    await win.webContents.executeJavaScript(`window.__qaState = ${JSON.stringify(fixtureState)};`);
    const result=await win.webContents.executeJavaScript(`(async()=>{
      await window.musiconeApp.reload();
      const checks={title:document.title,buttons:document.querySelectorAll('button').length};
      await window.musiconeApp.navigate('library');
      checks.localRows=document.querySelectorAll('.track-row').length;
      if(window.__qaState.library.length){
        await window.musiconeApp.playTracks(window.__qaState.library,0);
        await new Promise(r=>setTimeout(r,1200));
        const audio=document.querySelector('audio');checks.playing=!audio.paused;checks.duration=audio.duration;checks.time=audio.currentTime;
        audio.pause();audio.currentTime=3;await new Promise(r=>setTimeout(r,300));checks.seek=audio.currentTime;
        const track=window.__qaState.library[0];
        const lyrics=await window.musicone.lyrics(track);checks.lyrics=lyrics.length;
        const artwork=await window.musicone.artwork(track);checks.artwork=Boolean(artwork?.image);checks.palette=artwork?.primary||null;
        let state=await window.musicone.state();if(!state.favorites.some(t=>t.id===track.id))await window.musicone.favorite(track);state=await window.musicone.state();checks.favorite=state.favorites.some(t=>t.id===track.id);
        await window.musicone.createPlaylist('测试歌单');state=await window.musicone.state();let p=state.playlists.find(p=>p.title==='测试歌单');
        await window.musicone.addToPlaylist(p.id,track);state=await window.musicone.state();checks.playlist=state.playlists.find(x=>x.id===p.id).tracks.length===1;
      }
      return checks;
    })()`);
    await fs.writeFile(path.join(qa,'smoke-result.json'),JSON.stringify(result,null,2));
    await fs.writeFile(path.join(qa,'library.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("window.musiconeApp.navigate('home')");
    await fs.writeFile(path.join(qa,'home.png'),(await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify(result));
  }catch(e){await fs.writeFile(path.join(qa,'smoke-error.txt'),e.stack);process.exitCode=1;}
  app.quit();
}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.whenReady().then(ready).catch(error=>{console.error(error);app.quit();});
}
app.on('window-all-closed',()=>app.quit());
