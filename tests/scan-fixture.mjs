// Synthetic book page for the scan tests: a knitting chart (grid, symbols, shaded cells, row numbers, title)
// photographed at an angle, optionally on a page that sags (rows bow) and curls (stitch columns bow).
// Chart space: grid from (0,0) to (cols*cell, rows*cell), y down. Cell (i,j): stitch i from the left, row j from the top.

// bend: rows the middle of the page bulges upward; bendX: stitches the middle of the columns bows sideways. Corners stay.
export const bulge=(cx,W,cell,bend)=>bend*cell*(4*(cx/W)*(1-cx/W));
/** The symbol printed in cell (i,j): '−' (purl), '×' (a one-cell cross) or null (knit: blank). */
export const truthSymbol=(i,j)=>(i*7+j*13)%5===0?'−':(i*11+j*3)%7===0?'×':null;
/** Whether cell (i,j) is shaded (a second yarn): a block in the right half. */
export const truthShaded=(i,j,cols,rows)=>i>=cols/2&&j>=rows/4&&j<rows*3/4;
function chartInk(cols,rows,cell,{thickEvery=5,symbols=true,bend=0,bendX=0,shading=false}={}){
 return (cx,cy)=>{
  const W=cols*cell,H=rows*cell;
  if(bend&&cx>=0&&cx<=W)cy+=bulge(cx,W,cell,bend);
  if(bendX&&cy>=0&&cy<=H)cx+=bulge(cy,H,cell,bendX);
  if(cx>=-1&&cx<=W+1&&cy>=-1&&cy<=H+1){
   const gx=Math.round(cx/cell),gy=Math.round(cy/cell),dx=Math.abs(cx-gx*cell),dy=Math.abs(cy-gy*cell),rowFromBottom=rows-gy;
   const vLine=dx<(gx%10===0?1.6:.8),hLine=dy<(rowFromBottom%thickEvery===0?1.6:.8);
   if((vLine&&cy>=0&&cy<=H)||(hLine&&cx>=0&&cx<=W))return 70;
   const i=Math.floor(cx/cell),j=Math.floor(cy/cell),fx=cx/cell-i-.5,fy=cy/cell-j-.5,ground=shading&&truthShaded(i,j,cols,rows)?175:238;
   if(symbols){const s=truthSymbol(i,j);
    if(s==='−'&&Math.abs(fx)<.3&&Math.abs(fy)<.06)return 60;
    if(s==='×'&&Math.abs(Math.abs(fx)-Math.abs(fy))<.05&&Math.abs(fx)<.3)return 60;}
   return ground;
  }
  // Row numbers every 5 rows at the right, a title above: dark blobs not connected to the grid.
  const j=Math.round((H-cy)/cell);if(cx>W+cell*.6&&cx<W+cell*1.8&&j%5===0&&Math.abs((H-cy)-j*cell+cell/2)<cell*.3)return 50;
  if(cy<-cell*2&&cy>-cell*3&&cx>0&&cx<W*.5&&Math.floor(cx/(cell*.7))%2===0)return 50;
  return 238;
 };
}
function solve(A,b){const n=b.length;A=A.map((r,i)=>[...r,b[i]]);for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];for(let r=0;r<n;r++)if(r!==c){const f=A[r][c]/A[c][c];for(let k=c;k<=n;k++)A[r][k]-=f*A[c][k];}}return A.map((r,i)=>r[n]/r[i]);}
// Projective map from 4 source points to 4 destination points (8x8 DLT).
function projective(src,dst){const A=[],b=[];src.forEach(([x,y],i)=>{const [u,v]=dst[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);});const [a,bb,c,d,e,f,g,h]=solve(A,b);return (x,y)=>{const w=g*x+h*y+1;return [(a*x+bb*y+c)/w,(d*x+e*y+f)/w];};}
/** Photo (w x h RGBA) of the chart whose grid corners land on `quad`. Supersampled 2x2, with paper noise. */
export function photograph(cols,rows,cell,quad,w,h,options){
 const ink=chartInk(cols,rows,cell,options),W=cols*cell,H=rows*cell,toChart=projective(quad,[[0,0],[W,0],[W,H],[0,H]]),out=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(const [ox,oy] of [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]){const [cx,cy]=toChart(x+ox,y+oy);s+=ink(cx,cy);}
  const v=s/4+((x*31+y*17)%11)-5-(x/w)*20,i=(y*w+x)*4;out[i]=v;out[i+1]=v*.97;out[i+2]=v*.92;out[i+3]=255;}
 return out;
}

