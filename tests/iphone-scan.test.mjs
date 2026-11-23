import test from 'node:test';import assert from 'node:assert/strict';
import {homography,checkQuad,flatSize,rectify,grayscale,lineProfile,estimateRows,fitLines,analyzePage,fitPage,linesAt,detectGrid,insetQuad,validateScan,scanProject,scanRows,rowBands,scanLayout,rowAtPoint,SCAN_MARGIN} from '../docs/iphone/app/scan-model.mjs';
import * as M from '../docs/iphone/app/model.mjs';

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
 assert.equal(fit.strips.length,a.strips.length);assert.ok(fit.lines.every(ys=>ys.length===rows+1));
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

// ---- the scanned project ----
const JPEG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const even=rows=>Array.from({length:rows+1},(_,i)=>.95-.9*i/rows);
const page=(rows,extra={})=>({image:JPEG,width:600,height:800,rows,grid:{left:.1,right:.9,top:.05,bottom:.95},strips:[.3,.7],lines:[even(rows),even(rows)],...extra});

test('a scanned project is a normal project: rows, counter, memo, JSON round trip',()=>{
 const p=scanProject({version:1,join:'single',pages:[page(24)]},'  セーターの前身頃 ');
 assert.equal(p.name,'セーターの前身頃');assert.equal(M.totalRows(p),24);assert.equal(p.columns,1);
 M.complete(p);M.complete(p);p.notes[3]='ここから模様';assert.equal(p.currentRow,3);assert.deepEqual(p.completedRows,[1,2]);
 const back=M.validate(JSON.parse(JSON.stringify(p)));assert.deepEqual(back.scan,p.scan);assert.equal(back.currentRow,3);assert.equal(back.notes[3],'ここから模様');
 M.previous(back);assert.equal(back.currentRow,2);
 M.changeDirection(back,true);assert.equal(back.currentRow,24,'top-down starts at the top row');});

test('copies share the page images instead of duplicating them',()=>{
 const p=scanProject({version:1,join:'single',pages:[page(10)]}),q=M.clone(p);
 assert.equal(q.scan.pages[0].image,p.scan.pages[0].image);q.scan.pages[0].lines[0][1]=.5;assert.notEqual(p.scan.pages[0].lines[0][1],.5,'lines are copied');
 const sample=M.sample();assert.deepEqual(M.clone(sample),sample);});

test('two pages: side by side share the rows, stacked pages add them up',()=>{
 const side={version:1,join:'side',pages:[page(30),page(30,{width:640})]},stack={version:1,join:'stack',pages:[page(30),page(20)]};
 assert.equal(scanRows(validateScan(side)),30);assert.equal(scanRows(validateScan(stack)),50);
 assert.throws(()=>validateScan({...side,pages:[page(30),page(29)]}),/段数がそろって/);
 assert.throws(()=>validateScan({version:1,join:'single',pages:[page(3),page(3)]}),/不正/);
 assert.throws(()=>validateScan({version:1,join:'stack',pages:[page(3),page(3),page(3)]}),/不正/);
 const bands=rowBands(side,1);assert.equal(bands.length,2);assert.ok(Math.abs(bands[0].bottom-.95)<1e-9&&bands[0].top<bands[0].bottom);
 assert.deepEqual(rowBands(stack,31).map(b=>b.page),[1]);assert.ok(Math.abs(rowBands(stack,31)[0].bottom-.95)<1e-9,'row 31 is the first row of the next page');
 assert.equal(M.totalRows(scanProject(stack)),50);});

test('a band follows a bent row across the strips',()=>{
 const bent=even(10).map((y,i)=>i?y-.02:y),p={version:1,join:'single',pages:[page(10,{strips:[.2,.5,.8],lines:[even(10),bent,even(10)]})]},[b]=rowBands(p,3);
 assert.deepEqual(b.xs,[0,.2,.5,.8,1]);assert.ok(Math.abs(b.tops[2]-(even(10)[3]-.02))<1e-9&&Math.abs(b.tops[1]-even(10)[3])<1e-9,'the middle of the band is higher');
 const L=scanLayout(p),o=L.pages[0],y=o.y+(even(10)[3]-.015)*o.h;
 assert.equal(rowAtPoint(p,L,o.x+.2*o.w,y),4,'at the side that height is already row 4');assert.equal(rowAtPoint(p,L,o.x+.5*o.w,y),3,'in the raised middle it is still row 3');});

test('layout: side pages share the grid height and row positions; stacked pages continue upward',()=>{
 const side={version:1,join:'side',pages:[page(30),page(30,{width:300,height:400})]},L=scanLayout(side);
 const gridTop=i=>L.pages[i].y+side.pages[i].grid.top*L.pages[i].h,gridH=i=>(side.pages[i].grid.bottom-side.pages[i].grid.top)*L.pages[i].h;
 assert.ok(Math.abs(gridTop(0)-gridTop(1))<1e-6&&Math.abs(gridH(0)-1000)<1e-6&&Math.abs(gridH(1)-1000)<1e-6);assert.ok(L.pages[1].x>L.pages[0].x+L.pages[0].w);
 for(const row of [1,15,30]){const o=L.pages[1],b=rowBands(side,row)[1];assert.equal(rowAtPoint(side,L,o.x+o.w/2,o.y+(b.top+b.bottom)/2*o.h),row);}
 const stack={version:1,join:'stack',pages:[page(30),page(20)]},S=scanLayout(stack);assert.ok(S.pages[1].y<S.pages[0].y,'the continuation page is drawn above');
 for(const row of [1,30,31,50]){const b=rowBands(stack,row)[0],o=S.pages[b.page];assert.equal(rowAtPoint(stack,S,o.x+o.w/2,o.y+(b.top+b.bottom)/2*o.h),row);}
 assert.equal(rowAtPoint(stack,S,10,S.pages[0].y+S.pages[0].h*.99),null,'below the grid is no row');});

test('invalid scans are refused with Japanese messages',()=>{
 const bad=(change,re)=>assert.throws(()=>validateScan({version:1,join:'single',pages:[{...page(5),...change}]}),re);
 bad({image:'data:image/png;base64,AAAA'},/画像/);bad({image:'javascript:alert(1)'},/画像/);bad({rows:0},/画像/);
 bad({lines:[[.9,.8,.7,.6,.5],[.9,.8,.7,.6,.5]]},/段の線/);bad({lines:[[.9,.8,.8,.7,.6,.5],even(5)]},/段の線/);bad({lines:[even(5)]},/段の線/);bad({strips:[.7,.3]},/段の線/);bad({grid:{left:.5,right:.4,top:0,bottom:1}},/枠/);
 const p=scanProject({version:1,join:'single',pages:[page(5)]});assert.throws(()=>M.validate({...p,rows:6,cells:Array.from({length:6},()=>[0])}),/段数が合いません/);});
