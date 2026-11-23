import {analyzePage,fitPage,linesAt} from './scan-model.mjs';
import {blank} from './model.mjs';
import {agreement} from './rownumbers.mjs';
import {stitchDef,cellCodes,stitchPart} from './stitches.mjs';
import {INSET,shapeOf,distance} from './recognize.mjs';

// A photographed book chart → an editable chart. The page is assumed to be bent and sagging, not flat:
// 1. the four corners remove the perspective (scan-model.mjs rectify);
// 2. row lines are tracked in vertical strips and stitch lines in horizontal bands, so every printed line is followed
//    as it bends; their crossings form a mesh, one small quadrilateral per cell;
// 3. each cell is read from its own quadrilateral (so a bent page becomes an even grid): the colour of its ground and
//    the shape of the ink on it;
// 4. cells with the same ink shape are grouped; the user names each group once (裏目, 右上2目交差, …) and colours become
//    yarns. Cells outside a shaped outline (no grid lines around them) become "no stitch".
// Everything is deterministic and on the device; nothing is recognised by a model.

export const CELL=16;             // ink samples per cell side (the grid lines next to the sides are not read: INSET)

/** Transposed copy of a grey image, so column lines can be found with the row-line code. */
export function transpose(gray,width,height){const t=new Float32Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)t[x*height+y]=gray[y*width+x];return t;}

/**
 * Bands across the whole grid with no stitch lines: where a book leaves rows out (「省略」: the middle of a ribbing or a
 * plain stretch is skipped, sometimes over a caption or a grey band). Returns [[y0, y1], …] in image pixels, top first.
 * A band must be at least half a stitch high and keep clear of the frame's top and bottom.
 */
export function findGaps(gray,width,height,grid,cols,analysis=null){
 const x0=Math.round(grid.left*width)+2,x1=Math.round(grid.right*width)-2,top=Math.round(grid.top*height),bottom=Math.round(grid.bottom*height),pitch=(x1-x0)/Math.max(1,cols);
 // Look only where the stitch lines run (from the stitch-line fit), so a caption printed in the band does not count.
 const a=analysis??analyzeGrid(gray,width,height,grid),fit=fitPage(a.cols,cols),lines=new Float32Array(height);
 for(let y=top;y<bottom;y++){const xs=linesAt(fit,y/height);let n=0;for(let j=1;j<cols;j++){const x=Math.round(xs[j]*width);let hit=false;
   for(let d=-2;d<=2&&!hit;d++){const at=x+d;if(at<2||at>=width-2)continue;const v=gray[y*width+at];if(Math.min(gray[y*width+at-2],gray[y*width+at+2])-v>14)hit=true;}if(hit)n++;}
  lines[y]=n/Math.max(1,cols-1);}
 // Stitch lines show in nearly every image row of the grid; where they stop across the whole width, rows are left out.
 const typical=[...lines.slice(top,bottom)].sort((p,q)=>p-q)[Math.floor((bottom-top)*.6)]||0,gaps=[];let start=-1;
 for(let y=top;y<=bottom;y++){const quiet=y<bottom&&(lines[Math.max(top,y-1)]+lines[y]+lines[Math.min(bottom-1,y+1)])/3<typical*.55; // a caption crosses some lines, the grid all
  if(quiet&&start<0)start=y;if(!quiet&&start>=0){if(y-start>=pitch*.5&&start-top>pitch*.8&&bottom-y>pitch*.8)gaps.push([start,y]);start=-1;}}
 return gaps;
}

/**
 * Row and stitch counts checked against the numbers printed beside and under the chart. The lines give a count that
 * can be one off at an edge; of the counts near it, the one under which the most printed numbers agree wins (row 1 at
 * the bottom, stitch 1 at the right, as Japanese charts number them). rows/cols: from the lines; numbers: {rows:[{value,y}],
 * stitches:[{value,x}]}. Returns {rows, cols, rowsChecked, colsChecked}.
 */
