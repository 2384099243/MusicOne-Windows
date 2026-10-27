'use strict';
class LyricMotion {
  constructor(container,audio,getLines,isVisible){
    this.container=container;this.audio=audio;this.getLines=getLines;this.isVisible=isVisible;this.rows=[];this.index=-2;this.velocity=0;this.target=0;this.frame=0;this.holdUntil=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hold=()=>{this.holdUntil=performance.now()+3500;document.getElementById('lyrics-resume').hidden=false;this.wake();};
    container.addEventListener('wheel',hold,{passive:true});container.addEventListener('touchmove',hold,{passive:true});container.addEventListener('pointerdown',hold);
    audio.addEventListener('play',()=>this.wake());audio.addEventListener('seeking',()=>this.wake());
    document.addEventListener('visibilitychange',()=>this.wake());
    new ResizeObserver(()=>{this.index=-2;this.wake();}).observe(container);
  }
  reset(){this.rows=[...this.container.querySelectorAll('.lyric-line')];this.index=-2;this.velocity=0;this.holdUntil=0;this.wake();}
  resume(){this.holdUntil=0;this.index=-2;document.getElementById('lyrics-resume').hidden=true;this.wake();}
  sync(time){
    const lines=this.getLines();if(!lines.length||!this.rows.length)return;
    let low=0,high=lines.length-1,active=-1;
    while(low<=high){const mid=(low+high)>>1;if(lines[mid].time<=time){active=mid;low=mid+1;}else high=mid-1;}
    if(active!==this.index){
      this.index=active;
      this.rows.forEach((row,i)=>{const distance=Math.abs(i-active);row.classList.toggle('active',i===active);row.classList.toggle('near',distance===1);row.classList.toggle('far',distance>2);row.classList.toggle('past',i<active);if(i!==active)row.querySelectorAll('.singing').forEach(word=>word.classList.remove('singing'));});
    }
    const row=this.rows[Math.max(0,active)];
    if(row)this.target=Math.max(0,Math.min(this.container.scrollHeight-this.container.clientHeight,row.offsetTop-this.container.clientHeight*.42+row.offsetHeight*.5));
    if(active>=0){
      const line=lines[active],end=line.end||lines[active+1]?.time||(Number.isFinite(this.audio.duration)?this.audio.duration:line.time+8);
      const progress=Math.max(0,Math.min(1,(time-line.time)/Math.max(.1,end-line.time)));
      row.style.setProperty('--line-progress',progress);
      const words=row.querySelectorAll('.lyric-word');
      words.forEach((span,i)=>{const w=line.words[i];span.style.setProperty('--word-progress',Math.max(0,Math.min(1,(time-w.time)/Math.max(.02,w.end-w.time))));span.classList.toggle('singing',time>=w.time&&time<w.end);});
    }
  }
  wake(){if(!this.frame)this.frame=requestAnimationFrame(time=>this.tick(time));}
  tick(timestamp){
    const dt=Math.max(.4,Math.min(2,(timestamp-(this.lastTime||timestamp-16.67))/16.67));this.lastTime=timestamp;
    this.frame=0;if(document.hidden||!this.isVisible())return;
    this.sync(this.audio.currentTime);
    const held=performance.now()<this.holdUntil;
    if(!held){
      document.getElementById('lyrics-resume').hidden=true;
      const distance=this.target-this.container.scrollTop;
      if(this.reduced){this.container.scrollTop=this.target;this.velocity=0;}
      else{this.velocity=(this.velocity+distance*.085*dt)*Math.pow(.70,dt);if(Math.abs(distance)<.3&&Math.abs(this.velocity)<.15){this.container.scrollTop=this.target;this.velocity=0;}else this.container.scrollTop+=this.velocity*dt;}
    }
    if(!this.audio.paused||held||Math.abs(this.target-this.container.scrollTop)>.5||Math.abs(this.velocity)>.15)this.wake();
  }
}
window.LyricMotion=LyricMotion;
