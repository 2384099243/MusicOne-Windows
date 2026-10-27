'use strict';
const fs=require('node:fs/promises');
function createJournal(directory){
  const entries=[];
  let saving=fs.readFile(require('node:path').join(directory,'playback-diagnostics.json'),'utf8').then(text=>{const older=JSON.parse(text);if(Array.isArray(older))entries.splice(0,0,...older.slice(-160));if(entries.length>160)entries.splice(0,entries.length-160);}).catch(()=>{});
  const record=(event)=>{
    const allowed=['source','track','stage','quality','requestedQuality','platform','result','status','code','recovery'];
    const entry={time:new Date().toISOString(),...Object.fromEntries(allowed.filter(k=>event[k]!==undefined).map(k=>[k,event[k]]))};
    entries.push(entry);if(entries.length>160)entries.shift();
    saving=saving.catch(()=>{}).then(()=>fs.writeFile(require('node:path').join(directory,'playback-diagnostics.json'),JSON.stringify(entries,null,2),'utf8')).catch(()=>{});
  };
  return {record,read:()=>entries.slice()};
}
module.exports={createJournal};