export function checkCounts(analysis,rows,cols,numbers){
 // Another count is taken only when the numbers clearly back it (a lead of two votes); otherwise the lines stand.
 const best=(start,fitOf,indexAt,list,key)=>{if(!start||list.length<2)return {n:start,checked:false};
  const own=agreement(list,indexAt(fitOf(start),start),key);let pick=start,top=own;
  for(const n of [start-1,start+1,start-2,start+2]){if(n<1)continue;const score=agreement(list,indexAt(fitOf(n),n),key);if(score>=4&&score>=own+2&&score>top){top=score;pick=n;}}
  return {n:pick,checked:top>=4};};
 const g=analysis.grid,W=analysis.width,H=analysis.height;
 const r=best(rows,n=>fitPage(analysis.rows,n),(fit,n)=>{const edges=[linesAt(fit,g.left),linesAt(fit,g.right)].map(l=>l.map(v=>v*H));return y=>{for(const e of edges)for(let i=1;i<=n;i++)if(y<=e[i-1]&&y>=e[i])return i;return null;};},numbers.rows||[],'y');
 // Stitch boundaries from the transposed fit run from the right edge leftward: index 1 is the rightmost stitch.
 const c=best(cols,n=>fitPage(analysis.cols,n),(fit,n)=>{const edges=[linesAt(fit,g.top),linesAt(fit,g.bottom)].map(l=>l.map(v=>v*W));return x=>{for(const e of edges)for(let i=1;i<=n;i++)if(x<=e[i-1]&&x>=e[i])return i;return null;};},numbers.stitches||[],'x');
 return {rows:r.n,cols:c.n,rowsChecked:r.checked,colsChecked:c.checked};
}

/** Row lines (per vertical strip) and stitch lines (per horizontal band) of a flattened page. */
export function analyzeGrid(gray,width,height,grid){
 const rows=analyzePage(gray,width,height,grid);
 const cols=analyzePage(transpose(gray,width,height),height,width,{left:grid.top,right:grid.bottom,top:grid.left,bottom:grid.right});
 return {width,height,grid,rows,cols};
}

/**
 * Fitted lines for a row and stitch count. rows: boundaries bottom-up as functions of x; cols: boundaries left to right
 * as functions of y (both 0-1 image coordinates).
 */
export function fitGrid(analysis,rows,cols){
 const r=fitPage(analysis.rows,rows),c=fitPage(analysis.cols,cols);
 // The transposed fit counts from the right edge ("bottom" there); turn it into left-to-right.
 return {rows:r,cols:{strips:c.strips,lines:c.lines.map(xs=>[...xs].reverse())},rowCount:rows,colCount:cols};
}

/** Crossing of row boundary i (bottom-up) and stitch boundary j (left to right), in 0-1 image coordinates. */
export function crossing(fit,i,j){
 let x=linesAt(fit.cols,.5)[j],y=linesAt(fit.rows,x)[i];
 for(let k=0;k<4;k++){x=linesAt(fit.cols,y)[j];y=linesAt(fit.rows,x)[i];}
 return [x,y];
}
/** All crossings: mesh[(i*(cols+1)+j)*2] = x, +1 = y. */
export function buildMesh(fit){
 const R=fit.rowCount,C=fit.colCount,mesh=new Float64Array((R+1)*(C+1)*2);
 for(let i=0;i<=R;i++)for(let j=0;j<=C;j++){const [x,y]=crossing(fit,i,j);mesh[(i*(C+1)+j)*2]=x;mesh[(i*(C+1)+j)*2+1]=y;}
 return mesh;
}
/** Image point (pixels) at (u,v) inside cell (row r bottom-up, stitch c), u left→right, v bottom→top. */
function cellPoint(mesh,C,r,c,u,v,width,height){
 const at=(i,j,k)=>mesh[(i*(C+1)+j)*2+k];
 const x=(1-v)*((1-u)*at(r,c,0)+u*at(r,c+1,0))+v*((1-u)*at(r+1,c,0)+u*at(r+1,c+1,0));
 const y=(1-v)*((1-u)*at(r,c,1)+u*at(r,c+1,1))+v*((1-u)*at(r+1,c,1)+u*at(r+1,c+1,1));
 return [x*width,y*height];
}
function sample(rgba,width,height,x,y,out,o){
 const fx=Math.max(0,Math.min(width-1.001,x-.5)),fy=Math.max(0,Math.min(height-1.001,y-.5)),x0=Math.floor(fx),y0=Math.floor(fy),ax=fx-x0,ay=fy-y0;
 for(let ch=0;ch<3;ch++){const i=(y0*width+x0)*4+ch;out[o+ch]=(rgba[i]*(1-ax)+rgba[i+4]*ax)*(1-ay)+(rgba[i+width*4]*(1-ax)+rgba[i+width*4+4]*ax)*ay;}
}

