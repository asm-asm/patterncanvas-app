import test from 'node:test';import assert from 'node:assert/strict';
import {rectify,grayscale} from '../docs/iphone/app/scan-model.mjs';
import {analyzeGrid,fitGrid,buildMesh,unwarp,readCells,outsideCells,groupShapes,groupColours,buildChart,hex,lineOnly as groupLineOnly} from '../docs/iphone/app/chart-convert.mjs';
import {STITCHES,STITCH_CELL_CODES,stitchPart,mirrorStitch,cellCodes} from '../docs/iphone/app/stitches.mjs';
import * as M from '../docs/iphone/app/model.mjs';
import {photograph,truthSymbol,truthShaded} from './scan-fixture.mjs';

const QUAD=[[62,48],[505,70],[520,598],[40,575]];
// One converted synthetic page: a 30 x 36 chart, tilted, sagging (rows bow 0.6 row) and curling (columns bow 0.5 stitch),
// with purl dashes, one-cell crosses and a shaded block.
const COLS=30,ROWS=36,CELL=14;
const page=(()=>{
 const w=560,h=640,photo=photograph(COLS,ROWS,CELL,QUAD,w,h,{bend:.6,bendX:.5,shading:true}),flat=rectify(photo,w,h,QUAD);
 const analysis=analyzeGrid(grayscale(flat.data,flat.width,flat.height),flat.width,flat.height,flat.grid);
 const fit=fitGrid(analysis,ROWS,COLS),mesh=buildMesh(fit),cells=readCells(flat.data,flat.width,flat.height,mesh,ROWS,COLS);
 return {flat,analysis,fit,mesh,cells,R:ROWS,C:COLS,outside:outsideCells(cells,ROWS,COLS)};
})();
// Truth for a page cell (r from the bottom, c from the left).
const symbolOf=cell=>truthSymbol(cell.c,ROWS-1-cell.r),shadedOf=cell=>truthShaded(cell.c,ROWS-1-cell.r,COLS,ROWS);

test('rows and stitches are counted on a bent page, in both directions',()=>{
 assert.equal(page.analysis.rows.rows,ROWS);assert.equal(page.analysis.cols.rows,COLS);
 assert.equal(page.fit.cols.lines[0].length,COLS+1);assert.ok(page.fit.cols.lines.every(xs=>xs.every((x,i)=>!i||x>xs[i-1])),'stitch boundaries run left to right');
});

test('every cell is read from its own place: symbols sit in the middle of their cell',()=>{
 // A purl dash is a short level stroke across the middle; reading the wrong cell would put it at an edge or miss it.
 let hits=0,total=0;
 for(const cell of page.cells){if(symbolOf(cell)!=='−')continue;total++;const ink=cell.ink,mid=[5,6].map(j=>ink.slice(j*12,j*12+12).reduce((a,b)=>a+b,0)),edge=[0,1,10,11].map(j=>ink.slice(j*12,j*12+12).reduce((a,b)=>a+b,0));if(Math.max(...mid)>2&&Math.max(...edge)<1)hits++;}
 // Misses are cells beside a thick 5-row line (its edge shows inside the cell) and the outermost column, which the
 // curl pushes partly outside the frame.
 assert.ok(total>50);assert.ok(hits/total>.85,`${hits}/${total} dashes centred`);
});

test('the straightened page is an even grid',()=>{
 const u=unwarp(page.flat.data,page.flat.width,page.flat.height,page.mesh,ROWS,COLS,10);
 assert.equal(u.width,COLS*10);assert.equal(u.height,ROWS*10);
 // Grid lines land on the cell borders: the border rows are darker than the cell middles on average.
 const L=(x,y)=>{const i=(y*u.width+x)*4;return u.data[i]*.3+u.data[i+1]*.59+u.data[i+2]*.11;};
 let border=0,middle=0;for(let r=1;r<ROWS;r++)for(let x=0;x<u.width;x++){border+=Math.min(L(x,r*10),L(x,r*10-1));middle+=L(x,r*10+5);}
 assert.ok(border<middle*.9,`borders ${Math.round(border)} vs middles ${Math.round(middle)}`);
});

