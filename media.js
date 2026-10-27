'use strict';
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {Readable}=require('node:stream');
const path=require('node:path');
const MIME={'.wav':'audio/wav','.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.mp4':'video/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.opus':'audio/ogg','.webm':'audio/webm'};
function parseRange(header,size){
  if(!header)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if(!match||(!match[1]&&!match[2])||size<=0)return false;
  let start,end;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return false;start=Math.max(0,size-suffix);end=size-1;}
  else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start<0||end<start)return false;
  return {start,end};
}
async function localMediaResponse(file,request){
  const {size}=await fs.stat(file);
  const range=parseRange(request.headers.get('range'),size);
  if(range===false)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  const start=range?.start||0,end=range?.end??size-1;
  const headers={'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':String(range?end-start+1:size),'Accept-Ranges':'bytes','Cache-Control':'no-store'};
  if(range)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
  const body=request.method==='HEAD'||size===0?null:Readable.toWeb(createReadStream(file,{start,end}));
  return new Response(body,{status:range?206:200,headers});
}
module.exports={parseRange,localMediaResponse};
