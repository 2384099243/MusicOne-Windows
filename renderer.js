'use strict';
const api=window.musicone;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',online:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',library:'M4 5v14M9 5v14M14 5v14m4-14 3 14',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',list:'M4 6h12M4 11h12M4 16h8m7-5v9m0-9 3-1m-3 10c-3 2-5-1-2-2l2-.3',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 3-1 4-5 2-3-2-4-1-2-5 2-3 1-4z',search:'m16 16 5 5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',play:'m8 5 11 7-11 7z',pause:'M8 5v14M16 5v14',prev:'M5 5v14m14-14L8 12l11 7z',next:'M19 5v14M5 5l11 7-11 7z',repeat:'M18 3l3 3-3 3M3 11V8a2 2 0 0 1 2-2h16M6 21l-3-3 3-3m15-2v3a2 2 0 0 1-2 2H3',shuffle:'M3 5h3l12 14h3m-3-3 3 3-3 3M3 19h3l4-5m4-4 4-5h3m-3-3 3 3-3 3',volume:'m11 4-6 5H2v6h3l6 5zM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14',plus:'M12 5v14M5 12h14',folder:'M3 7V5h6l2 2h10v13H3z',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]||icons.list}"></path></svg>`;
icons.volumeOff='m11 4-6 5H2v6h3l6 5zM16 9l6 6m0-6-6 6';
const duration=n=>{n=Number(n);return Number.isFinite(n)&&n>0?`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`:'0:00';};
const sourceLabel=t=>({qq:'QQ',bili:'B站',local:'本地'}[t.source]||'');
const safeCover=url=>{try{const u=new URL(url);return u.protocol==='https:'?esc(url):'';}catch{return '';}};
const cover=(track,cls='track-cover')=>safeCover(track.cover)?`<img class="${cls}" src="${safeCover(track.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="${cls} cover-placeholder">♪</div>`;
let state,view='home',onlineTab='qq',displayTracks=[],queue=[],queueIndex=-1,current=null,lyrics=[],activeLyric=-1,mode=0,playGeneration=0,searchGeneration=0,page=1,searchQuery='',toastTimer,saveTimer;
let playbackLabel='—',lyricStatus='',qqLibraryCache=null,cloudCollection=null,playbackResult=null;
const audio=$('audio');
const lyricMotion=new window.LyricMotion($('lyric-lines'),audio,()=>lyrics,()=>!$('immersive').hidden);
const volumeMenu=new window.VolumeMenu(audio,muted=>icon(muted?'volumeOff':'volume'));
const lyricsLayout=new window.LyricsLayout({container:$('immersive'),smallCover:$('now-cover'),largeCover:$('large-cover'),footer:document.querySelector('.player'),titlebar:document.querySelector('.titlebar'),workspace:document.querySelector('.workspace'),controls:$('immersive-controls'),moreControls:$('immersive-extras'),favoriteSlot:$('immersive-favorite'),lyrics:$('lyric-lines'),requestFullscreen:enter=>api.lyricsMode?.(enter),onTransition:()=>volumeMenu.close(false),onError:()=>toast('暂时无法切换系统全屏，已在窗口内展开歌词'),onChange:opened=>{volumeMenu.close(false);if(opened){lyricMotion.resume();updateTimeline();}}});
let artworkGeneration=0;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
const fail=e=>toast(e.message||String(e));
function run(fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(fail);}
function bind(id,fn){const element=$(id);if(element)element.addEventListener('click',run(fn));}
function liked(t){return state.favorites.some(x=>x.id===t.id);}
function drawNavigation(){
  const labels={home:['home','首页'],'qq-library':['online','我的 QQ 音乐'],online:['online','在线音源'],library:['library','本地音乐'],favorites:['heart','本机收藏'],settings:['settings','设置']};
  document.querySelectorAll('[data-nav]').forEach(b=>{const key=b.dataset.nav;b.innerHTML=icon(labels[key][0])+`<span>${labels[key][1]}</span>`;b.classList.toggle('active',view===key||(key==='qq-library'&&view.startsWith('qq-cloud:')));});
  $('playlist-nav').innerHTML=state.playlists.map(p=>`<button class="playlist-nav-item ${view===`playlist:${p.id}`?'active':''}" data-playlist="${esc(p.id)}">${icon('list')}<span>${esc(p.title)}</span></button>`).join('');
  $('playlist-nav').querySelectorAll('button').forEach(b=>b.onclick=()=>navigate('playlist:'+b.dataset.playlist));
  const created=state.accounts.qq?qqLibraryCache?.created||[]:[];
  if(created.length){
    let group=document.createElement('div');group.className='sidebar-playlist-source';group.textContent='QQ 音乐';$('playlist-nav').prepend(group);
    for(const p of created){
      const button=document.createElement('button');button.className='playlist-nav-item qq-sidebar-playlist';button.classList.toggle('active',view==='qq-cloud:'+p.id);button.dataset.qqSidebar=p.id;button.title=p.title+' · QQ 音乐';button.setAttribute('aria-label',p.title+'，QQ 音乐歌单');button.innerHTML=icon('list')+`<span>${esc(p.title)}</span>`;
      button.onclick=run(()=>loadCloudPlaylist(p));group.after(button);group=button;
    }
    if(state.playlists.length){const label=document.createElement('div');label.className='sidebar-playlist-source';label.textContent='本机歌单';group.after(label);}
  }
}
function heading(title,subtitle,actions=''){return `<div class="page-heading"><div><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div><div class="heading-actions">${actions}</div></div>`;}
const importButtons=()=>'<button class="secondary" id="import-folder">导入文件夹</button><button class="primary" id="import-files">＋ 添加音乐</button>';
function bindImport(){bind('import-files',()=>importMusic('files'));bind('import-folder',()=>importMusic('folder'));}
function drawHome(){
  const first=state.library.slice(0,5);
  $('content').innerHTML=heading('音乐，让此刻慢下来','你的音乐、你的收藏，在同一个地方。')+
    `<div class="hero-grid"><button id="hero-local" class="hero local"><span class="eyebrow">YOUR PRIVATE COLLECTION</span><h2>把喜欢的，留在身边</h2><p>${state.library.length} 首本地音乐 · 随时聆听</p></button><button id="hero-favorites" class="hero favorites"><span class="eyebrow">MADE OF YOUR FAVORITES</span><h2>我喜欢</h2><p>${state.favorites.length} 首收藏 · 每一首都有意义</p></button></div>`+
    '<div class="section-heading"><h2>探索在线音源</h2><span>由平台直接提供音乐服务</span></div><div class="source-grid"><button class="source-card" id="home-qq"><div class="source-badge">♪</div><div><h3>QQ 音乐</h3><p>搜索歌曲 · 导入歌单 · 在线播放</p></div><span class="arrow">↗</span></button><button class="source-card" id="home-bili"><div class="source-badge bili">▣</div><div><h3>哔哩哔哩</h3><p>BV 音频 · 多分 P · 账号收藏夹</p></div><span class="arrow">↗</span></button></div>'+
    `<div class="section-heading"><h2>我的音乐库</h2><button id="view-library">全部音乐 →</button></div><div id="home-tracks"></div><p class="footnote">MusicOne Windows · 基于开源 MusicOne 独立适配的开源桌面版，非原作者官方 Windows 发行版。</p>`;
  bind('hero-local',()=>navigate('library'));bind('hero-favorites',()=>state.accounts.qq?openQqFavorites():navigate('favorites'));bind('view-library',()=>navigate('library'));
  if(state.accounts.qq){$('hero-favorites').querySelector('p').textContent='QQ 音乐云端收藏 · 点开直接听';}
  bind('home-qq',()=>{onlineTab='qq';navigate('online');});bind('home-bili',()=>{onlineTab='bili';navigate('online');});
  if(first.length)renderTracks(first,'home-tracks');else {$('home-tracks').innerHTML='<div class="welcome"><div class="empty-symbol">♫</div><h3>你的音乐库，等你来填满</h3><p>添加电脑上的音乐文件，支持 MP3、FLAC、WAV 等常见格式。<br>同名 LRC 歌词会在播放时自动读取。</p>'+importButtons()+'</div>';bindImport();}
}
function drawCollection(){
  const playlist=view.startsWith('playlist:')?state.playlists.find(p=>p.id===view.slice(9)):null;
  const tracks=playlist?playlist.tracks:view==='favorites'?state.favorites:state.library;
  const title=playlist?playlist.title:view==='favorites'?'本机收藏':'本地音乐';
  $('content').innerHTML=heading(title,`${tracks.length} 首音乐${view==='favorites'?' · 收藏保存在这台电脑':''}`,view==='library'?importButtons():playlist?'<button class="ghost" id="delete-playlist">删除歌单</button>':'')+
    (tracks.length?'<div class="heading-actions"><button class="primary" id="play-all">▶ 播放全部</button></div><div class="section-heading"></div>':'')+'<div id="collection-tracks"></div>';
  if(tracks.length)renderTracks(tracks,'collection-tracks');else $('collection-tracks').innerHTML=`<div class="welcome"><div class="empty-symbol">${view==='favorites'?'♡':'♫'}</div><h3>${view==='library'?'添加第一首音乐':'这里还没有歌曲'}</h3><p>${view==='library'?'从电脑选择音乐文件或文件夹，即可开始。':'点击歌曲旁的爱心收藏，或通过加号加入歌单。'}</p></div>`;
  bindImport();bind('play-all',()=>playTracks(tracks,0));
  if(playlist)bind('delete-playlist',()=>openDialog('删除歌单',`<p>删除「${esc(playlist.title)}」？音乐文件会保留在电脑上。</p>`,async()=>{state=await api.deletePlaylist(playlist.id);navigate('home');},'删除'));
}
function renderTracks(tracks,target,append=false){
  displayTracks=tracks.slice();
  const html='<div class="track-header"><span>#</span><span>歌曲 / 歌手</span><span>专辑 / 来源</span><span>时长</span><span></span></div>'+tracks.map((t,i)=>
    `<div class="track-row ${current?.id===t.id?'current':''}" data-track-id="${esc(t.id)}"><span class="row-index">${current?.id===t.id?'♫':String(i+1).padStart(2,'0')}</span><div class="track-title-cell" data-play="${i}" tabindex="0" role="button" aria-label="播放 ${esc(t.title)}">${cover(t)}<div class="track-text"><div class="track-title">${esc(t.title)}<span class="badge">${sourceLabel(t)}</span>${t.vip?'<span class="badge vip">VIP</span>':''}</div><div class="track-artist">${esc(t.artist)}</div></div></div><div class="track-album">${esc(t.album||sourceLabel(t))}</div><div class="track-duration">${t.duration?duration(t.duration):'—'}</div><div class="track-actions"><button class="icon-btn ${liked(t)?'liked':''}" data-favorite="${i}" title="${liked(t)?'取消收藏':'收藏'}">${icon('heart')}</button><button class="icon-btn" data-add="${i}" title="添加到歌单">${icon('plus')}</button>${view.startsWith('playlist:')||view==='library'?`<button class="icon-btn" data-remove="${i}" title="移出列表">${icon('trash')}</button>`:t.source!=='local'?`<button class="icon-btn" data-platform="${i}" title="在平台页面播放">↗</button>`:''}</div></div>`).join('');
  const el=$(target);el.innerHTML=html;
  el.querySelectorAll('[data-play]').forEach(b=>{b.onclick=run(()=>playTracks(tracks,+b.dataset.play));b.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();b.click();}};});
  el.querySelectorAll('[data-favorite]').forEach(b=>b.onclick=run(async()=>{state=await api.favorite(tracks[+b.dataset.favorite]);refreshFavorites();}));
  el.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addDialog(tracks[+b.dataset.add]));
  el.querySelectorAll('[data-platform]').forEach(b=>b.onclick=run(()=>{audio.pause();const t=tracks[+b.dataset.platform];return api.platform(t.source,t);}));
  el.querySelectorAll('[data-remove]').forEach(b=>b.onclick=run(async()=>{
    const track=tracks[+b.dataset.remove];
    if(view==='library')state=await api.removeLocal(track.id);else state=await api.removeFromPlaylist(view.slice(9),track.id);
    drawCollection();drawNavigation();
  }));
}
function refreshFavorites(){
  $('now-favorite').classList.toggle('liked',current&&liked(current));
  if(view==='favorites')drawCollection();else if(view==='home')drawHome();else {
    document.querySelectorAll('.track-row').forEach(row=>{const b=row.querySelector('[data-favorite]');if(b)b.classList.toggle('liked',state.favorites.some(t=>t.id===row.dataset.trackId));});
  }
}
async function importMusic(kind){const result=await api.importMusic(kind);if(!result)return;state=result.state;navigate('library');toast(`已读取 ${result.added} 首音乐，重复文件会自动合并`);}
function onlineHeader(){return heading('在线音源','连接喜欢的平台，延续你的聆听习惯。')+`<div class="online-tabs"><button class="tab ${onlineTab==='qq'?'active':''}" id="tab-qq">QQ 音乐</button><button class="tab ${onlineTab==='bili'?'active':''}" id="tab-bili">哔哩哔哩</button></div>`;}
function drawOnline(){
  const connected=state.accounts[onlineTab];
  $('content').innerHTML=onlineHeader()+ (onlineTab==='qq'?
    `<div class="online-intro"><h2>QQ 音乐<span class="account-state ${connected?'connected':''}">${connected?'已保存登录凭证':'未登录'}</span></h2><p class="subtitle">用上方搜索框查找歌曲，或导入你收藏的歌单。</p><div class="heading-actions section-heading"><button class="primary" id="online-login">${connected?'更新登录':'登录 QQ 音乐'}</button><button class="secondary" id="qq-import">导入 QQ 歌单</button></div><div class="notice">播放与音质遵循账号权限。会员和受版权限制的歌曲需要对应权益；平台风控也可能要求重新登录。</div></div>`:
    `<div class="online-intro"><h2>哔哩哔哩<span class="account-state ${connected?'connected':''}">${connected?'已保存登录凭证':'未登录'}</span></h2><p class="subtitle">粘贴 BV 号或完整视频链接，收听视频中的音频。</p><form id="bili-form" class="inline-form"><input type="text" id="bili-input" placeholder="BV 号或 https://www.bilibili.com/video/BV…" aria-label="视频链接"><button class="primary" type="submit">读取音频</button></form><div class="heading-actions section-heading"><button class="secondary" id="online-login">${connected?'更新登录':'登录哔哩哔哩'}</button><button class="secondary" id="bili-favorites">读取账号收藏夹</button></div></div>`)+ '<div id="online-results"></div>';
  bind('tab-qq',()=>{onlineTab='qq';drawOnline();});bind('tab-bili',()=>{onlineTab='bili';drawOnline();});
  bind('online-login',()=>login(onlineTab));bind('qq-import',qqImportDialog);
  const platformButton=document.createElement('button');platformButton.className='ghost';platformButton.textContent='打开平台页面';platformButton.onclick=run(()=>{audio.pause();return api.platform(onlineTab);});$('online-login').parentElement.append(platformButton);
  if(onlineTab==='qq'){
    const libraryButton=document.createElement('button');libraryButton.className='primary';libraryButton.textContent='我的 QQ 音乐';libraryButton.onclick=()=>navigate('qq-library');$('online-login').parentElement.prepend(libraryButton);
    document.querySelector('.online-intro .subtitle').textContent='登录后，在“我的 QQ 音乐”直接查看我喜欢、自建和收藏歌单，无需逐个导入。';
  }
  const form=$('bili-form');if(form)form.onsubmit=e=>{e.preventDefault();const input=$('bili-input').value.trim();if(input)loadOnline(()=>api.biliVideo(input),'视频音频');};
  bind('bili-favorites',loadBiliFolders);
}
async function loadOnline(loader,title){
  const generation=++searchGeneration;$('online-results').innerHTML='<div class="loading">正在读取音源数据…</div>';
  try{const result=await loader();if(generation!==searchGeneration||view!=='online')return;const tracks=Array.isArray(result)?result:result.tracks;
    $('online-results').innerHTML=`<div class="section-heading"><h2>${esc(title||result.title)}</h2><span>${tracks.length} 首</span></div><div id="loaded-tracks"></div>`;
    if(tracks.length)renderTracks(tracks,'loaded-tracks');else $('loaded-tracks').innerHTML='<div class="empty-inline">没有可显示的歌曲</div>';
    if(result.partial)toast('平台仅返回了部分歌单曲目');
  }catch(e){if(generation===searchGeneration&&view==='online')$('online-results').innerHTML=`<div class="error-box">${esc(e.message)}<br>可在设置中更新账号登录后重试。</div>`;}
}
function qqImportDialog(){openDialog('导入 QQ 音乐歌单','<p>粘贴公开歌单的完整链接或数字 ID。短链接请先在浏览器展开。</p><input type="text" id="dialog-input" placeholder="https://y.qq.com/n/ryqq/playlist/…" required>',async()=>{
  const input=$('dialog-input').value.trim();const result=await api.qqPlaylist(input);state=await api.importPlaylist(result.title||'QQ 音乐歌单',result.tracks);navigate('playlist:'+state.playlists.at(-1).id);if(result.partial)toast('平台仅返回部分曲目，已导入本次返回的歌曲');
},'导入');}
function cloudCard(p){return `<button class="cloud-card" data-cloud="${esc(p.id)}"><div class="cloud-art ${p.kind==='favorites'?'cloud-heart':''}">${safeCover(p.cover)?`<img src="${safeCover(p.cover)}" alt="" referrerpolicy="no-referrer">`:p.kind==='favorites'?'♥':'♫'}</div><strong>${esc(p.title)}</strong><span>${p.count===null?'QQ 音乐云端收藏':`${p.count} 首音乐`}</span></button>`;}
let libraryFilter='',librarySort=localStorage.getItem('library-sort')||'original',libraryLayout=localStorage.getItem('library-layout')||'grid';
function librarySubset(values){
  const query=libraryFilter.trim().toLocaleLowerCase();const filtered=values.filter(p=>!query||p.title.toLocaleLowerCase().includes(query));
  if(librarySort==='title')filtered.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
  if(librarySort==='count')filtered.sort((a,b)=>(b.count||0)-(a.count||0));return filtered;
}
function renderLibraryGroups(){
  const data=qqLibraryCache;const favorite=librarySubset([data.favorites]);const created=librarySubset(data.created),collected=librarySubset(data.collected);const grid='cloud-grid '+(libraryLayout==='list'?'list-view':'');
  $('qq-library-groups').innerHTML=`<div class="section-heading"><h2>我的收藏</h2><span>与 QQ 音乐账号关联</span></div><div class="${grid}">${favorite.map(cloudCard).join('')||'<p class="subtitle">没有匹配的收藏</p>'}</div>`+
    `<div class="section-heading"><h2>我创建的歌单</h2><span>${created.length}${created.length!==data.created.length?' / '+data.created.length:''} 个歌单</span></div><div class="${grid}">${created.map(cloudCard).join('')||'<p class="subtitle">暂无匹配的自建歌单</p>'}</div>`+
    `<div class="section-heading"><h2>我收藏的歌单</h2><span>${collected.length}${collected.length!==data.collected.length?' / '+data.collected.length:''} 个歌单</span></div><div class="${grid}">${collected.map(cloudCard).join('')||'<p class="subtitle">暂无匹配的收藏歌单</p>'}</div>`;
  const all=[data.favorites,...data.created,...data.collected];document.querySelectorAll('[data-cloud]').forEach(b=>b.onclick=run(()=>loadCloudPlaylist(all.find(p=>p.id===b.dataset.cloud))));
}
function renderQqLibrary(){
  const data=qqLibraryCache;
  $('content').innerHTML=heading('我的 QQ 音乐','登录账号的音乐库，点开歌单即可播放。','<button class="secondary" id="refresh-qq-library">刷新音乐库</button>')+
    (data.warnings.length?`<div class="error-box">${data.warnings.map(esc).join('<br>')}</div>`:'')+
    '<div class="library-tools"><input id="library-filter" type="search" placeholder="查找我的歌单" aria-label="查找我的歌单"><select id="library-sort" aria-label="歌单排序"><option value="original">平台默认顺序</option><option value="title">按歌单名称</option><option value="count">按歌曲数量</option></select><select id="library-layout" aria-label="歌单显示方式"><option value="grid">封面视图</option><option value="list">列表视图</option></select></div><div id="qq-library-groups"></div>';
  $('library-filter').value=libraryFilter;$('library-sort').value=librarySort;$('library-layout').value=libraryLayout;
  $('library-filter').oninput=()=>{libraryFilter=$('library-filter').value;renderLibraryGroups();};
  $('library-sort').onchange=()=>{librarySort=$('library-sort').value;localStorage.setItem('library-sort',librarySort);renderLibraryGroups();};
  $('library-layout').onchange=()=>{libraryLayout=$('library-layout').value;localStorage.setItem('library-layout',libraryLayout);renderLibraryGroups();};
  renderLibraryGroups();bind('refresh-qq-library',()=>loadQqLibrary(true));
}
async function loadQqLibrary(force=false){
  view='qq-library';drawNavigation();
  if(!state.accounts.qq){$('content').innerHTML=heading('我的 QQ 音乐','登录后自动显示你的音乐库。')+'<div class="welcome"><div class="empty-symbol">♫</div><h3>你的歌单，一直都在</h3><p>登录 QQ 音乐后，自动读取“我喜欢”、自建和收藏歌单。<br>点开即可播放，无需逐个导入。</p><button id="cloud-login" class="primary">登录 QQ 音乐</button></div>';bind('cloud-login',()=>login('qq'));return;}
  if(qqLibraryCache&&!force){renderQqLibrary();return;}
  const gen=++searchGeneration;$('content').innerHTML=heading('我的 QQ 音乐','正在读取账号中的收藏与歌单…')+'<div class="loading">正在同步歌单列表…</div>';
  try{const result=await api.qqLibrary();if(gen!==searchGeneration||view!=='qq-library')return;qqLibraryCache=result;drawNavigation();renderQqLibrary();}
  catch(e){if(gen!==searchGeneration||view!=='qq-library')return;$('content').innerHTML=heading('我的 QQ 音乐','音乐库暂时未能读取。')+`<div class="error-box">${esc(e.message)}</div><div class="section-heading"><button id="cloud-retry" class="secondary">重试</button><button id="cloud-login" class="primary">更新 QQ 登录</button></div>`;bind('cloud-retry',()=>loadQqLibrary(true));bind('cloud-login',()=>login('qq'));}
}
async function openQqFavorites(){
  if(!qqLibraryCache){await navigate('qq-library');if(!qqLibraryCache)return;}
  return loadCloudPlaylist(qqLibraryCache.favorites);
}
let songFilter='',songSort='original';
function cloudSubset(){
  const query=songFilter.trim().toLocaleLowerCase();const tracks=cloudCollection.tracks.filter(t=>!query||[t.title,t.artist,t.album].some(s=>String(s||'').toLocaleLowerCase().includes(query)));
  if(songSort==='title')tracks.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
  if(songSort==='artist')tracks.sort((a,b)=>a.artist.localeCompare(b.artist,'zh-CN'));
  return tracks;
}
function renderCloudSongs(){
  const tracks=cloudSubset();if(tracks.length)renderTracks(tracks,'cloud-tracks');else $('cloud-tracks').innerHTML='<div class="empty-inline">没有匹配的歌曲</div>';
  $('cloud-play-all').textContent=songFilter?'▶ 播放筛选结果':'▶ 播放全部';
}
function renderCloudCollection(){
  const c=cloudCollection;if(!c)return;
  const art=c.playlist.cover||c.tracks.find(t=>t.cover)?.cover;
  $('content').innerHTML=`<div class="playlist-banner">${art?`<img src="${safeCover(art)}" alt="" referrerpolicy="no-referrer">`:''}`+heading(c.playlist.title,`${c.tracks.length}${c.total>c.tracks.length?' / '+c.total:''} 首 · QQ 音乐云端歌单`,'<button class="secondary" id="cloud-back">返回我的音乐</button>')+'</div>'+
    `<div class="heading-actions"><button class="primary" id="cloud-play-all" ${c.loading||!c.tracks.length?'disabled':''}>▶ 播放全部</button><button class="ghost" id="cloud-refresh">刷新歌单</button></div>`+
    '<div class="library-tools"><input id="song-filter" type="search" placeholder="在歌单中查找歌曲、歌手" aria-label="在歌单中查找"><select id="song-sort" aria-label="歌曲排序"><option value="original">歌单默认顺序</option><option value="title">按歌曲名称</option><option value="artist">按歌手名称</option></select></div>'+
    (c.loading?'<div class="loading">正在自动读取歌单歌曲…</div>':'')+
    (c.warning?`<div class="notice">${esc(c.warning)}</div>`:'')+'<div id="cloud-tracks"></div>';
  $('song-filter').value=songFilter;$('song-sort').value=songSort;$('song-filter').oninput=()=>{songFilter=$('song-filter').value;renderCloudSongs();};$('song-sort').onchange=()=>{songSort=$('song-sort').value;renderCloudSongs();};renderCloudSongs();
  bind('cloud-back',()=>navigate('qq-library'));bind('cloud-play-all',()=>playTracks(cloudSubset(),0));bind('cloud-refresh',()=>loadCloudPlaylist(c.playlist));
}
async function loadCloudPlaylist(playlist){
  if(!playlist)return;songFilter='';songSort='original';view='qq-cloud:'+playlist.id;drawNavigation();$('breadcrumb').textContent='我的 QQ 音乐';
  const gen=++searchGeneration;cloudCollection={playlist,tracks:[],total:playlist.count||0,loading:true,warning:''};renderCloudCollection();
  let offset=0;const known=new Map();
  try {
    while(offset!==null){
      const result=await api.qqCloudPlaylist(playlist,offset);if(gen!==searchGeneration)return;
      for(const t of result.tracks)known.set(t.id,t);
      cloudCollection.tracks=[...known.values()];cloudCollection.total=result.total;cloudCollection.warning=result.warning||'';
      const next=result.nextOffset;
      if(next!==null&&next<=offset)throw new Error('平台分页未前进，请刷新歌单重试');
      offset=next;cloudCollection.loading=offset!==null;renderCloudCollection();
      if(known.size>=20000){cloudCollection.warning='已显示前 20000 首歌曲';break;}
    }
  }catch(e){if(gen===searchGeneration){cloudCollection.warning=e.message;}}
  if(gen===searchGeneration){cloudCollection.loading=false;renderCloudCollection();}
}
async function search(query,nextPage=1){
  query=query.trim();if(!query)return;searchQuery=query;page=nextPage;onlineTab='qq';view='online';drawNavigation();drawOnline();
  const generation=++searchGeneration;$('online-results').innerHTML='<div class="loading">正在搜索 QQ 音乐…</div>';
  try {const tracks=await api.search(query,page);if(generation!==searchGeneration||view!=='online')return;
    $('online-results').innerHTML=`<div class="section-heading"><h2>“${esc(query)}” 的搜索结果</h2><span>第 ${page} 页</span></div><div id="search-tracks"></div><div class="pagination"><button class="secondary" id="search-prev" ${page===1?'disabled':''}>上一页</button> <button class="secondary" id="search-next" ${tracks.length<30?'disabled':''}>下一页</button></div>`;
    if(tracks.length)renderTracks(tracks,'search-tracks');else $('search-tracks').innerHTML='<div class="empty-inline">没有找到歌曲，试试其他关键词</div>';
    bind('search-prev',()=>search(query,page-1));bind('search-next',()=>search(query,page+1));
  }catch(e){if(generation===searchGeneration&&view==='online')$('online-results').innerHTML=`<div class="error-box">${esc(e.message)}</div>`;}
}
async function loadBiliFolders(){
  const gen=++searchGeneration;$('online-results').innerHTML='<div class="loading">正在读取收藏夹…</div>';
  try{const folders=await api.biliFolders();if(gen!==searchGeneration||view!=='online')return;
    $('online-results').innerHTML='<div class="section-heading"><h2>我的哔哩哔哩收藏夹</h2></div>'+folders.map(f=>`<button class="folder-card" data-folder="${esc(f.id)}"><div><h3>${esc(f.title)}</h3><p>${f.count} 个视频</p></div><span>→</span></button>`).join('')+(folders.length?'':'<div class="empty-inline">账号下暂无收藏夹</div>');
    document.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>loadBiliFolder(b.dataset.folder,1,[]));
  }catch(e){if(gen===searchGeneration&&view==='online')$('online-results').innerHTML=`<div class="error-box">${esc(e.message)}</div>`;}
}
async function loadBiliFolder(id,p,existing){
  const gen=++searchGeneration;$('online-results').innerHTML='<div class="loading">正在读取收藏夹内容…</div>';
  try{const r=await api.biliFolder(id,p);if(gen!==searchGeneration||view!=='online')return;const tracks=[...existing,...r.tracks];
    $('online-results').innerHTML='<div class="section-heading"><h2>收藏夹音频</h2><button id="back-folders">返回收藏夹</button></div><div id="folder-tracks"></div>'+(r.hasMore?'<div class="pagination"><button id="folder-more" class="secondary">加载更多</button></div>':'');renderTracks(tracks,'folder-tracks');bind('folder-more',()=>loadBiliFolder(id,p+1,tracks));bind('back-folders',loadBiliFolders);
  }catch(e){if(gen===searchGeneration&&view==='online')$('online-results').innerHTML=`<div class="error-box">${esc(e.message)}</div>`;}
}
function drawSettings(){
  $('content').innerHTML=heading('设置','让 MusicOne 更适合你的聆听方式。')+
    '<div class="settings-card"><h2>外观</h2><div class="setting-row"><div><strong>主题模式</strong><p id="appearance-status">跟随 Windows 的应用颜色设置，切换后立即生效。</p></div><select id="appearance-select" aria-label="主题模式"><option value="system">跟随 Windows</option><option value="light">浅色</option><option value="dark">深色（夜间模式）</option></select></div></div>'+
    '<div class="settings-card"><h2>音源账号</h2>'+['qq','bili'].map(source=>`<div class="setting-row"><div><strong>${source==='qq'?'QQ 音乐':'哔哩哔哩'}</strong><p>${state.accounts[source]?'已保存登录凭证；有效性由平台验证':'尚未登录'}</p></div><div class="heading-actions"><button class="secondary" data-login="${source}">网页登录</button><button class="ghost" data-cookie="${source}">填写 Cookie</button>${state.accounts[source]?`<button class="ghost" data-logout="${source}">退出</button>`:''}</div></div>`).join('')+'<p class="footnote">凭证使用 Windows 系统加密保存于本机，不上传到中转服务器。浏览器登录完成后关闭登录窗口即可；若平台登录页兼容性受限，可填写本人账号 Cookie。</p></div>'+
    `<div class="settings-card"><h2>播放偏好</h2><div class="setting-row"><div><strong>QQ 音乐音质</strong><p>优先尝试所选音质，失败后自动逐档降级；底栏显示实际音质。</p></div><select id="quality-select"><option value="standard">标准 · 128kbps</option><option value="high">高品质 · 320kbps</option><option value="lossless">无损 · FLAC</option></select></div></div>`+
    '<div class="settings-card"><h2>关于桌面适配版</h2><p class="subtitle">MusicOne Windows 1.0.0 · Windows 10 / 11，64 位<br>基于 HGODLK/MusicOne 的 MIT 许可源码移植音源逻辑，并重建桌面界面与播放层。<br>此版支持本地播放、LRC 歌词、本机歌单与收藏，以及 QQ 音乐 / 哔哩哔哩音源接入。<br>原版推荐流、网易云、酷狗、云端收藏同步、USB 独占输出尚未移植。</p><div class="notice">本地格式取决于内置播放组件，支持 MP3、FLAC、WAV 等常见格式。APE、DSD 等原版专用解码格式尚未适配。歌名按文件名读取，建议使用“歌手 - 歌名”。</div><button class="secondary" id="source-link">查看原项目</button></div>';
  updateAppearanceControls();
  $('appearance-select').onchange=run(async()=>{try{const value=await api.setAppearance($('appearance-select').value);state.theme=value.preference;state.appearance=value;window.musiconeAppearance.apply(value);}finally{updateAppearanceControls();}});
  $('quality-select').value=state.quality;
  $('quality-select').onchange=run(async()=>{state=await api.preferences({quality:$('quality-select').value,volume:audio.volume});toast('音质偏好已保存，下次播放时使用');});
  document.querySelectorAll('[data-login]').forEach(b=>b.onclick=run(()=>login(b.dataset.login)));
  document.querySelectorAll('[data-cookie]').forEach(b=>b.onclick=()=>cookieDialog(b.dataset.cookie));
  document.querySelectorAll('[data-logout]').forEach(b=>b.onclick=run(async()=>{state=await api.logout(b.dataset.logout);if(b.dataset.logout==='qq'){qqLibraryCache=null;cloudCollection=null;searchGeneration++;}drawNavigation();drawSettings();toast('已退出账号');}));
  const diagnostic=document.createElement('section');diagnostic.className='settings-card';diagnostic.innerHTML='<h2>播放诊断</h2><p class="diagnostic-summary" id="diagnostic-summary">查看最近的音源连接、自动降级和播放失败情况。</p><button id="export-diagnostics" class="secondary">保存播放诊断</button>';$('content').append(diagnostic);
  bind('export-diagnostics',async()=>{if(await api.exportDiagnostics())toast('播放诊断已保存');});
  api.diagnostics?.().then(entries=>{const box=$('diagnostic-summary');if(box){const count=entries.filter(e=>e.result==='failed'||e.result==='retries_exhausted').length;box.textContent=`最近记录 ${entries.length} 个播放阶段，${count} 次未能恢复的失败。诊断保存在本机，不包含登录凭证和带签名的音频地址。`;}}).catch(()=>{});
  bind('source-link',()=>api.openSource());
}
async function login(source){await api.login(source);toast('请在打开的窗口中登录，完成后关闭窗口');}
function cookieDialog(source){openDialog(source==='qq'?'QQ 音乐 Cookie':'哔哩哔哩 Cookie','<p>填写你本人账号的 Cookie。内容仅经系统加密保存在本机。请勿分享给他人。</p><textarea id="dialog-input" placeholder="粘贴 Cookie" spellcheck="false" required></textarea>',async()=>{state=await api.setCookie(source,$('dialog-input').value.trim());qqLibraryCache=null;if(source==='qq')await navigate('qq-library');else drawSettings();toast('登录凭证已保存');},'保存');}
function openDialog(title,body,submit,label='确定'){
  $('modal-title').textContent=title;$('modal-body').innerHTML=body;$('modal-error').textContent='';$('modal-submit').textContent=label;$('modal-submit').disabled=false;
  $('modal-form').onsubmit=async e=>{e.preventDefault();$('modal-submit').disabled=true;$('modal-error').textContent='';try{await submit();$('modal').close();}catch(e){$('modal-error').textContent=e.message;}finally{$('modal-submit').disabled=false;}};
  $('modal').showModal();
}
function newPlaylist(){openDialog('新建歌单','<p>给你的音乐收藏起个名字。</p><input type="text" id="dialog-input" maxlength="80" placeholder="歌单名称" required>',async()=>{state=await api.createPlaylist($('dialog-input').value);navigate('playlist:'+state.playlists.at(-1).id);},'创建');}
function addDialog(track){
  if(!state.playlists.length){openDialog('添加到新歌单',`<p>将「${esc(track.title)}」加入新建歌单。</p><input type="text" id="dialog-input" maxlength="80" placeholder="歌单名称" required>`,async()=>{state=await api.createPlaylist($('dialog-input').value);state=await api.addToPlaylist(state.playlists.at(-1).id,track);drawNavigation();toast('已加入歌单');},'创建并添加');return;}
  openDialog('添加到歌单',`<p>${esc(track.title)}</p><select id="dialog-input">${state.playlists.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select>`,async()=>{state=await api.addToPlaylist($('dialog-input').value,track);drawNavigation();if(view.startsWith('playlist:'))drawCollection();toast('已加入歌单');},'添加');
}
async function navigate(next){searchGeneration++;view=next;drawNavigation();$('breadcrumb').textContent=view==='home'?'为你而奏':view==='online'?'探索更多音乐':view==='settings'?'偏好与账号':'我的音乐空间';
  $('content').classList.remove('page-arriving');void $('content').offsetWidth;$('content').classList.add('page-arriving');
  if(view==='home')drawHome();else if(view==='qq-library')await loadQqLibrary();else if(view.startsWith('qq-cloud:'))renderCloudCollection();else if(view==='online')drawOnline();else if(view==='settings')drawSettings();else drawCollection();
}
async function playTracks(tracks,index){
  if(!tracks.length)return;queue=tracks.slice();queueIndex=index;await startCurrent();
}
let playbackBusy=false,recoveryCount=0,excludedCandidates=[],excludedQualities=[],wantPlaying=false,lastProgressAt=0,lastAudioTime=0;
function reportPlayback(event){api.reportPlayback?.({source:current?.source,...event})?.catch(()=>{});}
function waitForMedia(){
  return new Promise((resolve,reject)=>{
    const clear=()=>{clearTimeout(timer);audio.removeEventListener('loadedmetadata',ready);audio.removeEventListener('error',failed);};
    const ready=()=>{clear();resolve();};
    const failed=()=>{clear();reject(Object.assign(new Error('音频加载或解码失败'),{mediaCode:audio.error?.code||2}));};
    const timer=setTimeout(()=>{clear();reject(Object.assign(new Error('音频加载超时'),{mediaCode:2}));},14000);
    audio.addEventListener('loadedmetadata',ready,{once:true});audio.addEventListener('error',failed,{once:true});
  });
}
async function startCurrent(){
  const generation=++playGeneration;wantPlaying=true;recoveryCount=0;excludedCandidates=[];excludedQualities=[];
  audio.pause();audio.removeAttribute('src');audio.load();current=queue[queueIndex];lyrics=[];activeLyric=-1;playbackResult=null;lyricStatus='正在读取歌词…';playbackLabel='连接音源';updateCurrent();renderLyrics();drawQueue();
  api.lyrics(current).then(lines=>{if(generation===playGeneration){lyrics=lines;lyricStatus=lines.length?`${lines.length} 行同步歌词`:'暂无在线歌词，可手动导入 LRC';renderLyrics();}}).catch(()=>{if(generation===playGeneration){lyricStatus='歌词读取失败，可手动导入 LRC';renderLyrics();}});
  await loadCurrentStream(generation,0);
}
async function loadCurrentStream(generation,position){
  playbackBusy=true;lastProgressAt=performance.now();let obtained=false;
  try{
    const result=await api.stream(current,state.quality,{exclude:excludedCandidates,excludeQualities:excludedQualities,recovery:recoveryCount});
    if(generation!==playGeneration||!wantPlaying)return;
    playbackResult=result;obtained=true;
    if(result.metadata){current={...current,...result.metadata};queue[queueIndex]=current;updateCurrent();}
    playbackLabel=result.label;$('format').textContent=playbackLabel;
    audio.pause();audio.removeAttribute('src');audio.load();
    const ready=waitForMedia();audio.src=result.url;audio.load();await ready;
    if(generation!==playGeneration||!wantPlaying)return;
    if(position>0&&Number.isFinite(audio.duration))audio.currentTime=Math.min(position,Math.max(0,audio.duration-1));
    await audio.play();
    lastProgressAt=performance.now();lastAudioTime=audio.currentTime;
    reportPlayback({result:'playing',recovery:recoveryCount});
    if(result.downgraded)toast(`已自动切换到 ${result.label} 播放`);
  }catch(error){
    if(generation!==playGeneration||!wantPlaying)return;
    playbackBusy=false;
    if(error.name==='NotAllowedError'){wantPlaying=false;toast('请点击播放按钮继续');updatePlay();return;}
    if(obtained&&playbackResult?.url&&current.source!=='local'&&recoveryCount<3){await recoverPlayback(error.mediaCode||2,position);return;}
    wantPlaying=false;playbackLabel='播放失败';$('format').textContent='未播放';reportPlayback({result:'failed',code:error.mediaCode||0,recovery:recoveryCount});toast(error.message||'暂时无法播放这首歌曲');updatePlay();
  }finally{if(generation===playGeneration)playbackBusy=false;}
}
async function recoverPlayback(code,position=audio.currentTime){
  if(playbackBusy||!wantPlaying||!current)return;
  if(current.source==='local'||recoveryCount>=3){wantPlaying=false;reportPlayback({result:'retries_exhausted',code,recovery:recoveryCount});toast('播放中断，备用音源也未能恢复。可在设置中查看播放诊断');updatePlay();return;}
  recoveryCount++;playbackBusy=true;audio.pause();
  if(playbackResult?.candidateId)excludedCandidates.push(playbackResult.candidateId);
  if(code===4&&playbackResult?.quality)excludedQualities.push(playbackResult.quality);
  reportPlayback({result:code===4?'decoder_retry':'network_retry',code,recovery:recoveryCount});
  $('format').textContent='正在恢复';toast('当前音源不可用，正在尝试备用地址或较低音质…');
  await loadCurrentStream(playGeneration,position);
}
async function applyAlbumPalette(){
  const generation=++artworkGeneration;
  const fallback={primary:'rgb(30,53,51)',secondary:'rgb(34,50,65)',accent:'rgb(176,215,195)'};
  const apply=value=>{const root=document.documentElement;root.style.setProperty('--ambient-a',value.primary);root.style.setProperty('--ambient-b',value.secondary);root.style.setProperty('--ambient-accent',value.accent);};
  if(!current||!api.artwork){apply(fallback);return;}
  try{
    const value=await api.artwork(current);if(generation!==artworkGeneration)return;apply(value||fallback);
    if(value?.image){for(const id of ['large-cover','now-cover']){const image=document.createElement('img');image.alt='';image.src=value.image;$(id).replaceChildren(image);}}
  }catch{if(generation===artworkGeneration)apply(fallback);}
}
function updateCurrent(){
  $('now-title').textContent=current?.title||'此刻，听点喜欢的';$('now-artist').textContent=current?.artist||'导入音乐，或从在线音源开始';
  $('now-cover').innerHTML=current?cover(current,''):'♪';$('large-cover').innerHTML=current?cover(current,''):'♪';
  $('large-title').textContent=current?.title||'还没有播放音乐';$('large-artist').textContent=current?.artist||'选择一首喜欢的歌曲';
  $('now-favorite').classList.toggle('liked',current&&liked(current));$('format').textContent=playbackLabel;
  document.querySelectorAll('.track-row').forEach(row=>row.classList.toggle('current',row.dataset.trackId===current?.id));
  applyAlbumPalette();
  document.title=current?`${current.title} · MusicOne`:'MusicOne · Windows';
  if('mediaSession' in navigator&&current){navigator.mediaSession.metadata=new MediaMetadata({title:current.title,artist:current.artist,album:current.album});}
}
function updatePlay(){$('immersive').classList.toggle('playing',!audio.paused);$('play').innerHTML=icon(audio.paused?'play':'pause');}
async function togglePlay(){
  if(playbackBusy&&wantPlaying){wantPlaying=false;await api.cancelStream?.();audio.pause();updatePlay();return;}
  if(!current){const tracks=state.library.length?state.library:state.favorites;if(!tracks.length){toast('请先添加或选择音乐');return;}return playTracks(tracks,0);}
  if(audio.paused){wantPlaying=true;if(!audio.src||audio.error)return startCurrent();await audio.play();}else{wantPlaying=false;audio.pause();}
}
async function advance(delta=1,ended=false){if(!queue.length)return;if(mode===2&&ended){audio.currentTime=0;await audio.play();return;}let next=queueIndex+delta;if(mode===1&&queue.length>1){do{next=Math.floor(Math.random()*queue.length);}while(next===queueIndex);}else if(next>=queue.length){if(ended){audio.pause();audio.currentTime=0;updatePlay();return;}next=0;}else if(next<0)next=queue.length-1;queueIndex=next;await startCurrent();}
function renderLyrics(){
  $('lyric-status').textContent=lyricStatus;
  $('lyric-lines').innerHTML=lyrics.length?lyrics.map((l,i)=>`<button class="lyric-line" data-lyric="${i}"><span class="lyric-text">${l.words?.length?l.words.map(w=>`<span class="lyric-word">${esc(w.text)}</span>`).join(''):esc(l.text)}</span>${l.translation?`<small>${esc(l.translation)}</small>`:''}</button>`).join(''):`<div class="no-lyrics">${current?'把旋律留给此刻':'先选一首音乐吧'}<br><small>${esc(lyricStatus)}</small></div>`;
  $('lyric-lines').querySelectorAll('[data-lyric]').forEach(b=>b.onclick=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,lyrics[+b.dataset.lyric].time);lyricMotion.resume();});
  lyricMotion.reset();
}
function updateTimeline(){
  if(audio.currentTime>lastAudioTime+.05){lastProgressAt=performance.now();lastAudioTime=audio.currentTime;}
  const d=Number.isFinite(audio.duration)?audio.duration:current?.duration||0;$('elapsed').textContent=duration(audio.currentTime);$('duration').textContent=duration(d);$('seek').value=d?Math.round(audio.currentTime/d*1000):0;
  if(playbackResult&&Number.isFinite(audio.duration)){
    const expected=Number(current?.duration)||0;const shortened=expected>0&&audio.duration<expected-Math.max(5,expected*.03);
    const suffix=playbackResult.trial?(expected>0?(shortened?' · 试听':''):' · 可能试听'):'';
    playbackLabel=playbackResult.label+suffix;$('format').textContent=playbackLabel;
  }
  lyricMotion.sync(audio.currentTime);lyricMotion.wake();
}
function drawQueue(){
  $('queue-panel').innerHTML=`<div class="section-heading"><h2>播放队列</h2><span>${queue.length} 首</span></div>`+(queue.length?queue.map((t,i)=>`<button class="queue-item ${i===queueIndex?'active':''}" data-queue="${i}"><span>${esc(t.title)}<small>${esc(t.artist)}</small></span>${i===queueIndex?'♫':duration(t.duration)}</button>`).join(''):'<p class="subtitle">播放音乐后，歌曲会出现在这里。</p>');
  $('queue-panel').querySelectorAll('[data-queue]').forEach(b=>b.onclick=run(async()=>{queueIndex=+b.dataset.queue;await startCurrent();}));
}
async function showLyrics(){if(!current){toast('先选一首音乐，再打开歌词');return;}$('queue-panel').hidden=true;activeLyric=-2;await lyricsLayout.setOpen(!lyricsLayout.desired);}
function updateAppearanceControls(){
  const value=window.musiconeAppearance.current;
  if($('appearance-select'))$('appearance-select').value=value.preference;
  if($('appearance-status'))$('appearance-status').textContent=value.preference==='system'?`自动跟随 Windows，当前为${value.resolved==='dark'?'深色':'浅色'}。`:`已使用${value.resolved==='dark'?'深色夜间':'浅色'}模式，重新打开后仍会保留。`;
}
async function reload(){state=await api.state();if(state.appearance)window.musiconeAppearance.apply(state.appearance);audio.volume=state.volume;volumeMenu.update();drawNavigation();await navigate(view);}
async function init(){
  window.addEventListener('musicone-appearance-change',event=>{if(state){state.theme=event.detail.preference;state.appearance=event.detail;}updateAppearanceControls();});
  $('search-icon').innerHTML=icon('search');$('prev').innerHTML=icon('prev');$('next').innerHTML=icon('next');$('now-favorite').innerHTML=icon('heart');$('mode').innerHTML=icon('repeat');$('volume-icon').innerHTML=icon('volume');$('queue-toggle').innerHTML=icon('list');updatePlay();
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));document.querySelectorAll('[data-window]').forEach(b=>b.onclick=()=>api.window(b.dataset.window));
  $('search-form').onsubmit=e=>{e.preventDefault();search($('search-input').value);};
  bind('new-playlist',newPlaylist);bind('play',togglePlay);bind('prev',()=>advance(-1));bind('next',()=>advance(1));
  bind('mode',()=>{mode=(mode+1)%3;$('mode').innerHTML=icon(mode===1?'shuffle':'repeat');$('mode').title=['顺序播放','随机播放','单曲循环'][mode];$('mode').classList.toggle('mode-enabled',mode!==0);$('mode').setAttribute('aria-label',$('mode').title);toast($('mode').title);});
  bind('now-favorite',async()=>{if(!current)return;state=await api.favorite(current);refreshFavorites();});bind('now-cover',showLyrics);bind('lyrics-toggle',showLyrics);bind('close-immersive',()=>lyricsLayout.setOpen(false));
  bind('lyrics-resume',()=>lyricMotion.resume());
  bind('load-lyrics',async()=>{const lines=await api.importLyrics();if(lines){lyrics=lines;activeLyric=-1;lyricStatus=lines.length?`${lines.length} 行本地歌词`:'未找到有效时间标记';renderLyrics();}});
  bind('queue-toggle',()=>{$('queue-panel').hidden=!$('queue-panel').hidden;drawQueue();});
  $('seek').oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=+$('seek').value/1000*audio.duration;};
  $('volume').oninput=()=>{audio.volume=+$('volume').value;volumeMenu.update();clearTimeout(saveTimer);saveTimer=setTimeout(()=>api.preferences({volume:audio.volume,quality:state.quality}).catch(fail),400);};
  audio.addEventListener('timeupdate',updateTimeline);audio.addEventListener('loadedmetadata',updateTimeline);audio.addEventListener('play',updatePlay);audio.addEventListener('pause',updatePlay);audio.addEventListener('ended',run(()=>advance(1,true)));audio.addEventListener('error',()=>{if(audio.src&&!playbackBusy&&wantPlaying)recoverPlayback(audio.error?.code||2).catch(fail);});
  setInterval(()=>{if(wantPlaying&&!audio.paused&&!playbackBusy&&audio.readyState<3&&performance.now()-lastProgressAt>15000)recoverPlayback(2).catch(fail);},1000);
  bind('modal-close',()=>$('modal').close());bind('modal-cancel',()=>$('modal').close());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').open){e.preventDefault();lyricsLayout.setOpen(false).catch(fail);$('queue-panel').hidden=true;return;}if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName)||$('modal').open)return;if(e.code==='Space'){e.preventDefault();togglePlay().catch(fail);}else if(e.ctrlKey&&e.key==='ArrowRight'){e.preventDefault();advance(1).catch(fail);}else if(e.ctrlKey&&e.key==='ArrowLeft'){e.preventDefault();advance(-1).catch(fail);}});
  api.onLyricsWindowExit?.(()=>lyricsLayout.setOpen(false).catch(fail));
  api.onAccountsChanged(next=>{state=next;if(next.changedSource==='qq'){qqLibraryCache=null;cloudCollection=null;navigate('qq-library');}else{drawNavigation();if(view==='settings')drawSettings();else if(view==='online')drawOnline();}toast('登录成功，正在读取音乐库');});
  if('mediaSession' in navigator){navigator.mediaSession.setActionHandler('play',()=>togglePlay().catch(fail));navigator.mediaSession.setActionHandler('pause',()=>audio.pause());navigator.mediaSession.setActionHandler('previoustrack',()=>advance(-1).catch(fail));navigator.mediaSession.setActionHandler('nexttrack',()=>advance(1).catch(fail));}
  await reload();if(state.accounts.qq)await navigate('qq-library');
}
window.musiconeApp={reload,navigate,playTracks,setLyricsOpen:open=>lyricsLayout.setOpen(open)};
init().catch(fail);
