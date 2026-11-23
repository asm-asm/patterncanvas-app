import test from 'node:test';import assert from 'node:assert/strict';
import {homography,checkQuad,flatSize,rectify,grayscale,lineProfile,estimateRows,fitLines,analyzePage,fitPage,linesAt,detectGrid,insetQuad,SCAN_MARGIN} from '../docs/iphone/app/scan-model.mjs';

import {photograph,bulge} from './scan-fixture.mjs';

const QUAD=[[62,48],[505,70],[520,598],[40,575]];
function flatten(rgba,w,h,quad){const flat=rectify(rgba,w,h,quad),gray=grayscale(flat.data,flat.width,flat.height),g=flat.grid,
 profile=lineProfile(gray,flat.width,flat.height,flat.width*(g.left+.01),flat.width*(g.right-.01));
 return {flat,gray,profile,top:g.top*flat.height,bottom:g.bottom*flat.height};}

test('homography maps the unit square onto the quad corners',()=>{const map=homography(QUAD);
 [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const [x,y]=map(u,v);assert.ok(Math.abs(x-QUAD[i][0])<1e-6&&Math.abs(y-QUAD[i][1])<1e-6);});
 const [x,y]=homography([[0,0],[10,0],[10,20],[0,20]])(.5,.5);assert.deepEqual([x,y],[5,10],'a rectangle is affine');});

test('corners must be convex, in reading order and not tiny',()=>{
 assert.doesNotThrow(()=>checkQuad(QUAD,600,650));
 assert.throws(()=>checkQuad([QUAD[1],QUAD[0],QUAD[3],QUAD[2]],600,650),/順番/);
 assert.throws(()=>checkQuad([[0,0],[10,0],[10,10],[0,10]],600,650),/小さすぎ/);
 assert.throws(()=>checkQuad([[0,0],[100,0],[200,0],[0,100]],600,650),/一直線/);});

test('flattening keeps the grid proportions and a margin for the book’s row numbers',()=>{
 const size=flatSize([[0,0],[400,0],[400,200],[0,200]]);assert.equal(size.width,Math.round(400*(1+2*SCAN_MARGIN.x)));assert.equal(size.height,Math.round(200*(1+2*SCAN_MARGIN.y)));
 assert.ok(Math.abs(size.grid.left*size.width-48)<1&&Math.abs(size.grid.top*size.height-12)<1);
 const big=flatSize([[0,0],[4000,0],[4000,3000],[0,3000]]);assert.ok(Math.max(big.width,big.height)<=2400,'long side capped');});

test('a tilted, perspective photo is flattened so the grid lines become horizontal',()=>{
 const w=560,h=640,rows=30,photo=photograph(24,rows,20,QUAD,w,h),{flat,profile,top,bottom}=flatten(photo,w,h,QUAD);
 // Every true boundary (evenly spaced in the flattened grid) carries a strong line.
 const pitch=(bottom-top)/rows,mean=profile.reduce((a,b)=>a+b,0)/profile.length;
 for(let i=0;i<=rows;i++){const y=Math.round(top+pitch*i);assert.ok(Math.max(profile[y-1],profile[y],profile[y+1])>mean*2.5,`line ${i} found after flattening`);}
 assert.equal(flat.data.length,flat.width*flat.height*4);});

for(const [cols,rows,cell,label] of [[24,30,20,'30 rows'],[30,47,13,'47 rows, small cells'],[16,12,40,'12 big rows'],[40,60,9,'60 rows, 9px cells']]){
 test(`row count found from the printed lines: ${label}`,()=>{
  const w=560,h=640,photo=photograph(cols,rows,cell,QUAD,w,h),{profile,top,bottom,flat}=flatten(photo,w,h,QUAD);
  const est=estimateRows(profile,top,bottom);assert.equal(est.rows,rows);assert.ok(est.confidence>=.6);assert.equal(est.ys.length,rows+1);
  const lines=fitLines(profile,top,bottom,rows,flat.height),pitch=(bottom-top)/rows;
  assert.equal(lines.length,rows+1);assert.ok(lines.every((y,i)=>!i||y<lines[i-1]),'boundaries go upward');
  lines.forEach((y,i)=>assert.ok(Math.abs(y*flat.height-(bottom-pitch*i))<=Math.max(1.6,pitch*.15),`boundary ${i} on its line`));
 });
}

