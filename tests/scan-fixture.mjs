// Synthetic book page for the scan tests: a knitting chart (grid, symbols, row numbers, title) photographed at an angle.
// Chart space: grid from (0,0) to (cols*cell, rows*cell). Returns grey value at a chart point.
// bend: rows the middle of the page bulges upward (a page curving toward the binding); the corners stay put.
export const bulge=(cx,W,cell,bend)=>bend*cell*(4*(cx/W)*(1-cx/W));
function chartInk(cols,rows,cell,{thickEvery=5,symbols=true,bend=0}={}){
 return (cx,cy)=>{
  const W=cols*cell,H=rows*cell;if(bend&&cx>=0&&cx<=W)cy+=bulge(cx,W,cell,bend);
  if(cx>=-1&&cx<=W+1&&cy>=-1&&cy<=H+1){
   const gx=Math.round(cx/cell),gy=Math.round(cy/cell),dx=Math.abs(cx-gx*cell),dy=Math.abs(cy-gy*cell),rowFromBottom=rows-gy;
   const vLine=dx<(gx%10===0?1.6:.8),hLine=dy<(rowFromBottom%thickEvery===0?1.6:.8);
   if((vLine&&cy>=0&&cy<=H)||(hLine&&cx>=0&&cx<=W))return 70;
   if(symbols){const i=Math.floor(cx/cell),j=Math.floor(cy/cell),fx=cx/cell-i-.5,fy=cy/cell-j-.5;
    if((i*7+j*13)%5===0&&Math.abs(fx)<.3&&Math.abs(fy)<.06)return 60;                 // "−" purl
    if((i*11+j*3)%7===0&&Math.abs(Math.abs(fx)-Math.abs(fy))<.05&&Math.abs(fx)<.3)return 60;} // "×" cross
   return 238;
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
