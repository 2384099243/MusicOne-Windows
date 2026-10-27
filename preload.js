const {contextBridge,ipcRenderer}=require('electron');
async function call(name,...args){const response=await ipcRenderer.invoke(name,...args);if(!response.ok)throw new Error(response.error);return response.value;}
contextBridge.exposeInMainWorld('musicone',{
  initialAppearance:ipcRenderer.sendSync('appearance-initial'),setAppearance:preference=>call('appearance',preference),
  onAppearanceChanged:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('appearance-changed',listener);return ()=>ipcRenderer.removeListener('appearance-changed',listener);},
  lyricsMode:enter=>call('lyrics-mode',enter),onLyricsWindowExit:callback=>{const listener=()=>callback();ipcRenderer.on('lyrics-window-exit',listener);return ()=>ipcRenderer.removeListener('lyrics-window-exit',listener);},
  state:()=>call('state'),importMusic:kind=>call('import',kind),search:(q,p)=>call('search',q,p),
  qqPlaylist:input=>call('qq-playlist',input),biliVideo:input=>call('bili-video',input),biliFolders:()=>call('bili-folders'),biliFolder:(id,p)=>call('bili-folder',id,p),
  qqLibrary:()=>call('qq-library'),qqCloudPlaylist:(playlist,offset)=>call('qq-cloud-playlist',playlist,offset),importPlaylist:(title,tracks)=>call('playlist-import',title,tracks),
  artwork:track=>call('artwork',track),
  stream:(t,q,options)=>call('stream',t,q,options),cancelStream:()=>call('cancel-stream'),reportPlayback:event=>call('playback-report',event),diagnostics:()=>call('diagnostics'),exportDiagnostics:()=>call('diagnostics-export'),lyrics:t=>call('lyrics',t),importLyrics:()=>call('import-lyrics'),platform:(source,track)=>call('platform',source,track),
  favorite:t=>call('favorite',t),createPlaylist:n=>call('playlist-create',n),addToPlaylist:(id,t)=>call('playlist-add',id,t),removeFromPlaylist:(id,t)=>call('playlist-remove-track',id,t),deletePlaylist:id=>call('playlist-delete',id),removeLocal:id=>call('remove-local',id),
  preferences:value=>call('preferences',value),setCookie:(source,value)=>call('cookie',source,value),logout:source=>call('logout',source),login:source=>call('login',source),openSource:()=>call('open-source'),window:action=>call('window',action),
  onAccountsChanged:callback=>{ipcRenderer.on('accounts-changed',(_event,state)=>callback(state));}
});