/** The page as an even grid: R rows x C stitches, `size` px per cell, top row first (RGBA). The check image. */
export function unwarp(rgba,width,height,mesh,R,C,size){
 const W=C*size,H=R*size,out=new Uint8ClampedArray(W*H*4),px=new Float32Array(3);
 for(let Y=0;Y<H;Y++){const r=R-1-Math.floor(Y/size),v=1-((Y%size)+.5)/size;
  for(let X=0;X<W;X++){const c=Math.floor(X/size),u=((X%size)+.5)/size,[x,y]=cellPoint(mesh,C,r,c,u,v,width,height);sample(rgba,width,height,x,y,px,0);const o=(Y*W+X)*4;out[o]=px[0];out[o+1]=px[1];out[o+2]=px[2];out[o+3]=255;}}
 return {data:out,width:W,height:H};
}

const luma=(r,g,b)=>r*.299+g*.587+b*.114;
/**
 * Read every cell: ground colour (the light half of its pixels), ink map (how much darker than the ground each sample
 * is, CELL x CELL), ink amount, and how strongly printed lines run along its four sides (for shaped outlines).
 */
export function readCells(rgba,width,height,mesh,R,C){
 const cells=[],px=new Float32Array(CELL*CELL*3);
 for(let r=0;r<R;r++)for(let c=0;c<C;c++){
  for(let j=0;j<CELL;j++)for(let i=0;i<CELL;i++){const u=INSET+(1-2*INSET)*(i+.5)/CELL,v=1-(INSET+(1-2*INSET)*(j+.5)/CELL),[x,y]=cellPoint(mesh,C,r,c,u,v,width,height);sample(rgba,width,height,x,y,px,(j*CELL+i)*3);}
  const L=new Float32Array(CELL*CELL);for(let k=0;k<L.length;k++)L[k]=luma(px[k*3],px[k*3+1],px[k*3+2]);
  const order=[...L.keys()].sort((a,b)=>L[b]-L[a]),light=order.slice(0,Math.ceil(order.length*.5)),fill=[0,0,0];
  for(const k of light)for(let ch=0;ch<3;ch++)fill[ch]+=px[k*3+ch]/light.length;
  const ground=luma(...fill),scale=Math.max(45,ground*.45),ink=new Float32Array(L.length);let amount=0;
  for(let k=0;k<L.length;k++){const d=(ground-L[k])/scale;ink[k]=d>.25?Math.min(1,d):0;}
  // Ink running straight through the whole cell along one of its edges is a grid line (a thick block border, or a line
  // the mesh missed by a little), not a symbol: drop such rows and columns near the edges. The middle is left alone,
  // so a long purl dash stays.
  const full=(get)=>{let n=0;for(let t=0;t<CELL;t++)if(get(t)>0)n++;return n>=CELL-1&&get(0)>0&&get(CELL-1)>0;};
  for(const i of [0,1,CELL-2,CELL-1]){if(full(t=>ink[t*CELL+i]))for(let t=0;t<CELL;t++)ink[t*CELL+i]=0;if(full(t=>ink[i*CELL+t]))for(let t=0;t<CELL;t++)ink[i*CELL+t]=0;}
  for(let k=0;k<L.length;k++)amount+=ink[k];
  cells.push({r,c,fill:fill.map(Math.round),ground,ink,amount:amount/L.length,sides:sides(rgba,width,height,mesh,C,r,c)});
 }
 return cells;
}
/**
 * Ink anywhere across a run of cells, for telling cables apart: (r, first stitch c0, width w) → (x, y) with x 0..w
 * across the run and y 0..1 down. Unlike readCells it also reads next to the cell sides, where the strands of a
 * one-stitch cable cross; only the thin band of the printed stitch lines is skipped (null).
 */
export function spanReader(rgba,width,height,mesh,C,cells){
 const px=new Float32Array(3);
 return (r,c0,w)=>{const ground=cells.slice(r*C+c0,r*C+c0+w).reduce((s,c)=>s+c.ground,0)/w,scale=Math.max(45,ground*.45);
  return (x,y)=>{if(x<0||x>w||y<.07||y>.93)return null;const j=Math.min(w-1,Math.floor(x)),u=x-j;if(Math.abs(x-Math.round(x))<.06)return null;
   const [px0,py0]=cellPoint(mesh,C,r,c0+j,u,1-y,width,height);sample(rgba,width,height,px0,py0,px,0);const d=(ground-luma(px[0],px[1],px[2]))/scale;return d>.25?Math.min(1,d):0;};};
}