test('cells group by symbol shape: blank, purl and cross come out as separate groups',()=>{
 const groups=groupShapes(page.cells,page.outside);
 assert.ok(groups[0].blank&&groups[0].members.every(k=>symbolOf(page.cells[k])===null||page.cells[k].amount<.02));
 const majority=g=>{const n=new Map();for(const k of g.members){const s=symbolOf(page.cells[k]);n.set(s,(n.get(s)||0)+1);}return [...n].sort((a,b)=>b[1]-a[1])[0];};
 const big=groups.slice(1).filter(g=>g.members.length>=5);
 const purl=big.filter(g=>majority(g)[0]==='−'),cross=big.filter(g=>majority(g)[0]==='×');
 assert.ok(purl.length>=1&&cross.length>=1,'both shapes found');
 // Groups are pure: each big group is (almost) one symbol.
 for(const g of big){const [,n]=majority(g);assert.ok(n/g.members.length>=.95,'group purity');}
 // Most cells land in a big group (few odd shapes).
 const inBig=big.reduce((n,g)=>n+g.members.length,0)+groups[0].members.length;assert.ok(inBig/page.cells.length>.95);
});

test('ground colours become yarns despite uneven light',()=>{
 const colours=groupColours(page.cells,page.outside);assert.equal(colours.length,2,colours.map(c=>hex(c.rgb)).join());
 const light=colours[0],dark=colours[1];
 const right=c=>c.members.filter(k=>shadedOf(page.cells[k])===(c===dark)).length/c.members.length;
 assert.ok(right(light)>.97&&right(dark)>.97);
});

test('naming the groups gives the chart: symbols and yarns match the printed chart',()=>{
 const groups=groupShapes(page.cells,page.outside),colours=groupColours(page.cells,page.outside);
 const shape=new Int32Array(page.cells.length).fill(-1),colour=new Int32Array(page.cells.length);
 groups.forEach((g,i)=>g.members.forEach(k=>shape[k]=i));colours.forEach((c,i)=>c.members.forEach(k=>colour[k]=i));
 // The user names each group after its example cell.
 const names=groups.map((g,i)=>{if(i===0)return '';const s=symbolOf(page.cells[g.example]);return s==='−'?'P':s==='×'?'RC1':'UNK';});
 // Here the cross is a one-cell symbol in the fixture; name it as purl-free "ねじり目" to keep one cell.
 for(let i=0;i<names.length;i++)if(names[i]==='RC1')names[i]='TBL';
 const p=buildChart({pages:[page],join:'single',shapeOf:(n,k)=>shape[k],colourOf:(n,k)=>colour[k],names,colours:colours.map(c=>({color:hex(c.rgb)}))});
 assert.equal(p.columns,COLS);assert.equal(p.rows,ROWS);assert.deepEqual(M.validate(JSON.parse(JSON.stringify(p))).symbols,p.symbols);
 let right=0,yarn=0;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const t=truthSymbol(c,ROWS-1-r),want=t==='−'?'P':t==='×'?'TBL':null;if(p.symbols[r][c]===want)right++;if((p.cells[r][c]===1)===truthShaded(c,ROWS-1-r,COLS,ROWS))yarn++;}
 assert.ok(right/(ROWS*COLS)>.97,`symbols ${right}/${ROWS*COLS}`);assert.ok(yarn/(ROWS*COLS)>.97,`yarns ${yarn}/${ROWS*COLS}`);
 assert.equal(p.cells[0].length,COLS,'row 1 (bottom) first');
});

test('cables named on their left cell cover the cells to the right; pages join side by side or upward',()=>{
 const fake=(R,C)=>({R,C,cells:Array.from({length:R*C},(_,k)=>({r:Math.floor(k/C),c:k%C})),outside:new Uint8Array(R*C)});
 const a=fake(2,6),b=fake(3,4);
 // Shape 1 at (row 0, stitch 1): a 4-stitch cable; shape 2 everywhere else is knit; the cable covers stitches 1-4.
 const shapeOf=(n,k)=>n===0&&k===1?1:0,colourOf=()=>0,colours=[{color:'#ffffff'}];
 const one=buildChart({pages:[a],join:'single',shapeOf,colourOf,names:['','RC2'],colours});
 assert.deepEqual(one.symbols[0],[null,'RC2@0','RC2@1','RC2@2','RC2@3',null]);
 const late=buildChart({pages:[a],join:'single',shapeOf:(n,k)=>k===4?1:0,colourOf,names:['','RC2'],colours});
 assert.ok(late.symbols[0].every(s=>s===null),'a cable that would run off the edge is not placed');
 const side=buildChart({pages:[a,fake(2,3)],join:'side',shapeOf:()=>0,colourOf,names:[''],colours});assert.equal(side.columns,9);assert.equal(side.rows,2);
 const stack=buildChart({pages:[a,b],join:'stack',shapeOf:()=>0,colourOf,names:[''],colours});assert.equal(stack.rows,5);assert.equal(stack.columns,6);
 assert.deepEqual(stack.cells[4],[0,0,0,0,null,null],'a narrower block above is padded with no-stitch cells');
 const out={...a,outside:Uint8Array.from({length:12},(_,k)=>k===0?1:0)};
 assert.equal(buildChart({pages:[out],join:'single',shapeOf:()=>0,colourOf,names:[''],colours}).cells[0][0],null,'outside the outline: no stitch');
});

