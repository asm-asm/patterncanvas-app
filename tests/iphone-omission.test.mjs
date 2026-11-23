import test from 'node:test';import assert from 'node:assert/strict';
import {rectify,grayscale,linesAt} from '../docs/iphone/app/scan-model.mjs';
import {analyzeGrid,findGaps,fitGrid,fillOmitted} from '../docs/iphone/app/chart-convert.mjs';
import {readRowNumbers,rowOffset,pageRegion} from '../docs/iphone/app/rownumbers.mjs';
import {omissionPhoto,OMIT} from './omission-fixture.mjs';

test('a band with no grid inside the frame is found: the rows left out',async()=>{
 const photo=await omissionPhoto(),flat=rectify(photo.rgba,photo.width,photo.height,photo.quad),gray=grayscale(flat.data,flat.width,flat.height);
 const whole=analyzeGrid(gray,flat.width,flat.height,flat.grid);assert.equal(whole.cols.rows,OMIT.cols);
 const gaps=findGaps(gray,flat.width,flat.height,flat.grid,whole.cols.rows);assert.equal(gaps.length,1);
 // Blocks bottom first; each block's rows; the row numbers beside them; rows left out = 15 - 5 - 1 = 9.
 const top=flat.grid.top*flat.height,bottom=flat.grid.bottom*flat.height,edges=[top,...gaps.flat(),bottom],blocks=[];
 for(let i=edges.length-2;i>=0;i-=2)blocks.push({...flat.grid,top:edges[i]/flat.height,bottom:edges[i+1]/flat.height});
 const pitch=(flat.grid.right-flat.grid.left)*flat.width/OMIT.cols,numbers=readRowNumbers(pageRegion(gray,flat.width,flat.height),flat.width,flat.height,flat.grid,pitch);
 assert.deepEqual([...new Set(numbers.map(n=>n.value).filter(v=>v>1))].sort((a,b)=>a-b),[5,15,20],'the printed numbers are read');
 const read=blocks.map(grid=>{const a=analyzeGrid(gray,flat.width,flat.height,grid),R=a.rows.rows,fit=fitGrid(a,R,OMIT.cols),edge=linesAt(fit.rows,grid.right).map(v=>v*flat.height);
  return {R,offset:rowOffset(numbers,y=>{for(let r=1;r<=R;r++)if(y<=edge[r-1]&&y>=edge[r])return r;return null;})};});
 assert.deepEqual(read.map(b=>b.R),[OMIT.lower,OMIT.upper]);assert.equal(read[0].offset,0);assert.equal(read[1].offset,OMIT.first-1);
 assert.equal(read[1].offset-read[0].offset-read[0].R,9,'nine rows left out');
});

test('rows left out repeat the rows below them: the shortest repeat they follow',()=>{
 const row=(...s)=>s.map(x=>({c:0,s:x}));
 const rib=[row(null,'P'),row(null,'P'),row(null,'P')];assert.deepEqual(fillOmitted(rib,3),[row(null,'P'),row(null,'P'),row(null,'P')]);
 const two=[row('P','P'),row(null,null),row('P','P'),row(null,null)];assert.deepEqual(fillOmitted(two,3),[row('P','P'),row(null,null),row('P','P')],'2-row repeat continues in step');
 const four=[row('A',null),row(null,'B'),row(null,null),row('C',null),row('A',null),row(null,'B'),row(null,null),row('C',null)];
 assert.deepEqual(fillOmitted(four,5).map(r=>r[0].s),['A',null,null,'C','A']);
 assert.deepEqual(fillOmitted(rib,0),[]);assert.deepEqual(fillOmitted([],4),[]);
});

test('the row offset needs agreement: one misread number or stray text does not decide it',()=>{
 const rowAt=y=>Math.round(y);
 assert.equal(rowOffset([{value:5,y:5},{value:10,y:10},{value:30,y:20}],rowAt),0,'two agree, one misread');
 assert.equal(rowOffset([{value:1,y:3},{value:1,y:7}],rowAt),null,'a 1 away from the first row is not trusted');
 assert.equal(rowOffset([{value:1,y:1},{value:5,y:5}],rowAt),0,'1 and 5 on rows 1 and 5');
 assert.equal(rowOffset([{value:15,y:1},{value:20,y:6}],rowAt),14);
 assert.equal(rowOffset([{value:5,y:5},{value:30,y:5}],rowAt),null,'two readings that disagree');
});

test('counts are checked against the printed numbers: a count one off at an edge is put right',async()=>{
 const {checkCounts}=await import('../docs/iphone/app/chart-convert.mjs');
 const photo=await omissionPhoto(),flat=rectify(photo.rgba,photo.width,photo.height,photo.quad),gray=grayscale(flat.data,flat.width,flat.height);
 const whole=analyzeGrid(gray,flat.width,flat.height,flat.grid),gaps=findGaps(gray,flat.width,flat.height,flat.grid,OMIT.cols);
 const upper={...flat.grid,bottom:gaps[0][0]/flat.height},a=analyzeGrid(gray,flat.width,flat.height,upper),pitch=(flat.grid.right-flat.grid.left)*flat.width/OMIT.cols;
 const numbers={rows:readRowNumbers(pageRegion(gray,flat.width,flat.height),flat.width,flat.height,flat.grid,pitch)};
 assert.equal(checkCounts(a,OMIT.upper,null,numbers).rows,OMIT.upper,'a right count stays');
 const off=checkCounts(a,OMIT.upper-1,null,numbers);assert.equal(off.rows,OMIT.upper,'one too few is corrected');assert.ok(off.rowsChecked);
 assert.equal(checkCounts(a,OMIT.upper-1,null,{rows:[]}).rows,OMIT.upper-1,'no numbers: the lines stand');
 assert.equal(whole.cols.rows,OMIT.cols);
});
