'use strict';
function paletteFromPixels(bytes,order='bgra'){
  const bins=new Map();
  for(let i=0;i+3<bytes.length;i+=4){
    const r=bytes[i+(order==='bgra'?2:0)],g=bytes[i+1],b=bytes[i+(order==='bgra'?0:2)],a=bytes[i+3];
    const max=Math.max(r,g,b),min=Math.min(r,g,b);if(a<160||max<18||min>238)continue;
    const key=(r>>4)*256+(g>>4)*16+(b>>4);const weight=1+(max-min)/100;const bin=bins.get(key)||{r:0,g:0,b:0,w:0};
    bin.r+=r*weight;bin.g+=g*weight;bin.b+=b*weight;bin.w+=weight;bins.set(key,bin);
  }
  const colors=[...bins.values()].sort((a,b)=>b.w-a.w).map(v=>[v.r/v.w,v.g/v.w,v.b/v.w]);
  const first=colors[0]||[68,122,101];
  const second=colors.find(c=>Math.hypot(...c.map((v,i)=>v-first[i]))>75)||[first[1],first[2],first[0]];
  const dark=c=>c.map(v=>Math.round(Math.max(12,Math.min(95,v*.35+10))));
  const rgb=c=>`rgb(${c.map(Math.round).join(',')})`;
  return {primary:rgb(dark(first)),secondary:rgb(dark(second)),accent:rgb(first.map(v=>Math.min(245,v*.55+110))),dominant:first.map(Math.round)};
}
module.exports={paletteFromPixels};
