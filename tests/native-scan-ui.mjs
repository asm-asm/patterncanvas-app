import {webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {photograph} from './scan-fixture.mjs';
const shots=process.env.SCAN_SHOTS;
const browser=await webkit.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.route('**/platform.mjs',route=>route.fulfill({contentType:'text/javascript',body:`
export const native=true;
export const getPurchaseStatus=async()=>({state:'purchased',products:[],now:Date.now()});
export const readProject=()=>localStorage.getItem('patterncanvas-iphone-v1');
export const writeProject=data=>{localStorage.setItem('patterncanvas-iphone-v1',data);window.nativeSaves=(window.nativeSaves||0)+1;};
export const readLock=()=>localStorage.getItem('native-lock')==='true';
export const writeLock=value=>localStorage.setItem('native-lock',String(value));
export const rowCompleted=()=>window.haptics=(window.haptics||0)+1;
export const exportProject=async(data,name)=>{window.shared={data,name};};
export const prepareOffline=()=>document.querySelector('#offline-state').textContent='初回からオフラインで使えます';
`}));
// A book page with a 24 x 30 chart, photographed at an angle.
const W=560,H=640,QUAD=[[62,48],[505,70],[520,598],[40,575]],rgba=photograph(24,30,20,QUAD,W,H);
const photo=await sharp(Buffer.from(rgba.buffer),{raw:{width:W,height:H,channels:4}}).jpeg({quality:92}).toBuffer();
const page=await context.newPage(),errors=[],remote=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:4175|blob:http:\/\/127\.0\.0\.1:4175\/|data:)/.test(r.url()))remote.push(r.url());});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('patterncanvas-iphone-v1')));
const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${name}.png`});};
async function photographPage(){
 await page.locator('#scan-library').setInputFiles({name:'chart.jpg',mimeType:'image/jpeg',buffer:photo});
 await page.locator('#scan-step-corners:not([hidden])').waitFor();await page.waitForTimeout(100);
 assert.equal(await page.locator('#scan-corners-error').textContent(),'','grid corners found automatically');
}
try{
 await page.goto('http://127.0.0.1:4175/');await page.locator('#chart').waitFor();
 await page.locator('[data-view=settings]').click();
 await page.locator('#scan-open').click();await page.locator('#scan-dialog[open]').waitFor();
 assert.equal(await page.locator('#scan-page-label').textContent(),'1ページ目');
 assert.equal(await page.locator('#scan-camera').getAttribute('capture'),'environment','camera button opens the camera');
 await photographPage();await shot('1-corners');
 // Dragging the top-left handle past the bottom-right corner is refused with a clear message; auto fit restores it.
 const box=await page.locator('#scan-corners').boundingBox(),k=Math.min(box.width/W,box.height/H),ox=box.x+(box.width-W*k)/2,oy=box.y+(box.height-H*k)/2;
 const drag=async(from,to)=>page.locator('#scan-corners').evaluate((el,[from,to])=>{const ev=(type,[x,y])=>el.dispatchEvent(new PointerEvent(type,{pointerId:5,clientX:x,clientY:y,bubbles:true,pointerType:'touch',isPrimary:true}));ev('pointerdown',from);ev('pointermove',[(from[0]+to[0])/2,(from[1]+to[1])/2]);ev('pointermove',to);ev('pointerup',to);},[from,to]);
 await drag([ox+QUAD[0][0]*k,oy+QUAD[0][1]*k],[ox+540*k,oy+620*k]);
 await page.locator('#scan-flatten').click();assert.match(await page.locator('#scan-corners-error').textContent(),/順番|一直線/);
 await page.locator('#scan-detect').click();assert.match(await page.locator('#scan-corners-error').textContent(),/合わせました/);
 await page.locator('#scan-flatten').click();await page.locator('#scan-step-rows:not([hidden])').waitFor();
 assert.equal(await page.locator('#scan-rows').inputValue(),'30','30 rows read from the grid lines');assert.match(await page.locator('#scan-detected').textContent(),/30段と読み取りました/);
 await shot('2-rows');
 await page.locator('#scan-rows-more').click();assert.equal(await page.locator('#scan-rows').inputValue(),'31');await page.locator('#scan-rows-less').click();
 await page.locator('#scan-page-done').click();await page.locator('#scan-step-done:not([hidden])').waitFor();
 assert.equal(await page.locator('#scan-summary').textContent(),'1ページ・30段');
 // The right-hand page of the spread: same rows, so the count is fixed to the left page.
 await page.locator('#scan-add-side').click();assert.equal(await page.locator('#scan-page-label').textContent(),'2ページ目（右のページ）');
 await photographPage();await page.locator('#scan-flatten').click();await page.locator('#scan-step-rows:not([hidden])').waitFor();
 assert.equal(await page.locator('#scan-rows').inputValue(),'30');assert(await page.locator('#scan-rows').isDisabled());
 await page.locator('#scan-page-done').click();await page.locator('#scan-step-done:not([hidden])').waitFor();
 assert.match(await page.locator('#scan-summary').textContent(),/^左右2ページ・30段/);assert(await page.locator('#scan-add-page').isHidden());
 await shot('3-done');
 for(const [width,height] of [[320,568],[844,390],[768,1024]]){await page.setViewportSize({width,height});const b=await page.locator('#scan-start').boundingBox();assert(b&&b.x>=0&&b.x+b.width<=width,'start button on screen');}
 await page.setViewportSize({width:390,height:844});
 await page.locator('#scan-name').fill('テストのセーター');await page.locator('#scan-start').click();
 await page.locator('#scan-dialog:not([open])').waitFor({state:'attached'});
 // Counting on the photo.
 assert(await page.locator('#scan-panel').isVisible());assert(await page.locator('#chart-panel').isHidden());assert(await page.locator('#preview-panel').isHidden());
 assert.equal(await page.locator('#completed').textContent(),'完了 0 / 30段');assert.equal(await page.locator('#project-name').textContent(),'テストのセーター');
 await page.locator('#complete').click();await page.locator('#complete').click();await page.waitForTimeout(100);
 let saved=await read();assert.equal(saved.currentRow,3);assert.deepEqual(saved.completedRows,[1,2]);assert.equal(saved.scan.join,'side');assert.equal(saved.scan.pages.length,2);assert.match(saved.scan.pages[0].image,/^data:image\/jpeg;base64,/);
 assert.equal(await page.evaluate(()=>window.haptics),2);
 await shot('4-counter');
 // Tap the gutter row numbers to choose a row; drags and taps on the photo never change the row.
 await page.locator('#scan-chart').evaluate(e=>e.scrollIntoView({block:'center'}));await page.waitForTimeout(100);const chart=await page.locator('#scan-chart').boundingBox();
 await page.touchscreen.tap(chart.x+chart.width/2,chart.y+chart.height/2);await page.waitForTimeout(100);assert.equal((await read()).currentRow,3,'tapping the photo keeps the row');
 const rowAt=async y=>{await page.touchscreen.tap(chart.x+20,y);await page.waitForTimeout(100);return (await read()).currentRow;};
 assert.equal(await page.locator('#scan-zoom-label').textContent()!=='100%',true,'counting view is zoomed in past the whole-spread view');
 const upper=await rowAt(chart.y+chart.height*.3),lower=await rowAt(chart.y+chart.height*.7);
 assert(upper>lower,`a higher row number sits higher on the page (${upper} > ${lower})`);
 assert.equal(await page.locator('#choose-row').evaluate(e=>e.firstChild.textContent),String(lower));
 // Zoom buttons and pinch.
 const zoom0=await page.locator('#scan-zoom-label').textContent();await page.locator('#scan-zoom-in').click();assert.notEqual(await page.locator('#scan-zoom-label').textContent(),zoom0);
 await page.locator('#scan-fit').click();assert.equal(await page.locator('#scan-zoom-label').textContent(),'100%');
 // Settings hide what a photo cannot use.
 await page.locator('[data-view=settings]').click();
 assert(await page.locator('#apply-repeats').isHidden());assert(await page.locator('#print-open').isHidden());assert(await page.locator('#yarn-list').isHidden());assert(await page.locator('[data-view=preview]').isHidden());
 assert(await page.locator('.scan-only').isVisible());
 // Restart: the photo project comes back as it was.
 await page.reload();await page.locator('body.scan-mode').waitFor({state:'attached'});assert.equal(await page.locator('#scan-panel').getAttribute('hidden'),null);
 assert.equal(await page.locator('#completed').textContent(),'完了 2 / 30段');
 await page.locator('[data-view=both]').click();await page.waitForTimeout(300);await shot('5-reloaded');
 // A normal chart from the settings brings the editor back.
 await page.locator('[data-view=settings]').click();await page.locator('#new-project').click();await page.waitForTimeout(200);
 assert(await page.locator('#chart-panel').isVisible());assert(await page.locator('#scan-panel').isHidden());assert.equal((await read()).scan,undefined);
 // A second project: the left page added after the right one goes first; a block above in the same photo continues the rows.
 await page.locator('[data-view=settings]').click();await page.locator('#scan-open').click();await page.locator('#scan-dialog[open]').waitFor();
 await photographPage();await page.locator('#scan-flatten').click();await page.locator('#scan-step-rows:not([hidden])').waitFor();await page.locator('#scan-rows').fill('30');await page.locator('#scan-page-done').click();
 await page.locator('#scan-step-done:not([hidden])').waitFor();assert(await page.locator('#scan-add-same').isVisible());
 await page.locator('#scan-add-same').click();await page.locator('#scan-step-corners:not([hidden])').waitFor();assert.equal(await page.locator('#scan-page-label').textContent(),'2ページ目（段の続き）');
 await page.locator('#scan-detect').click();await page.locator('#scan-flatten').click();await page.locator('#scan-step-rows:not([hidden])').waitFor();assert(!await page.locator('#scan-rows').isDisabled());
 await page.locator('#scan-rows').fill('30');await page.locator('#scan-page-done').click();await page.locator('#scan-step-done:not([hidden])').waitFor();
 assert.match(await page.locator('#scan-summary').textContent(),/30段＋30段＝60段/);
 await page.locator('#scan-remove-page').click();assert.equal(await page.locator('#scan-summary').textContent(),'1ページ・30段');
 await page.locator('#scan-add-left').click();assert.equal(await page.locator('#scan-page-label').textContent(),'2ページ目（左のページ）');
 await photographPage();await page.locator('#scan-flatten').click();await page.locator('#scan-step-rows:not([hidden])').waitFor();assert.match(await page.locator('#scan-detected').textContent(),/もう片方のページと同じ30段/);
 await page.locator('#scan-page-done').click();await page.locator('#scan-step-done:not([hidden])').waitFor();assert.match(await page.locator('#scan-summary').textContent(),/^左右2ページ/);
 await page.locator('#scan-start').click();await page.waitForTimeout(200);
 const left=(await read()).scan;assert.equal(left.join,'side');assert.equal(left.pages.length,2);assert.ok(left.pages.every(pg=>pg.strips.length>=4&&pg.lines.length===pg.strips.length&&pg.lines.every(ys=>ys.length===31)),'rows tracked in strips');
 await page.locator('[data-view=settings]').click();await page.locator('#new-project').click();await page.waitForTimeout(200);
 // Undo goes back to the photo project.
 await page.locator('#undo').click();await page.waitForTimeout(200);assert(await page.locator('#scan-panel').isVisible());assert.equal((await read()).scan.pages.length,2);
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log('native scan UI: ok');
}finally{await browser.close();}
