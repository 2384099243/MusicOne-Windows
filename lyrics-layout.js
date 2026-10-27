'use strict';
class LyricsLayout {
  constructor(options){
    Object.assign(this,options);this.opened=false;this.desired=false;this.pending=null;this.savedScreen=null;
    this.transport=document.querySelector('.player .transport');this.extras=document.querySelector('.player .player-end');this.favorite=document.getElementById('now-favorite');this.volumeControl=document.getElementById('volume-control');
    this.homes=[this.transport,this.extras,this.favorite,this.volumeControl].map(node=>{const marker=document.createComment('player-control-home');node.before(marker);return {node,marker};});
  }
  setOpen(value){
    this.desired=Boolean(value);
    if(!this.pending)this.pending=this.reconcile().finally(()=>{this.pending=null;});
    return this.pending;
  }
  async reconcile(){while(this.opened!==this.desired){if(this.desired)await this.enter();else await this.leave();}}
  rect(node){const r=node.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};}
  async frame(){await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
  async nativeMode(value){try{return await this.requestFullscreen?.(value)||{};}catch(error){this.onError?.(error);return {};}}
  screenRect(rect,bounds){return {...rect,left:rect.left+(bounds?.x??window.screenX),top:rect.top+(bounds?.y??window.screenY)};}
  localRect(rect,bounds){return {...rect,left:rect.left-(bounds?.x??window.screenX),top:rect.top-(bounds?.y??window.screenY)};}
  ghost(source){
    const node=document.createElement('div');node.className='cover-ghost';node.setAttribute('aria-hidden','true');node.inert=true;
    for(const child of source.childNodes)node.append(child.cloneNode(true));node.style.background=getComputedStyle(source).background;document.body.append(node);return node;
  }
  animate(node,frames,duration,retain=false){const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const animation=node.animate(frames,{duration:reduced?0:duration,easing:'cubic-bezier(.18,.72,.18,1)',fill:'both'});return animation.finished.catch(()=>{}).then(()=>{if(retain)return animation;animation.cancel();});}
  coverAnimation(ghost,from,to,duration,retain=false){
    Object.assign(ghost.style,{left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px'});
    const sx=from.width/Math.max(1,to.width),sy=from.height/Math.max(1,to.height);
    return this.animate(ghost,[{transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${sx},${sy})`,borderRadius:(12/Math.max(.1,sx))+'px'},{transform:'none',borderRadius:'17px'}],duration,retain);
  }
  moveControls(){this.controls.append(this.transport);this.moreControls.append(this.extras);this.favoriteSlot.append(this.favorite);document.getElementById('format').after(this.volumeControl);}
  restoreControls(){for(const {node,marker} of this.homes)marker.after(node);}
  hideLibrary(value){this.workspace.inert=value;this.titlebar.inert=value;this.footer.inert=value;document.body.classList.toggle('lyrics-layout',value);}
  async enter(){
    this.onTransition?.();
    const first=this.rect(this.smallCover),oldControls=this.rect(this.transport),ghost=this.ghost(this.smallCover);
    Object.assign(ghost.style,{left:first.left+'px',top:first.top+'px',width:first.width+'px',height:first.height+'px'});
    this.lastFocus=document.activeElement;this.largeCover.style.visibility='hidden';this.container.hidden=false;this.hideLibrary(true);this.moveControls();
    const mode=await this.nativeMode(true);this.savedScreen=this.screenRect(first,mode.beforeBounds);await this.frame();
    const destination=this.rect(this.largeCover),from=this.localRect(this.savedScreen,mode.afterBounds),controlTarget=this.rect(this.transport);
    const controlFrom=this.localRect(this.screenRect(oldControls,mode.beforeBounds),mode.afterBounds);
    try{
      await Promise.all([
        this.coverAnimation(ghost,from,destination,960),
        this.animate(this.transport,[{transform:`translate(${controlFrom.left-controlTarget.left}px,${controlFrom.top-controlTarget.top}px) scale(${controlFrom.width/Math.max(1,controlTarget.width)},${controlFrom.height/Math.max(1,controlTarget.height)})`,opacity:.55},{transform:'none',opacity:1}],850),
        this.animate(this.lyrics,[{opacity:0,transform:'translateY(20px)'},{opacity:1,transform:'none'}],760)
      ]);
    }finally{ghost.remove();this.largeCover.style.visibility='';this.opened=true;this.onChange?.(true);document.getElementById('close-immersive').focus({preventScroll:true});}
  }
  async leave(){
    this.onTransition?.();
    const ghost=this.ghost(this.largeCover),from=this.rect(this.largeCover),destination=this.localRect(this.savedScreen||this.screenRect(this.rect(this.smallCover)));
    this.largeCover.style.visibility='hidden';const retained=[];
    try{
      // One exit timeline: retain the final frame until the native window is restored.
      // Cancelling a finished fade here would make the lyrics and controls flash back.
      await Promise.all([
        this.coverAnimation(ghost,from,destination,720,true).then(animation=>retained.push(animation)),
        this.animate(this.container,[{opacity:1},{opacity:0}],720,true).then(animation=>retained.push(animation))
      ]);
      await this.nativeMode(false);
    }finally{
      ghost.remove();this.restoreControls();this.hideLibrary(false);this.container.hidden=true;this.largeCover.style.visibility='';this.opened=false;this.onChange?.(false);
      retained.forEach(animation=>animation.cancel());
      if(this.lastFocus?.isConnected)this.lastFocus.focus({preventScroll:true});
    }
  }
}
window.LyricsLayout=LyricsLayout;
