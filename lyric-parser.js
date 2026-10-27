'use strict';
function entities(s){return String(s||'').replace(/&#10;/g,'\n').replace(/&#13;/g,'\r').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
const seconds=m=>Number(m[1])*60+Number(m[2])+Number(m[3]||0)/10**(m[3]?.length||0);
function parseLrc(text){
  const lines=[];const offset=Number(String(text).match(/\[offset:([+-]?\d+)\]/i)?.[1]||0)/1000;
  for(const raw of String(text).split(/\r?\n/)){
    const stamps=[...raw.matchAll(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    const body=entities(raw.replace(/\[[^\]]*\]/g,''));
    const markers=[...body.matchAll(/<(\d+):(\d{1,2})(?:[.:](\d{1,3}))?>/g)];
    const clean=body.replace(/<[^>]*>/g,'').trim();if(!clean)continue;
    const words=markers.map((m,i)=>({time:Math.max(0,seconds(m)+offset),end:markers[i+1]?Math.max(0,seconds(markers[i+1])+offset):null,text:body.slice(m.index+m[0].length,markers[i+1]?.index??body.length)})).filter(w=>w.text);
    for(const m of stamps){const line={time:Math.max(0,seconds(m)+offset),text:clean};if(words.length)line.words=words;lines.push(line);}
  }
  lines.sort((a,b)=>a.time-b.time);
  lines.forEach((line,i)=>{if(line.words?.length){const last=line.words.at(-1);if(last.end===null)last.end=lines[i+1]?.time??last.time+1;}});
  return lines;
}
function parseQrc(raw){
  let content=String(raw||'');const xml=content.match(/LyricContent="([\s\S]*?)"\s*\/?\s*>/);if(xml)content=xml[1];content=entities(content);
  const lines=[];
  for(const line of content.split(/\r?\n/)){
    const match=/^\[(\d+),(\d+)\](.*)$/.exec(line.trim());if(!match)continue;
    const words=[];let cursor=0;
    for(const m of match[3].matchAll(/\((\d+),(\d+)\)/g)){const text=match[3].slice(cursor,m.index);if(text)words.push({time:Number(m[1])/1000,end:(Number(m[1])+Number(m[2]))/1000,text});cursor=m.index+m[0].length;}
    const text=match[3].replace(/\(\d+,\d+\)/g,'').trim();if(!text||text==='//')continue;
    lines.push({time:Number(match[1])/1000,end:(Number(match[1])+Number(match[2]))/1000,text,words});
  }
  return lines.sort((a,b)=>a.time-b.time);
}
module.exports={parseLrc,parseQrc};