/** Darkness of the printed line along each side of a cell (bottom, top, left, right) against the cell's inside. */
function sides(rgba,width,height,mesh,C,r,c){
 const px=new Float32Array(3),L=(u,v)=>{const [x,y]=cellPoint(mesh,C,r,c,u,v,width,height);sample(rgba,width,height,x,y,px,0);return luma(px[0],px[1],px[2]);};
 // side: fixed coordinate along it (u or v), its value (0 or 1) and the inward value.
 const along=(horizontal,at,inward)=>{let s=0;for(const t of [.3,.5,.7]){let line=255;for(const d of [-.06,0,.06]){const w=at+d;line=Math.min(line,horizontal?L(t,w):L(w,t));}s+=Math.max(0,(horizontal?L(t,inward):L(inward,t))-line);}return s/3;};
 return [along(true,0,.25),along(true,1,.75),along(false,0,.25),along(false,1,.75)];
}

/**
 * Cells outside the printed outline (a raglan or a neckline leaves the corners of the frame empty): blank cells whose
 * sides carry no grid line, reached from the frame edge. They become "no stitch".
 */
export function outsideCells(cells,R,C){
 const strong=cells.flatMap(c=>c.sides).sort((a,b)=>a-b),line=strong[Math.floor(strong.length*.75)]||0,need=line*.3;
 const open=cells.map(c=>c.amount<.02&&c.sides.filter(s=>s>need).length<=1),out=new Uint8Array(R*C),stack=[];
 for(let r=0;r<R;r++)for(const c of [0,C-1])stack.push(r*C+c);for(let c=0;c<C;c++)for(const r of [0,R-1])stack.push(r*C+c);
 while(stack.length){const k=stack.pop();if(out[k]||!open[k])continue;out[k]=1;const r=Math.floor(k/C),c=k%C;for(const [rr,cc] of [[r+1,c],[r-1,c],[r,c+1],[r,c-1]])if(rr>=0&&cc>=0&&rr<R&&cc<C)stack.push(rr*C+cc);}
 return out;
}

/**
 * Group the inked cells by shape: a new group starts when a cell is unlike every group so far, then each cell moves to
 * its nearest group centre (three rounds). Group 0 is always the blank cells. Biggest groups first.
 */
export function groupShapes(cells,skip=new Uint8Array(cells.length),threshold=.09){
 // Shapes only: each ink map centred and scaled to its darkest stroke, so a symbol on a shaded ground or in dim light
 // matches the same symbol on white.
 const shapes=cells.map(c=>shapeOf(c.ink)),blankIndex=[],inked=[];
 cells.forEach((c,k)=>{if(skip[k])return;(c.amount<.02?blankIndex:inked).push(k);});
 let centres=[];
 for(const k of inked){let best=Infinity;for(const m of centres)best=Math.min(best,distance(shapes[k],m.sum.map(v=>v/m.n)));if(best>threshold&&centres.length<60)centres.push({sum:Float32Array.from(shapes[k]),n:1});else{const m=centres.reduce((a,m)=>distance(shapes[k],m.sum.map(v=>v/m.n))<distance(shapes[k],a.sum.map(v=>v/a.n))?m:a);for(let i=0;i<m.sum.length;i++)m.sum[i]+=shapes[k][i];m.n++;}}
 let means=centres.map(m=>m.sum.map(v=>v/m.n)),assign=new Map();
 for(let round=0;round<3;round++){
  assign=new Map();for(const k of inked){let best=0,d=Infinity;means.forEach((m,g)=>{const e=distance(shapes[k],m);if(e<d){d=e;best=g;}});assign.set(k,best);}
  means=means.map((m,g)=>{const members=inked.filter(k=>assign.get(k)===g);if(!members.length)return m;const s=new Float32Array(m.length);for(const k of members)for(let i=0;i<s.length;i++)s[i]+=shapes[k][i];return s.map(v=>v/members.length);});
 }
 const groups=means.map((mean,g)=>({mean,members:inked.filter(k=>assign.get(k)===g)})).filter(g=>g.members.length).sort((a,b)=>b.members.length-a.members.length);
 // The example shown for a group is its most typical cell.
 for(const g of groups)g.example=g.members.reduce((a,k)=>distance(shapes[k],g.mean)<distance(shapes[a],g.mean)?k:a,g.members[0]);
 return [{blank:true,members:blankIndex,example:blankIndex[0]??null},...groups.map(g=>({blank:false,members:g.members,example:g.example,lineOnly:lineOnly(g.members.map(k=>cells[k].ink))}))];
}

