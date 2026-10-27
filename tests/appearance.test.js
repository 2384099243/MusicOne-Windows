const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {createAppearanceController,normalizePreference}=require('../appearance');
class FakeTheme extends EventEmitter{
  systemDark=false;source='system';
  get themeSource(){return this.source;}
  set themeSource(value){this.source=value;this.emit('updated');}
  get shouldUseDarkColors(){return this.source==='system'?this.systemDark:this.source==='dark';}
  changeSystem(dark){this.systemDark=dark;this.emit('updated');}
}
test('System is the default and follows Windows updates while the app stays open',()=>{
  const native=new FakeTheme(),updates=[];const controller=createAppearanceController(native,undefined,value=>updates.push(value));
  assert.deepEqual(controller.snapshot(),{preference:'system',resolved:'light'});native.changeSystem(true);assert.deepEqual(updates.at(-1),{preference:'system',resolved:'dark'});native.changeSystem(false);assert.equal(updates.at(-1).resolved,'light');controller.dispose();
});
test('Manual overrides survive system changes and switching back to system resumes following',()=>{
  const native=new FakeTheme(),updates=[];native.systemDark=true;
  const controller=createAppearanceController(native,'light',value=>updates.push(value));assert.equal(controller.snapshot().resolved,'light');native.changeSystem(false);native.changeSystem(true);assert.equal(controller.snapshot().resolved,'light');
  controller.set('dark');assert.equal(controller.snapshot().resolved,'dark');native.changeSystem(false);assert.equal(controller.snapshot().resolved,'dark');controller.set('system');assert.equal(controller.snapshot().resolved,'light');controller.dispose();
});
test('Old or invalid saved preferences migrate to following the system',()=>{
  assert.equal(normalizePreference(null),'system');assert.equal(normalizePreference('unexpected'),'system');const native=new FakeTheme();native.systemDark=true;const controller=createAppearanceController(native,'invalid');assert.deepEqual(controller.snapshot(),{preference:'system',resolved:'dark'});controller.dispose();
});
