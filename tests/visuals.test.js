const {test}=require('node:test');const assert=require('node:assert/strict');
const {paletteFromPixels}=require('../palette');const {parseLrc,parseQrc}=require('../lyric-parser');
test('Cover palette uses the actual dominant color and ignores transparent pixels',()=>{
  const pixels=Buffer.from([20,30,220,255,20,30,220,255,255,0,0,0]);
  const p=paletteFromPixels(pixels);assert.deepEqual(p.dominant,[220,30,20]);assert.match(p.primary,/rgb\(/);assert.notEqual(p.primary,p.accent);
});
test('Enhanced LRC retains measured word timestamps rather than inventing them',()=>{
  const lines=parseLrc('[00:01.00]<00:01.00>你<00:01.50>好\n[00:03.00]下一句');
  assert.equal(lines[0].text,'你好');assert.deepEqual(lines[0].words,[{time:1,end:1.5,text:'你'},{time:1.5,end:3,text:'好'}]);assert.equal(lines[1].words,undefined);
});
test('QRC keeps line and word durations',()=>{
  const lines=parseQrc('<Lyric_1 LyricContent="[1000,2000]你(1000,500)好(1500,700)&#10;[4000,1000]下一句(4000,1000)"/>');
  assert.equal(lines.length,2);assert.equal(lines[0].time,1);assert.equal(lines[0].end,3);assert.equal(lines[0].words[1].end,2.2);
});