/**
 * Whether the cells of a group hold nothing but one straight line (or a doubled one) right across the cell (a thick block border the
 * grid fit did not put on a cell edge), not a symbol: their ink sits in one narrow column (or row) band that runs the
 * full height (width).
 */
export function lineOnly(inks){
 if(!inks.length)return false;const mean=new Float32Array(CELL*CELL);for(const ink of inks)for(let k=0;k<mean.length;k++)mean[k]+=ink[k]/inks.length;
 const total=mean.reduce((a,b)=>a+b,0);if(!total)return false;
 // Up to two such bands (a doubled border), at least 3 samples apart.
 const band=(at)=>{const sums=[];for(let a=0;a<CELL;a++){let sum=0,full=true;for(let t=0;t<CELL;t++){let v=0;for(let d=-1;d<=1;d++)if(a+d>=0&&a+d<CELL)v+=at(a+d,t);sum+=v;if(v<.3)full=false;}sums.push(full?sum:0);}
  let best=0;for(let a=0;a<CELL;a++){best=Math.max(best,sums[a]);for(let b=a+3;b<CELL;b++)if(sums[a]&&sums[b])best=Math.max(best,sums[a]+sums[b]);}return best;};
 return Math.max(band((a,t)=>mean[t*CELL+a]),band((a,t)=>mean[a*CELL+t]))>=total*.8;
}

/**
 * Ground colours → yarns. A new colour starts when a cell is further than `threshold` (RGB distance) from every colour
 * so far; then cells move to the nearest colour. Colours used by fewer than 0.5% of the cells merge into the nearest.
 */
export function groupColours(cells,skip=new Uint8Array(cells.length),threshold=34){
 const keep=cells.map((_,k)=>k).filter(k=>!skip[k]),d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 // Light falls unevenly on a book: judge each ground against the white paper near it (the lightest grounds within a
 // few cells), so one yarn does not split into several greys.
 if(!cells[0]?.paper)paperLevels(cells);
 cells=cells.map(c=>({...c,fill:c.fill.map(v=>Math.min(255,v*235/c.paper))}));
 let centres=[];for(const k of keep){const f=cells[k].fill;if(!centres.some(c=>d(c,f)<threshold)&&centres.length<12)centres.push([...f]);}
 let assign=[];
 for(let round=0;round<4;round++){
  assign=keep.map(k=>{let best=0;centres.forEach((c,i)=>{if(d(cells[k].fill,c)<d(cells[k].fill,centres[best]))best=i;});return best;});
  centres=centres.map((c,i)=>{const m=keep.filter((_,n)=>assign[n]===i);if(!m.length)return c;return [0,1,2].map(ch=>m.reduce((s,k)=>s+cells[k].fill[ch],0)/m.length);});
  // Drop tiny colours (specks, glare) once.
  if(round===1){const counts=centres.map((_,i)=>assign.filter(a=>a===i).length);centres=centres.filter((_,i)=>counts[i]>=Math.max(1,keep.length*.005));}
 }
 let colours=centres.map((c,i)=>({rgb:c.map(Math.round),members:keep.filter((_,n)=>assign[n]===i)})).filter(c=>c.members.length);
 // Colours that drifted close together are one yarn.
 colours=mergeColours(colours,Infinity,threshold*.75);
 colours.sort((a,b)=>luma(...b.rgb)-luma(...a.rgb));
 return colours;
}

/** Merge the two closest colours until at most `count` remain and none are closer than `closer`. */
export function mergeColours(colours,count,closer=0){
 const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);let out=colours.map(c=>({rgb:[...c.rgb],members:[...c.members]}));
 for(;;){let best=null;for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){const e=d(out[i].rgb,out[j].rgb);if(!best||e<best[2])best=[i,j,e];}
  if(!best||(out.length<=count&&best[2]>=closer))break;const [i,j]=best,a=out[i],b=out[j],n=a.members.length+b.members.length;
  out[i]={rgb:a.rgb.map((v,ch)=>Math.round((v*a.members.length+b.rgb[ch]*b.members.length)/n)),members:[...a.members,...b.members]};out.splice(j,1);}
 return out.sort((a,b)=>luma(...b.rgb)-luma(...a.rgb));
}

