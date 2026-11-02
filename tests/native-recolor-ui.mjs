import {webkit} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await webkit.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.route('**/platform.mjs',route=>route.fulfill({contentType:'text/javascript',body:`
export const native=true;
export const getPurchaseStatus=async()=>({state:localStorage.getItem('state')||'purchased',products:[],now:Date.now()});
export const readProject=()=>localStorage.getItem('patterncanvas-iphone-v1');
export const writeProject=data=>localStorage.setItem('patterncanvas-iphone-v1',data);
export const readLock=()=>localStorage.getItem('native-lock')==='true';
export const writeLock=value=>localStorage.setItem('native-lock',String(value));
export const rowCompleted=()=>{};export const exportProject=async()=>{};export const exportFile=async()=>{};export const prepareOffline=()=>{};
`}));
await context.addInitScript(()=>localStorage.setItem('patterncanvas-guide-done','1'));
const page=await context.newPage(),errors=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('patterncanvas-iphone-v1')));
const color=async id=>(await read()).yarns.find(y=>y.id===id).color;
try{
 await page.goto('http://127.0.0.1:4175/');await page.locator('#chart').waitFor({state:'attached'});
 await page.locator('[data-view=settings]').click();await page.locator('#name').fill('配色テスト');await page.locator('#name').blur();await page.waitForFunction(()=>localStorage.getItem('patterncanvas-iphone-v1'));
 await page.locator('[data-view=chart]').click();
 // Palette: pick the second yarn (sage in the sample), change its colour from 「この色を変更」.
 const yarns=(await read()).yarns,cells=JSON.stringify((await read()).cells),second=yarns[1];
 await page.locator('#palette button').nth(1).click();assert(await page.locator('#recolor-row').isVisible());
 assert.equal(await page.inputValue('#yarn-recolor'),second.color);
 await page.locator('#yarn-recolor').fill('#c0392b');await page.locator('#yarn-recolor').dispatchEvent('change');
 assert.equal(await color(second.id),'#c0392b');assert.equal(JSON.stringify((await read()).cells),cells,'cells keep their yarn');
 assert.equal(await page.locator('#palette button').nth(1).evaluate(b=>getComputedStyle(b).getPropertyValue('--swatch').trim()),'#c0392b');
 await page.locator('#undo').click();assert.equal(await color(second.id),second.color,'undo restores the colour');
 await page.locator('#redo').click();assert.equal(await color(second.id),'#c0392b');
 // Settings: tap the background yarn's swatch.
 await page.locator('[data-view=settings]').click();const swatch=page.locator('#yarn-list .yarn-swatch').first();
 assert.equal(await swatch.inputValue(),yarns[0].color);await swatch.fill('#fdfdfd');await swatch.dispatchEvent('change');assert.equal(await color(yarns[0].id),'#fdfdfd');
 await page.locator('[data-view=chart]').click();await page.locator('#palette button').first().click();assert.equal(await page.inputValue('#yarn-recolor'),'#fdfdfd','palette follows the settings change');
 // Locked chart: no recolouring.
 await page.locator('#chart-lock').click();assert(await page.locator('#recolor-row').isHidden());
 await page.locator('[data-view=settings]').click();assert(await swatch.isDisabled());
 await page.locator('[data-view=chart]').click();await page.locator('#chart-lock').click();
 // After the trial: the controls are disabled and a forced change is ignored.
 await page.evaluate(()=>localStorage.setItem('state','expired'));await page.reload();await page.locator('#chart').waitFor({state:'attached'});
 await page.waitForTimeout(500);if(await page.locator('#access-dialog[open]').count())await page.locator('#access-later').click();
 await page.locator('[data-view=settings]').click();assert(await page.locator('#yarn-list .yarn-swatch').first().isDisabled());assert(await page.locator('#yarn-recolor').isDisabled());
 await page.locator('#yarn-recolor').evaluate(e=>{e.disabled=false;e.value='#000000';e.dispatchEvent(new Event('change'));});assert.notEqual(await color((await read()).yarns[0].id),'#000000');
 // Narrow and landscape: the control stays on screen.
 await page.evaluate(()=>localStorage.setItem('state','purchased'));await page.reload();await page.locator('#chart').waitFor({state:'attached'});await page.locator('[data-view=chart]').click();
 for(const [w,h] of [[320,568],[844,390]]){await page.setViewportSize({width:w,height:h});const b=await page.locator('#yarn-recolor').boundingBox();assert(b&&b.x>=0&&b.x+b.width<=w,`visible at ${w}x${h}`);}
 assert.deepEqual(errors,[]);console.log('PASS yarn recolour: palette and settings, all cells follow, undo/redo, lock, after trial, small screens');
}finally{await browser.close();}