test('cells outside a shaped outline (no grid lines around them) become no-stitch cells',()=>{
 const R=4,C=4,cells=[];for(let r=0;r<R;r++)for(let c=0;c<C;c++){const inside=!(r===R-1&&c===0);cells.push({r,c,amount:0,sides:inside?[30,30,30,30]:[0,30,0,0]});}
 const out=outsideCells(cells,R,C);assert.deepEqual([...out].map((v,k)=>v?k:-1).filter(k=>k>=0),[12]);
});

test('knitting symbols: cell codes, cables across cells, mirror',()=>{
 assert.ok(STITCHES.some(s=>s.code==='P'&&s.name==='裏目'));assert.ok(STITCH_CELL_CODES.includes('RC2@3')&&!STITCH_CELL_CODES.includes('RC2@4'));
 assert.deepEqual(stitchPart('LC1@1'),{code:'LC1',index:1,width:2,name:'左上1目交差'});assert.equal(stitchPart('P@0'),null);assert.equal(stitchPart('M1L'),null);
 assert.equal(mirrorStitch('RC2@0'),'LC2@3');assert.equal(mirrorStitch('K2TOG'),'SSK');assert.equal(mirrorStitch('P'),'P');assert.deepEqual(cellCodes('RC1'),['RC1@0','RC1@1']);
});

test('the chart model places, clears, flips and saves the new symbols',()=>{
 const p=M.blank(6,2);M.setSymbol(p,1,0,'RC2');assert.deepEqual(p.symbols[0],[null,'RC2@0','RC2@1','RC2@2','RC2@3',null]);
 M.setSymbol(p,3,0,null);assert.ok(p.symbols[0].every(s=>s===null),'clearing one cell clears the whole cable');
 assert.throws(()=>M.setSymbol(p,4,0,'RC2'),/4目必要/);
 M.setSymbol(p,0,1,'P');M.setSymbol(p,1,1,'LC1');M.flip(p,true);assert.deepEqual(p.symbols[1],[null,null,null,'RC1@0','RC1@1','P']);
 M.setSymbol(p,2,1,'RC1');assert.deepEqual(p.symbols[1],[null,null,'RC1@0','RC1@1',null,'P'],'a new cable replaces the one it overlaps');
 const back=M.validate(JSON.parse(JSON.stringify(p)));assert.deepEqual(back.symbols,p.symbols);
 assert.throws(()=>M.validate({...JSON.parse(JSON.stringify(p)),symbols:[[null,null,null,null,null,'RC2@9'],Array(6).fill(null)]}),/記号/);
 assert.throws(()=>M.setSymbol(p,0,0,'XYZ'),/対応していない/);
});

test('a straight line right across a cell is a grid line, not a symbol',()=>{
 const make=f=>Float32Array.from({length:144},(_,k)=>f(k%12,Math.floor(k/12))?1:0);
 const vertical=make((i)=>i===3),dash=make((i,j)=>j===6&&i>2&&i<9),cross=make((i,j)=>Math.abs(i-j)<1||Math.abs(11-i-j)<1);
 assert.equal(groupLineOnly([vertical,vertical]),true);assert.equal(groupLineOnly([make((i,j)=>j===9)]),true);
 assert.equal(groupLineOnly([dash]),false);assert.equal(groupLineOnly([cross]),false);
});
test('a doubled border line is a grid line too',()=>{
 const make=f=>Float32Array.from({length:144},(_,k)=>f(k%12,Math.floor(k/12))?1:0);
 assert.equal(groupLineOnly([make(i=>i===2||i===7)]),true);assert.equal(groupLineOnly([make((i,j)=>i===2||(j===6&&i>3&&i<9))]),false);
});