/**
 * The paper brightness at each cell (sets cell.paper): light falls off smoothly across a page, so fit a gentle curved
 * surface to the lightest grounds of 6 x 6 blocks of cells, leaving out blocks well below it (a shaded area is yarn,
 * not shadow).
 */
export function paperLevels(cells){
 const R=Math.max(...cells.map(c=>c.r))+1,C=Math.max(...cells.map(c=>c.c))+1,B=6,blocks=new Map();
 for(const c of cells){const key=`${Math.floor(c.r/B)},${Math.floor(c.c/B)}`;if(!blocks.has(key))blocks.set(key,{r:0,c:0,n:0,v:[]});const b=blocks.get(key);b.r+=c.r;b.c+=c.c;b.n++;b.v.push(c.ground);}
 let pts=[...blocks.values()].map(b=>{b.v.sort((x,y)=>x-y);return [b.c/b.n/Math.max(1,C-1),b.r/b.n/Math.max(1,R-1),b.v[Math.floor(b.v.length*.9)]];});
 const terms=(x,y)=>[1,x,y,x*x,x*y,y*y],K=pts.length>=12?6:3,value=(f,x,y)=>terms(x,y).slice(0,K).reduce((s,t,i)=>s+t*f[i],0);
 let fit=[Math.max(...pts.map(p=>p[2])),0,0,0,0,0];
 for(let round=0;round<3&&pts.length>=K;round++){
  const S=Array.from({length:K},()=>new Float64Array(K+1));for(const [x,y,v] of pts){const f=terms(x,y).slice(0,K);for(let i=0;i<K;i++){for(let j=0;j<K;j++)S[i][j]+=f[i]*f[j];S[i][K]+=f[i]*v;}}
  for(let i=0;i<K;i++)S[i][i]+=1e-6;let ok=true;
  for(let c=0;c<K&&ok;c++){let p=c;for(let r=c+1;r<K;r++)if(Math.abs(S[r][c])>Math.abs(S[p][c]))p=r;[S[c],S[p]]=[S[p],S[c]];if(Math.abs(S[c][c])<1e-12){ok=false;break;}for(let r=0;r<K;r++)if(r!==c){const q=S[r][c]/S[c][c];for(let k=c;k<=K;k++)S[r][k]-=q*S[c][k];}}
  if(!ok)break;fit=S.map((row,i)=>row[K]/row[i]);const keep=pts.filter(([x,y,v])=>v>=value(fit,x,y)*.94);if(keep.length<K||keep.length===pts.length)break;pts=keep;
 }
 for(const c of cells)c.paper=Math.max(40,value(fit,c.c/Math.max(1,C-1),c.r/Math.max(1,R-1)));
}

export const hex=rgb=>'#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');

/**
 * The chart. pages: [{R,C,cells,outside}] joined side by side (same rows) or stacked (rows continue upward; narrower
 * blocks are padded with no-stitch cells on the right). shapeOf/colourOf map a page cell to its group/colour index;
 * names: group index → symbol code or null (knit). A cable named on a group is placed with that cell as its left end.
 */
export function buildChart({pages,join,shapeOf:groupOf,colourOf,names,codeOf,colours,name='本の編み図'}){
 if(codeOf)return buildFromParts({pages,join,codeOf,colourOf,colours,name});
 const rows=join==='side'?pages[0].R:pages.reduce((n,pg)=>n+pg.R,0),cols=join==='side'?pages.reduce((n,pg)=>n+pg.C,0):Math.max(...pages.map(pg=>pg.C));
 if(rows<1||cols<1||rows>2000||cols>2000)throw Error('編み図は最大2000目・2000段です');
 const p=blank(cols,rows);p.name=String(name).trim().slice(0,100)||'本の編み図';
 p.yarns=colours.map((c,id)=>({id,name:c.name||`色${id+1}`,color:c.color}));
 p.cells=Array.from({length:rows},()=>Array(cols).fill(null));p.symbols=Array.from({length:rows},()=>Array(cols).fill(null));p.format='patterncanvas-web-3';
 let rowOffset=0,colOffset=0;
 pages.forEach((pg,n)=>{
  for(let r=0;r<pg.R;r++)for(let c=0;c<pg.C;c++){const k=r*pg.C+c;if(pg.outside[k])continue;p.cells[rowOffset+r][colOffset+c]=colourOf(n,k);}
  for(let r=0;r<pg.R;r++)for(let c=0;c<pg.C;c++){const k=r*pg.C+c,R=rowOffset+r,X=colOffset+c;if(pg.outside[k]||p.symbols[R][X]!==null)continue;
   const code=names[groupOf(n,k)]??null;if(!code)continue;const def=stitchDef(code);if(!def)continue;
   if(def.width===1){p.symbols[R][X]=code;continue;}
   const parts=cellCodes(code);if(X+parts.length>cols||parts.some((_,i)=>p.cells[R][X+i]===null||p.symbols[R][X+i]!==null))continue;
   parts.forEach((part,i)=>{p.symbols[R][X+i]=part;});c+=parts.length-1;}
  if(join==='side')colOffset+=pg.C;else rowOffset+=pg.R;
 });
 p.showDividers=true;return p;
}

