'use strict';
class VolumeMenu {
  constructor(audio,drawIcon){
    this.audio=audio;this.drawIcon=drawIcon;this.button=document.getElementById('volume-button');this.panel=document.getElementById('volume-popover');this.slider=document.getElementById('volume');this.value=document.getElementById('volume-value');
    this.button.addEventListener('click',()=>this.panel.hidden?this.open():this.close());
    document.addEventListener('pointerdown',event=>{if(!this.panel.hidden&&!this.panel.contains(event.target)&&!this.button.contains(event.target))this.close(false);});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!this.panel.hidden){event.preventDefault();event.stopImmediatePropagation();this.close();}});
    window.addEventListener('resize',()=>this.close(false));
    audio.addEventListener('volumechange',()=>this.update());this.update();
  }
  update(){
    const percentage=Math.round(this.audio.volume*100);this.slider.value=this.audio.volume;this.value.textContent=percentage+'%';this.button.title='音量 · '+percentage+'%';
    document.getElementById('volume-icon').innerHTML=this.drawIcon(this.audio.muted||this.audio.volume===0);
  }
  open(){
    const host=document.body.classList.contains('lyrics-layout')?document.getElementById('immersive'):document.body;host.append(this.panel);
    this.panel.hidden=false;this.button.setAttribute('aria-expanded','true');this.update();
    const anchor=this.button.getBoundingClientRect(),width=this.panel.offsetWidth,height=this.panel.offsetHeight;
    const left=Math.max(12,Math.min(innerWidth-width-12,anchor.left+anchor.width/2-width/2));
    let top=anchor.top-height-13;if(top<12)top=anchor.bottom+13;top=Math.max(12,Math.min(innerHeight-height-12,top));
    this.panel.style.left=left+'px';this.panel.style.top=top+'px';this.slider.focus({preventScroll:true});
  }
  close(restoreFocus=true){const wasOpen=!this.panel.hidden;this.panel.hidden=true;this.button.setAttribute('aria-expanded','false');if(wasOpen&&restoreFocus&&this.button.isConnected)this.button.focus({preventScroll:true});}
}
window.VolumeMenu=VolumeMenu;
