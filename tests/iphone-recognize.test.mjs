import test from 'node:test';import assert from 'node:assert/strict';
import {rectify,grayscale} from '../docs/iphone/app/scan-model.mjs';
import {analyzeGrid,fitGrid,buildMesh,readCells,outsideCells,groupShapes,spanReader} from '../docs/iphone/app/chart-convert.mjs';
import {recognize,classifyCell,classifyCable,purlUnder,gridLinesOnly} from '../docs/iphone/app/recognize.mjs';
import {cableStrands,mirrorStitch,PURLED,stitchDef} from '../docs/iphone/app/stitches.mjs';
import {photographSymbols,truthCode} from './scan-fixture.mjs';

// A printed symbol chart (purl, yarn over, decreases, slipped and twisted stitches, bind-off, 1- and 2-stitch cables
// both ways), photographed at an angle on a sagging page, read with no help from the user.
const COLS=32,ROWS=20,CELL=22,W=760,H=520,QUAD=[[40,40],[720,52],[728,486],[30,470]];
const page=(()=>{
 const photo=photographSymbols(COLS,ROWS,CELL,QUAD,W,H,{bend:.4}),flat=rectify(photo,W,H,QUAD);
 const a=analyzeGrid(grayscale(flat.data,flat.width,flat.height),flat.width,flat.height,flat.grid);
 const mesh=buildMesh(fitGrid(a,ROWS,COLS)),cells=readCells(flat.data,flat.width,flat.height,mesh,ROWS,COLS),outside=outsideCells(cells,ROWS,COLS);
 const codes=recognize(cells,ROWS,COLS,outside,{groups:groupShapes(cells,outside),span:spanReader(flat.data,flat.width,flat.height,mesh,COLS,cells)});
 return {a,cells,codes};
})();
const truth=k=>{const c=page.cells[k];return truthCode(c.c,ROWS-1-c.r,COLS);};

test('symbols are read automatically: almost every cell matches the printed chart',()=>{
 assert.equal(page.a.rows.rows,ROWS);assert.equal(page.a.cols.rows,COLS);
 let right=0;const wrong=new Map();page.codes.forEach((code,k)=>{if(code===truth(k))right++;else{const key=`${truth(k)}→${code}`;wrong.set(key,(wrong.get(key)||0)+1);}});
 assert.ok(right/page.codes.length>=.97,`${right}/${page.codes.length} ${JSON.stringify([...wrong])}`);
});

test('cables: right-over and left-over are told apart, every part in place',()=>{
 let cables=0,right=0;page.codes.forEach((code,k)=>{const t=truth(k);if(t&&t.includes('@')){cables++;if(code===t)right++;}});
 assert.ok(cables>=40);assert.equal(right,cables,'every cable cell, direction included');
 assert.ok(page.codes.some(c=>c==='RC2@0')&&page.codes.some(c=>c==='LC2@3')&&page.codes.some(c=>c==='RC1@1')&&page.codes.some(c=>c==='LC1@0'));
});

test('single symbols each come out as themselves',()=>{
 for(const code of ['P','YO','K2TOG','SSK','SL','BO','TBL']){let n=0,ok=0;page.codes.forEach((c,k)=>{if(truth(k)===code){n++;if(c===code)ok++;}});assert.ok(n>0&&ok/n>=.85,`${code}: ${ok}/${n}`);}
});

test('cable geometry: 右上 means the right-hand group crosses on top to the left',()=>{
 const rc=cableStrands('RC1'),lc=cableStrands('LC1');
 assert.deepEqual(rc.over,[[1.5,.5]]);assert.deepEqual(rc.under,[[.5,1.5]]);assert.deepEqual(lc.over,[[.5,1.5]]);
 assert.deepEqual(cableStrands('RC21').over,[[1.5,.5],[2.5,1.5]],'右上2目と1目: the two right stitches on top');
 assert.equal(mirrorStitch('RC21@0'),'LC21@2');assert.equal(mirrorStitch('RC12P@1'),'LC12P@1');
 for(const [plain,purled] of Object.entries(PURLED))assert.equal(stitchDef(plain).width,stitchDef(purled).width);
});

// A cable drawn straight into a sampler: strands as lines, the ones underneath broken in the middle.
const drawn=(code,{gap=.16,bar=false}={})=>{const g=cableStrands(code),seg=(x,y,[x0,x1])=>{const ax=x0,ay=.86,bx=x1,by=.14,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return [Math.hypot(x-ax-t*dx,y-ay-t*dy),t];};
 return (x,y)=>{if(Math.abs(x-Math.round(x))<.06||y<.07||y>.93)return null;for(const s of g.over)if(seg(x,y,s)[0]<.05)return 1;for(const s of g.under){const [d,t]=seg(x,y,s);if(d<.05&&Math.abs(t-.5)>gap)return 1;}
  if(bar)for(const [x0] of g.under)if(Math.abs(y-.86)<.03&&Math.abs(x-x0)<.2)return 1;return 0;};};

test('every cable is recognised from its drawing, with or without purl bars',()=>{
 for(const code of ['RC1','LC1','RC2','LC2','RC21','LC21','RC12','LC12','RC3','LC3','RC4','LC4']){
  const w=stitchDef(code).width,found=classifyCable(drawn(code),w);assert.equal(found.code,code,`${code} read as ${found.code}`);
  if(PURLED[code]){assert.ok(purlUnder(drawn(code,{bar:true}),code)>.2,`${code} with bars`);assert.ok(purlUnder(drawn(code),code)<.15,`${code} without bars`);}
 }
});

test('grid lines inside a cell and faint paper are knit, not unknown symbols',()=>{
 const N=16,make=f=>Float32Array.from({length:N*N},(_,k)=>f(k%N,Math.floor(k/N)));
 assert.equal(gridLinesOnly(make((i)=>i===4?1:0)),true,'one upright line');
 assert.equal(gridLinesOnly(make((i,j)=>i===Math.round(3+j*.2)||j===13?1:0)),true,'a slanted line and a level one (a corner)');
 assert.equal(gridLinesOnly(make((i,j)=>j===8&&i>4&&i<11?1:0)),false,'a purl dash is a symbol');
 assert.equal(classifyCell(make((i)=>i===2?1:0)).code,null);assert.equal(classifyCell(make(()=>.3)).code,null,'faint all over');
 assert.equal(classifyCell(make((i,j)=>(i*7+j*3)%5===0?1:0)).code,'UNK','a scribble matches nothing');
});