/**
 * The rows a book left out (「省略」) between two blocks: the rows just below repeat. The repeat is the shortest that
 * the rows below already follow (a 1-row purl stretch, a 2-row ribbing, …, up to 8 rows), judged on their top rows.
 * rows: bottom first, each [{c,s}] (yarn, symbol). Returns `count` new rows.
 */
export function fillOmitted(rows,count){
 if(!count||!rows.length)return [];
 const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x.c===b[i].c&&x.s===b[i].s),n=rows.length;
 let period=Math.min(n,8),fewest=Infinity;
 for(let p=1;p<=Math.min(8,n);p++){const checks=Math.min(n-p,2*p);if(!checks)continue;let miss=0;for(let t=0;t<checks;t++)if(!same(rows[n-1-t],rows[n-1-t-p]))miss++;const rate=miss/checks;if(rate<fewest-1e-9){fewest=rate;period=p;}}
 return Array.from({length:count},(_,f)=>rows[n-period+(f%period)].map(x=>({...x})));
}

/**
 * The chart from pages, each made of blocks (`parts`, bottom first, with `omits[i]` rows left out between part i and
 * part i+1; a page without parts is one block). Pages join side by side (same rows) or upward. codeOf(n,k,p) and
 * colourOf(n,k,p) give a cell's symbol (a code, a cable part CODE@i, or null) and yarn.
 */
function buildFromParts({pages,join,codeOf,colourOf,colours,name}){
 const pageRows=pages.map((pg,n)=>{
  const parts=pg.parts||[pg],C=Math.max(...parts.map(q=>q.C)),rows=[];
  parts.forEach((part,p)=>{
   if(p>0)rows.push(...fillOmitted(rows,pg.omits?.[p-1]||0));
   for(let r=0;r<part.R;r++){const row=[];for(let c=0;c<C;c++){const k=r*part.C+c;
     if(c>=part.C||part.outside[k]){row.push({c:null,s:null});continue;}
     const code=codeOf(n,k,p);row.push({c:colourOf(n,k,p),s:code&&(stitchPart(code)||stitchDef(code)?.width===1||!stitchDef(code))?code:null});}
    rows.push(row);}
  });
  return {rows,C};
 });
 if(join==='side'&&pageRows.some(pr=>pr.rows.length!==pageRows[0].rows.length))throw Error(`左右のページの段数がそろっていません（${pageRows.map(pr=>pr.rows.length).join('段と')}段）。段数や省略された段数を確かめてください。`);
 const rows=join==='side'?pageRows[0].rows.length:pageRows.reduce((n,pr)=>n+pr.rows.length,0),cols=join==='side'?pageRows.reduce((n,pr)=>n+pr.C,0):Math.max(...pageRows.map(pr=>pr.C));
 if(rows<1||cols<1||rows>2000||cols>2000)throw Error('編み図は最大2000目・2000段です');
 const p=blank(cols,rows);p.name=String(name).trim().slice(0,100)||'本の編み図';
 p.yarns=colours.map((c,id)=>({id,name:c.name||`色${id+1}`,color:c.color}));
 p.cells=Array.from({length:rows},()=>Array(cols).fill(null));p.symbols=Array.from({length:rows},()=>Array(cols).fill(null));p.format='patterncanvas-web-3';
 let r0=0,c0=0;
 for(const pr of pageRows){pr.rows.forEach((row,r)=>row.forEach((x,c)=>{if(x.c===null)return;p.cells[r0+r][c0+c]=x.c;p.symbols[r0+r][c0+c]=x.s;}));if(join==='side')c0+=pr.C;else r0+=pr.rows.length;}
 p.showDividers=true;return p;
}
