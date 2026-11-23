import {webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {photograph} from './scan-fixture.mjs';
import {omissionPhoto,OMIT} from './omission-fixture.mjs';
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
 // Read automatically: knit and purl come out as such; the fixture's one-cell 「×」 is no Japanese symbol, so it is listed
 // as an unread shape, to be named once.
 const kinds=page.locator('#scan-groups .scan-group');assert.match(await page.locator('#scan-symbols-summary').textContent(),/自動で読み取りました/);
 assert.match(await kinds.first().textContent(),/記号なし（表目）/);assert.equal(await kinds.first().locator('select').inputValue(),'');
 const purl=kinds.filter({hasText:'裏目（'});assert.equal(await purl.count(),1);assert.equal(await purl.locator('select').inputValue(),'P');
 assert.match(await page.locator('#scan-result').textContent(),/^24目 × 30段・2色。「？」のマス/);
 const unknown=page.locator('#scan-groups .scan-unknown');assert.ok(await unknown.count()>=1,'the crosses are an unread shape');
 for(let i=await unknown.count()-1;i>=0;i--)await unknown.nth(i).locator('select').selectOption('TBL');
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
 const symbols=saved.symbols.flat();assert.ok(symbols.filter(s=>s==='P').length>50,'purl read automatically');assert.ok(symbols.filter(s=>s==='TBL').length>20,'the named shape');assert.ok(!symbols.includes('UNK'));
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
 // Rows left out in the middle of a ribbing: the band is found, the row numbers predict 9 rows, and they are filled.
 const om=await omissionPhoto();
 await page.locator('#scan-open').click();await page.locator('#scan-dialog[open]').waitFor();
 await page.locator('#scan-library').setInputFiles({name:'rib.jpg',mimeType:'image/jpeg',buffer:om.jpeg});await page.locator('#scan-step-corners:not([hidden])').waitFor();await page.waitForTimeout(200);
 // Find the four yellow handles on the canvas and drag each onto a corner of the whole frame (both blocks).
 const handles=await page.locator('#scan-corners').evaluate(el=>{const g=el.getContext('2d'),d=g.getImageData(0,0,el.width,el.height).data,pts=[];
  for(let y=0;y<el.height;y+=2)for(let x=0;x<el.width;x+=2){const i=(y*el.width+x)*4;if(d[i]>235&&d[i+1]>200&&d[i+2]<80)pts.push([x,y]);}
  // A handle is a ring: the densest yellow spots (the frame's outline is a thin line), four of them far apart.
  const dense=pts.map(p=>({p,n:pts.filter(q=>Math.abs(q[0]-p[0])<14&&Math.abs(q[1]-p[1])<14).length})).sort((a,b)=>b.n-a.n),picked=[];
  for(const {p} of dense){if(picked.every(q=>Math.hypot(q[0]-p[0],q[1]-p[1])>60))picked.push(p);if(picked.length===4)break;}
  // Centre each on the yellow pixels around it.
  const r=el.getBoundingClientRect(),k=r.width/el.width;return picked.map(p=>{const near=pts.filter(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<16);return [r.x+near.reduce((s,q)=>s+q[0],0)/near.length*k,r.y+near.reduce((s,q)=>s+q[1],0)/near.length*k];});});
 const cbox=await page.locator('#scan-corners').boundingBox(),ck=Math.min(cbox.width/om.width,cbox.height/om.height),cox=cbox.x+(cbox.width-om.width*ck)/2,coy=cbox.y+(cbox.height-om.height*ck)/2;
 const targets=om.quad.map(([x,y])=>[cox+x*ck,coy+y*ck]),cx=handles.reduce((s,h)=>s+h[0],0)/4,cy=handles.reduce((s,h)=>s+h[1],0)/4;
 const order=[h=>h[0]<cx&&h[1]<cy,h=>h[0]>=cx&&h[1]<cy,h=>h[0]>=cx&&h[1]>=cy,h=>h[0]<cx&&h[1]>=cy];
 for(let i=0;i<4;i++){const from=handles.find(order[i]);await page.locator('#scan-corners').evaluate((el,[from,to])=>{const ev=(type,[x,y])=>el.dispatchEvent(new PointerEvent(type,{pointerId:7,clientX:x,clientY:y,bubbles:true,pointerType:'touch',isPrimary:true}));ev('pointerdown',from);ev('pointermove',to);ev('pointerup',to);},[from,targets[i]]);}
 await page.locator('#scan-flatten').click();await page.locator('#scan-step-grid:not([hidden])').waitFor();await page.locator('#scan-page-done:not([disabled])').waitFor();
 assert.match(await page.locator('#scan-detected').textContent(),/段の省略が1か所/);assert(await page.locator('#scan-rows-step').isHidden());
 assert.equal(await page.locator('#scan-block-rows-1').inputValue(),String(OMIT.upper));assert.equal(await page.locator('#scan-block-rows-0').inputValue(),String(OMIT.lower));
 assert.equal(await page.locator('#scan-omit-0').inputValue(),'9');assert.match(await page.locator('#scan-omit-note-0').textContent(),/9段と予測/);
 await shot('5-omission');
 await page.locator('#scan-page-done').click();await page.locator('#scan-step-pages:not([hidden])').waitFor();assert.match(await page.locator('#scan-summary').textContent(),/20目 × 20段。省略された9段を含みます/);
 await page.locator('#scan-to-symbols').click();await page.locator('#scan-step-symbols:not([hidden])').waitFor();
 await page.locator('#scan-colour-count').selectOption('1');await page.locator('#scan-name').fill('ゴム編み');await page.locator('#scan-start').click();await page.waitForTimeout(300);
 const rib=await read();assert.equal(rib.rows,20);assert.equal(rib.columns,OMIT.cols);
 const pattern=r=>rib.symbols[r].map(s=>s??'.').join('');assert.ok(pattern(0).includes('P'),'purl in the ribbing');
 for(let r=1;r<20;r++)assert.equal(pattern(r),pattern(0),`row ${r+1} is the same 1x1 ribbing (rows 6-14 filled in)`);
 await page.locator('[data-view=settings]').click();
 // Undo returns to the converted chart after a new blank one.
 await page.locator('#new-project').click();await page.waitForTimeout(200);assert.equal((await read()).rows,20);
 await page.locator('[data-view=both]').click();await page.locator('#undo').click();await page.waitForTimeout(200);assert.equal((await read()).name,'ゴム編み');
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log('native scan UI: ok');
}finally{await browser.close();}