// ---- a printed symbol chart (JIS style) for the recognition tests ----
// Each row is a sequence of symbols separated by knit (blank) cells, shifted row by row. Drawn independently of the
// app's references: other stroke weights and proportions, cables with a gap where a strand passes under.
const SEQUENCE=['P',null,'RC1',null,'YO',null,'LC1',null,'K2TOG',null,'SSK',null,'RC2',null,'LC2',null,'SL',null,'BO',null,'TBL',null,'P','P',null];
const WIDTH={RC1:2,LC1:2,RC2:4,LC2:4};
/** Cell code printed at stitch i (from the left), row j (from the top): null (knit), a code, or a cable part CODE@k. */
export function truthCode(i,j,cols){
 let x=-(j*3)%SEQUENCE.length;const row=Array(cols).fill(null);
 for(let n=0;x<cols;n++){const code=SEQUENCE[n%SEQUENCE.length],w=WIDTH[code]||1;
  if(code&&x>=0&&x+w<=cols)for(let k=0;k<w;k++)row[x+k]=w>1?`${code}@${k}`:code;x+=w;}
 return row[i];
}
const segD=(px,py,x0,y0,x1,y1)=>{const dx=x1-x0,dy=y1-y0,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((px-x0)*dx+(py-y0)*dy)/l)):0;return Math.hypot(px-x0-t*dx,py-y0-t*dy);};
/** Whether point (fx,fy) of a cell (0-1, y down) is ink for the printed symbol `code` (a cable part draws its share). */
export function printedInk(code,fx,fy){
 if(!code)return false;const half=.045;const [base,at]=code.split('@'),k=Number(at||0);
 const seg=(x0,y0,x1,y1)=>segD(fx,fy,x0,y0,x1,y1)<half;
 switch(base){
  case 'P':return seg(.3,.5,.7,.5);
  case 'YO':return Math.abs(Math.hypot(fx-.5,fy-.5)-.21)<half;
  case 'BO':return Math.hypot(fx-.5,fy-.5)<.2;
  case 'SL':return seg(.28,.22,.5,.78)||seg(.5,.78,.72,.22);
  case 'TBL':{const a=Math.atan2(fy-.42,fx-.5),r=Math.hypot(fx-.5,fy-.42);return (Math.abs(r-.17)<half&&fy<.55)||seg(.36,.52,.68,.8)||seg(.64,.52,.32,.8);}
  case 'K2TOG':return seg(.25,.8,.5,.2)||seg(.75,.8,.56,.42);
  case 'SSK':return seg(.75,.8,.5,.2)||seg(.25,.8,.44,.42);
 }
 const w=WIDTH[base],x=fx+k,right=base.startsWith('R'),kk=base.endsWith('2')?2:1,m=w-kk,a=i=>i+.5;
 const over=right?Array.from({length:kk},(_,i)=>[a(m+i),a(i)]):Array.from({length:kk},(_,i)=>[a(i),a(m+i)]);
 const under=right?Array.from({length:m},(_,i)=>[a(i),a(kk+i)]):Array.from({length:m},(_,i)=>[a(kk+i),a(i)]);
 const on=([x0,x1],gap)=>{const d=segD(x,fy,x0,.86,x1,.14);if(d>=half)return false;if(!gap)return true;const t=(.86-fy)/.72;return Math.abs(t-.5)>.15;};
 return over.some(s=>on(s,false))||under.some(s=>on(s,true));
}
/** Photo of a printed symbol chart: grid lines, symbols from truthCode, row numbers; tilted and optionally bent. */
export function photographSymbols(cols,rows,cell,quad,w,h,{bend=0}={}){
 const W=cols*cell,H=rows*cell,toChart=projective(quad,[[0,0],[W,0],[W,H],[0,H]]),out=new Uint8ClampedArray(w*h*4);
 const ink=(cx,cy)=>{if(bend&&cx>=0&&cx<=W)cy+=bulge(cx,W,cell,bend);
  if(cx<-1||cx>W+1||cy<-1||cy>H+1)return 238;
  const gx=Math.round(cx/cell),gy=Math.round(cy/cell);if(Math.abs(cx-gx*cell)<.8||Math.abs(cy-gy*cell)<.8)return 80;
  const i=Math.floor(cx/cell),j=Math.floor(cy/cell);return printedInk(truthCode(i,j,cols),cx/cell-i,cy/cell-j)?55:238;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(const [ox,oy] of [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]){const [cx,cy]=toChart(x+ox,y+oy);s+=ink(cx,cy);}
  const v=s/4+((x*31+y*17)%11)-5,i=(y*w+x)*4;out[i]=v;out[i+1]=v*.97;out[i+2]=v*.92;out[i+3]=255;}
 return out;
}
