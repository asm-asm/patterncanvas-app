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
// A book page with a 24 x 30 chart (purl dashes, crosses, a shaded block), photographed at an angle on a sagging page.
const W=560,H=640,QUAD=[[62,48],[505,70],[520,598],[40,575]],rgba=photograph(24,30,20,QUAD,W,H,{shading:true,bend:.4});
const photo=await sharp(Buffer.from(rgba.buffer),{raw:{width:W,height:H,channels:4}}).jpeg({quality:92}).toBuffer();
const page=await context.newPage(),errors=[],remote=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:4175|blob:http:\/\/127\.0\.0\.1:4175\/|data:)/.test(r.url()))remote.push(r.url());});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('patterncanvas-iphone-v1')));
const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${name}.png`});};
async function photographPage(){
 await page.locator('#scan-library').setInputFiles({name:'chart.jpg',mimeType:'image/jpeg',buffer:photo});
 await page.locator('#scan-step-corners:not([hidden])').waitFor();await page.waitForTimeout(100);
 assert.equal(await page.locator('#scan-corners-error').textContent(),'','grid corners found automatically');
 await page.locator('#scan-flatten').click();await page.locator('#scan-step-grid:not([hidden])').waitFor();await page.locator('#scan-page-done:not([disabled])').waitFor();
}
try{
 await page.goto('http://127.0.0.1:4175/');await page.locator('#chart').waitFor();
 await page.locator('[data-view=settings]').click();
 await page.locator('#scan-open').click();await page.locator('#scan-dialog[open]').waitFor();
 assert.equal(await page.locator('#scan-camera').getAttribute('capture'),'environment','camera button opens the camera');
 // Corners: a swapped corner is refused with a clear message; auto fit restores it.
 await page.locator('#scan-library').setInputFiles({name:'chart.jpg',mimeType:'image/jpeg',buffer:photo});await page.locator('#scan-step-corners:not([hidden])').waitFor();await page.waitForTimeout(100);
 await shot('1-corners');
 const box=await page.locator('#scan-corners').boundingBox(),k=Math.min(box.width/W,box.height/H),ox=box.x+(box.width-W*k)/2,oy=box.y+(box.height-H*k)/2;
 await page.locator('#scan-corners').evaluate((el,[from,to])=>{const ev=(type,[x,y])=>el.dispatchEvent(new PointerEvent(type,{pointerId:5,clientX:x,clientY:y,bubbles:true,pointerType:'touch',isPrimary:true}));ev('pointerdown',from);ev('pointermove',to);ev('pointerup',to);},[[ox+QUAD[0][0]*k,oy+QUAD[0][1]*k],[ox+540*k,oy+620*k]]);
 await page.locator('#scan-flatten').click();assert.match(await page.locator('#scan-corners-error').textContent(),/順番|一直線/);
 await page.locator('#scan-detect').click();await page.locator('#scan-flatten').click();await page.locator('#scan-step-grid:not([hidden])').waitFor();await page.locator('#scan-page-done:not([disabled])').waitFor();
 // Grid: both counts read from the lines; the straightened page is shown.
 assert.equal(await page.locator('#scan-rows').inputValue(),'30');assert.equal(await page.locator('#scan-cols').inputValue(),'24');assert.match(await page.locator('#scan-detected').textContent(),/30段・24目と読み取りました/);
 await shot('2-grid');
 await page.locator('#scan-cols-more').click();assert.equal(await page.locator('#scan-cols').inputValue(),'25');await page.locator('#scan-cols-less').click();await page.locator('#scan-page-done:not([disabled])').waitFor();
 await page.locator('#scan-page-done').click();await page.locator('#scan-step-pages:not([hidden])').waitFor();
 assert.equal(await page.locator('#scan-summary').textContent(),'1ページ：24目 × 30段');
 // Symbols and colours.
 await page.locator('#scan-to-symbols').click();await page.locator('#scan-step-symbols:not([hidden])').waitFor();
 const groups=page.locator('#scan-groups .scan-group');assert.ok(await groups.count()>=3,'blank + at least two shapes');
 assert.match(await groups.first().textContent(),/記号のないマス/);assert.equal(await groups.first().locator('select').inputValue(),'');
 assert.match(await page.locator('#scan-result').textContent(),/^24目 × 30段・2色。「？」のマス/);
 // Name the two biggest shapes; the preview and the counts follow.
 await groups.nth(1).locator('select').selectOption('P');await groups.nth(2).locator('select').selectOption('TBL');
 const others=await groups.count();for(let i=3;i<others;i++)await groups.nth(i).locator('select').selectOption('P');
 assert.match(await page.locator('#scan-result').textContent(),/すべてのマスに記号が入りました/);
 assert.ok((await page.locator('#scan-preview').boundingBox()).height>200,'chart preview drawn');
 await page.locator('#scan-colour-count').selectOption('1');assert.match(await page.locator('#scan-result').textContent(),/・1色。/);assert.equal(await page.locator('#scan-colours label').count(),1);
 await page.locator('#scan-colour-count').selectOption('auto');assert.equal(await page.locator('#scan-colours label').count(),2);
 await shot('3-symbols');
 for(const [width,height] of [[320,568],[844,390],[768,1024]]){await page.setViewportSize({width,height});const b=await page.locator('#scan-start').boundingBox();assert(b&&b.x>=0&&b.x+b.width<=width,'start button on screen');}
 await page.setViewportSize({width:390,height:844});
 await page.locator('#scan-name').fill('テストのセーター');await page.locator('#scan-start').click();
 await page.locator('#scan-dialog:not([open])').waitFor({state:'attached'});
 // The result is an ordinary chart: editable cells, symbols, two yarns, the usual counter.
 let saved=await read();assert.equal(saved.name,'テストのセーター');assert.equal(saved.columns,24);assert.equal(saved.rows,30);assert.equal(saved.yarns.length,2);assert.equal(saved.scan,undefined);
 const symbols=saved.symbols.flat();assert.ok(symbols.filter(s=>s==='P').length>50&&symbols.filter(s=>s==='TBL').length>20&&!symbols.includes('UNK'));
 assert.ok(saved.cells.flat().filter(c=>c===1).length>100,'shaded block is the second yarn');
 assert(await page.locator('#chart-panel').isVisible());assert(await page.locator('#preview-panel').isVisible());
 assert.match(await page.locator('#message').textContent(),/本の編み図を取り込みました/);
 await page.locator('#complete').click();saved=await read();assert.deepEqual(saved.completedRows,[1]);
 await shot('4-chart');
 // The symbol tool offers the knitting symbols.
 assert.ok(await page.locator('#stitch-symbol option[value="RC2"]').count()===1);
 // A spread: the left page added after the right one; the counts of the second page follow the first.
 await page.locator('[data-view=settings]').click();await page.locator('#scan-open').click();await page.locator('#scan-dialog[open]').waitFor();
 await photographPage();await page.locator('#scan-page-done').click();await page.locator('#scan-step-pages:not([hidden])').waitFor();
 await page.locator('#scan-add-left').click();assert.equal(await page.locator('#scan-page-label').textContent(),'2ページ目（左のページ）');
 await photographPage();assert(await page.locator('#scan-rows').isDisabled());assert.match(await page.locator('#scan-detected').textContent(),/もう片方のページと同じ30段/);
 await page.locator('#scan-page-done').click();await page.locator('#scan-step-pages:not([hidden])').waitFor();assert.match(await page.locator('#scan-summary').textContent(),/^左右2ページ：48目 × 30段/);
 await page.locator('#scan-remove-page').click();assert.equal(await page.locator('#scan-summary').textContent(),'1ページ：24目 × 30段');
 await page.locator('#scan-add-same').click();await page.locator('#scan-step-corners:not([hidden])').waitFor();assert.equal(await page.locator('#scan-page-label').textContent(),'2ページ目（段の続き）');
 await page.locator('#scan-detect').click();await page.locator('#scan-flatten').click();await page.locator('#scan-page-done:not([disabled])').waitFor();await page.locator('#scan-page-done').click();
 assert.match(await page.locator('#scan-summary').textContent(),/30段＋30段＝60段/);
 await page.locator('#scan-cancel').click();
 // Undo returns to the converted chart after a new blank one.
 await page.locator('#new-project').click();await page.waitForTimeout(200);assert.equal((await read()).rows,20);
 await page.locator('[data-view=both]').click();await page.locator('#undo').click();await page.waitForTimeout(200);assert.equal((await read()).name,'テストのセーター');
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log('native scan UI: ok');
}finally{await browser.close();}