test('thick lines every 5 rows are not mistaken for the row spacing',()=>{
 const w=560,h=640,photo=photograph(20,40,14,QUAD,w,h,{thickEvery:5,symbols:false}),{profile,top,bottom}=flatten(photo,w,h,QUAD);
 assert.equal(estimateRows(profile,top,bottom).rows,40);});

test('a bent page: each strip follows its own row lines, which even spacing cannot do',()=>{
 const w=560,h=640,cols=30,rows=36,cell=14,bend=.6,photo=photograph(cols,rows,cell,QUAD,w,h,{bend,symbols:true}),flat=rectify(photo,w,h,QUAD),g=flat.grid;
 const a=analyzePage(grayscale(flat.data,flat.width,flat.height),flat.width,flat.height,g);assert.equal(a.rows,rows,'row count agreed by the strips');
 const fit=fitPage(a,rows),top=g.top*flat.height,bottom=g.bottom*flat.height,pitch=(bottom-top)/rows;
 assert.equal(fit.strips.length,a.strips.length+2,'the grid edges are added');assert.ok(fit.lines.every(ys=>ys.length===rows+1));
 // Truth: printed line i at chart x sits bulge(x) higher than the even position.
 const truth=(xNorm,i)=>{const cx=(xNorm-g.left)/(g.right-g.left)*cols*cell;return bottom-pitch*i-bulge(cx,cols*cell,cell,bend)*pitch/cell;};
 let worstEven=0;
 fit.strips.forEach((x,s)=>{for(let i=0;i<=rows;i++){const off=Math.abs(fit.lines[s][i]*flat.height-truth(x,i));assert.ok(off<=pitch*.25,`strip ${s} line ${i} off by ${off.toFixed(1)}px`);worstEven=Math.max(worstEven,Math.abs(bottom-pitch*i-truth(x,i)));}});
 assert.ok(worstEven>pitch*.5,'even spacing would miss the middle rows');
 // Between strips the boundaries are interpolated.
 const mid=linesAt(fit,(fit.strips[0]+fit.strips[1])/2);assert.ok(Math.abs(mid[3]-(fit.lines[0][3]+fit.lines[1][3])/2)<1e-9);});

test('no grid → no guess; the user types the count',()=>{
 const blankProfile=new Float64Array(400).fill(1);assert.equal(estimateRows(blankProfile,20,380).rows,null);
 let seed=7;const noise=Float64Array.from({length:400},()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648);assert.equal(estimateRows(noise,20,380).rows,null);});

test('fitLines snaps to lines on a bent page and falls back to even spacing without lines',()=>{
 const H=300,rows=10,profile=new Float64Array(H+20),truth=[];for(let i=0;i<=rows;i++){const y=Math.round(10+H-i*30+(i===4?6:0));truth.push(y);profile[y]=40;}
 const lines=fitLines(profile,10,10+H,rows,H+20).map(v=>Math.round(v*(H+20)));assert.deepEqual(lines,truth);
 const even=fitLines(null,10,10+H,rows,H+20).map(v=>Math.round(v*(H+20)));assert.deepEqual(even,Array.from({length:rows+1},(_,i)=>10+H-i*30));
 assert.throws(()=>fitLines(null,0,100,0,100),/段数/);});

test('the grid is found as the large web of lines, ignoring the title and the row numbers',()=>{
 const w=560,h=640,photo=photograph(24,30,20,QUAD,w,h),quad=detectGrid(grayscale(photo,w,h),w,h);
 assert.ok(quad,'grid detected');quad.forEach(([x,y],i)=>assert.ok(Math.hypot(x-QUAD[i][0],y-QUAD[i][1])<12,`corner ${i} near the true grid corner (${x},${y})`));
 const paper=new Uint8ClampedArray(w*h*4).fill(235);assert.equal(detectGrid(grayscale(paper,w,h),w,h),null);
 const inset=insetQuad(100,200);assert.doesNotThrow(()=>checkQuad(inset,100,200));});
