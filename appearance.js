'use strict';
const normalizePreference=value=>['system','light','dark'].includes(value)?value:'system';
function createAppearanceController(nativeTheme,initial='system',onChange=()=>{}){
  let preference=normalizePreference(initial),previous='';
  const snapshot=()=>({preference,resolved:nativeTheme.shouldUseDarkColors?'dark':'light'});
  function publish(){const value=snapshot(),key=value.preference+':'+value.resolved;if(key!==previous){previous=key;onChange(value);}return value;}
  nativeTheme.themeSource=preference;
  nativeTheme.on('updated',publish);
  return {snapshot,set(value){preference=normalizePreference(value);nativeTheme.themeSource=preference;return publish();},dispose(){nativeTheme.removeListener('updated',publish);}};
}
module.exports={normalizePreference,createAppearanceController};
