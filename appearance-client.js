'use strict';
(()=>{
  const system=matchMedia('(prefers-color-scheme: dark)');
  let current;
  function apply(value){
    const preference=['system','light','dark'].includes(value?.preference)?value.preference:'system';
    const resolved=value?.resolved==='dark'||value?.resolved==='light'?value.resolved:(preference==='system'?(system.matches?'dark':'light'):preference);
    current={preference,resolved};
    document.documentElement.dataset.theme=resolved;
    document.documentElement.dataset.themePreference=preference;
    document.documentElement.style.colorScheme=resolved;
    window.dispatchEvent(new CustomEvent('musicone-appearance-change',{detail:current}));
    return current;
  }
  window.musiconeAppearance={apply,get current(){return current;}};
  apply(window.musicone?.initialAppearance);
  if(window.musicone?.onAppearanceChanged)window.musicone.onAppearanceChanged(apply);
  else system.addEventListener('change',()=>{if(current.preference==='system')apply({preference:'system'});});
})();
