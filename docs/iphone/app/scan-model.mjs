// Reading a chart photographed from a book: flatten the perspective from four corners, then find the printed grid
// lines. A book page is rarely flat (it sags and curls toward the binding), so lines are tracked in strips and fitted
// as a smooth surface over the page (fitPage); chart-convert.mjs uses them to read every cell. Deterministic and local;
// no OCR, no AI, no network.
//
// Coordinates: quad corners are [tl,tr,br,bl] in source pixels, as the chart is read (top = last rows). Fitted lines are
// {strips, lines}: strip centres (0-1, image x) and per strip the boundaries bottom-up (0-1, image y).
export const SCAN_MAX_ROWS=2000,SCAN_LONG_SIDE=2400;
// Margin kept around the grid (in grid widths / heights) so the book's row numbers stay visible.
export const SCAN_MARGIN=Object.freeze({x:.12,y:.06});

/** (u,v) in the unit square → source pixel, for the quad [tl,tr,br,bl] (Heckbert's square-to-quad mapping). */
export function homography(quad){
 const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=quad,dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
 let g=0,h=0;
 if(Math.abs(dx3)>1e-9||Math.abs(dy3)>1e-9){const den=dx1*dy2-dx2*dy1;if(Math.abs(den)<1e-9)throw Error('四隅の位置を確かめてください。');g=(dx3*dy2-dx2*dy3)/den;h=(dx1*dy3-dx3*dy1)/den;}
 const a=x1-x0+g*x1,b=x3-x0+h*x3,d=y1-y0+g*y1,e=y3-y0+h*y3;
 return (u,v)=>{const w=g*u+h*v+1;return [(a*u+b*v+x0)/w,(d*u+e*v+y0)/w];};
}

/** The quad must be convex, in reading order (clockwise on screen) and not tiny. */
export function checkQuad(quad,width,height){
 if(!Array.isArray(quad)||quad.length!==4||quad.some(q=>!Array.isArray(q)||q.length!==2||!q.every(Number.isFinite)))throw Error('四隅の位置を確かめてください。');
 let sign=0,area=0;
 for(let i=0;i<4;i++){const [ax,ay]=quad[i],[bx,by]=quad[(i+1)%4],[cx,cy]=quad[(i+2)%4],cross=(bx-ax)*(cy-by)-(by-ay)*(cx-bx);if(Math.abs(cross)<1e-6)throw Error('四隅が一直線に並んでいます。角を広げてください。');if(sign&&Math.sign(cross)!==sign)throw Error('四隅の順番が入れ替わっています。左上・右上・右下・左下に合わせてください。');sign=Math.sign(cross);area+=ax*by-bx*ay;}
 if(sign<0)throw Error('四隅の順番が入れ替わっています。左上・右上・右下・左下に合わせてください。');
 if(Math.abs(area)/2<width*height*.01)throw Error('編み図の枠が小さすぎます。四隅をマス目の角に合わせてください。');
}

/** Output size for a flattened page: the grid keeps its measured proportions, long side ≤ maxLong, never enlarged. */
export function flatSize(quad,maxLong=SCAN_LONG_SIDE,margin=SCAN_MARGIN){
 const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),[tl,tr,br,bl]=quad,gw=(len(tl,tr)+len(bl,br))/2,gh=(len(tl,bl)+len(tr,br))/2;
 const fw=gw*(1+2*margin.x),fh=gh*(1+2*margin.y),k=Math.min(1,maxLong/Math.max(fw,fh));
 const width=Math.max(8,Math.round(fw*k)),height=Math.max(8,Math.round(fh*k));
 return {width,height,grid:{left:margin.x/(1+2*margin.x),right:(1+margin.x)/(1+2*margin.x),top:margin.y/(1+2*margin.y),bottom:(1+margin.y)/(1+2*margin.y)}};
}

/** Flatten the quad (plus margin) into a width x height RGBA raster by bilinear sampling. Outside the photo is white. */
export function rectify(rgba,srcW,srcH,quad,{width,height,margin=SCAN_MARGIN}={}){
 checkQuad(quad,srcW,srcH);
 const size=width&&height?{width,height,grid:flatSize(quad,Infinity,margin).grid}:flatSize(quad,SCAN_LONG_SIDE,margin),map=homography(quad),out=new Uint8ClampedArray(size.width*size.height*4);
 for(let y=0;y<size.height;y++){const v=((y+.5)/size.height)*(1+2*margin.y)-margin.y;
  for(let x=0;x<size.width;x++){const u=((x+.5)/size.width)*(1+2*margin.x)-margin.x,[sx,sy]=map(u,v),o=(y*size.width+x)*4;
   const fx=sx-.5,fy=sy-.5,x0=Math.floor(fx),y0=Math.floor(fy),ax=fx-x0,ay=fy-y0;
   if(!(x0>=-1&&y0>=-1&&x0<srcW&&y0<srcH)){out[o]=out[o+1]=out[o+2]=out[o+3]=255;continue;}
   const cx0=Math.max(0,x0),cy0=Math.max(0,y0),cx1=Math.min(srcW-1,x0+1),cy1=Math.min(srcH-1,y0+1),i00=(cy0*srcW+cx0)*4,i10=(cy0*srcW+cx1)*4,i01=(cy1*srcW+cx0)*4,i11=(cy1*srcW+cx1)*4;
   for(let c=0;c<3;c++)out[o+c]=(rgba[i00+c]*(1-ax)+rgba[i10+c]*ax)*(1-ay)+(rgba[i01+c]*(1-ax)+rgba[i11+c]*ax)*ay;
   out[o+3]=255;}}
 return {data:out,width:size.width,height:size.height,grid:size.grid};
}

/**
 * A part of the flattened page (x0..x1, y0..y1 in pixels of a flatW x flatH flattening) as grey, k times denser, read
 * straight from the photo: small print (row numbers) keeps the photo's own detail instead of the flattened image's.
 */
export function flatRegion(rgba,srcW,srcH,quad,flatW,flatH,{x0,x1,y0,y1},k,margin=SCAN_MARGIN){
 const map=homography(quad),w=Math.max(1,Math.round((x1-x0)*k)),h=Math.max(1,Math.round((y1-y0)*k)),gray=new Float32Array(w*h);
 for(let y=0;y<h;y++){const v=((y0+(y+.5)/k)/flatH)*(1+2*margin.y)-margin.y;
  for(let x=0;x<w;x++){const u=((x0+(x+.5)/k)/flatW)*(1+2*margin.x)-margin.x,[sx,sy]=map(u,v),fx=Math.max(0,Math.min(srcW-1.001,sx-.5)),fy=Math.max(0,Math.min(srcH-1.001,sy-.5)),ix=Math.floor(fx),iy=Math.floor(fy),ax=fx-ix,ay=fy-iy;
   let s=0;for(const [dx,dy,wt] of [[0,0,(1-ax)*(1-ay)],[1,0,ax*(1-ay)],[0,1,(1-ax)*ay],[1,1,ax*ay]]){const i=((iy+dy)*srcW+ix+dx)*4;s+=wt*(rgba[i]*.299+rgba[i+1]*.587+rgba[i+2]*.114);}gray[y*w+x]=s;}}
 return {gray,width:w,height:h};
}

export function grayscale(rgba,width,height){const g=new Float32Array(width*height);for(let i=0;i<g.length;i++){const a=rgba[i*4+3]/255;g[i]=(rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114)*a+255*(1-a);}return g;}

/**
 * Strength of a thin dark horizontal line at each image row over columns x0..x1: the mean, or with `quantile` that
 * share from the bottom of the per-column values. A printed grid line runs across the whole strip, a symbol stroke
 * (a purl dash in every cell) only across part of it, so a low quantile keeps the grid lines and drops the symbols.
 */
export function lineProfile(gray,width,height,x0=0,x1=width,quantile=null){
 const out=new Float64Array(height),from=Math.max(0,Math.floor(x0)),to=Math.min(width,Math.ceil(x1)),n=Math.max(1,to-from),vals=new Float64Array(n);
 for(let y=0;y<height;y++){let sum=0;
  for(let x=from;x<to;x++){const v=gray[y*width+x];let best=0;for(const d of [1,2,3]){const a=gray[Math.max(0,y-d)*width+x],b=gray[Math.min(height-1,y+d)*width+x],r=Math.min(a,b)-v;if(r>best)best=r;}sum+=best;vals[x-from]=best;}
  if(quantile===null)out[y]=sum/n;else{vals.sort();out[y]=vals[Math.min(n-1,Math.floor(n*quantile))];}}
 return out;
}

/** Level a profile value must reach to count as a printed line: well above the paper, relative to the strong lines. */
function lineLevel(profile,top,bottom){const sorted=Array.from(profile.slice(Math.max(0,Math.floor(top)),Math.ceil(bottom))).sort((a,b)=>a-b),floor=sorted[Math.floor(sorted.length*.5)]||0,peak=sorted[Math.floor(sorted.length*.97)]||0;return peak>floor?floor+(peak-floor)*.35:Infinity;}
/** Printed lines in a profile: local maxima at the line level, at least 3 px apart (the stronger one kept). */
function linePeaks(profile,top,bottom,need){
 const out=[];for(let y=Math.max(1,Math.floor(top)-4);y<=Math.min(profile.length-2,Math.ceil(bottom)+4);y++)if(profile[y]>=need&&profile[y]>=profile[y-1]&&profile[y]>profile[y+1]){if(out.length&&y-out.at(-1)<3){if(profile[y]>profile[out.at(-1)])out[out.length-1]=y;}else out.push(y);}
 return out;
}

/**
 * Rows between the grid's top and bottom edge, read from the printed row lines of one strip. Returns
 * {rows,confidence,ys} (ys: boundaries in pixels, bottom first) or {rows:null} when no regular grid is visible.
 * The row spacing is the distance that most lines share with another line (symbols inside a cell, such as the three
 * strokes of a cable, are close together but not repeated row after row). Then, from the bottom edge up, each next
 * boundary is the line nearest one spacing above; a missing line is filled in, and the spacing follows slow changes
 * (a page that curves away from the camera has shorter rows at the far end).
 */
export function estimateRows(profile,top,bottom){
 const H=bottom-top,none={rows:null,confidence:0,ys:null};if(!(H>=24))return none;
 const need=lineLevel(profile,top,bottom);if(!Number.isFinite(need))return none;
 const peaks=linePeaks(profile,top,bottom,need);if(peaks.length<3)return none;
 const has=(y,tol)=>{let lo=0,hi=peaks.length-1;while(lo<=hi){const m=(lo+hi)>>1;if(peaks[m]<y-tol)lo=m+1;else if(peaks[m]>y+tol)hi=m-1;else return true;}return false;};
 const score=p=>{const tol=2;let n=0;for(const q of peaks)if(has(q+p,tol))n++;return n;};
 let best=0,scores=[];for(let p=7;p<=Math.min(H/2,400);p+=.5){const v=score(p);scores.push([p,v]);if(v>best)best=v;}
 // The spacing must stand out from the rest: random marks match some distance by chance, a grid one distance clearly.
 const typical=[...scores.map(s=>s[1])].sort((a,b)=>a-b)[Math.floor(scores.length/2)];
 if(best<3||best<peaks.length*.3||best<typical*2){const p=scores.find(([,v])=>v===best)?.[0];return {...none,guess:p&&best>=3?Math.round(H/p):null};}
 const pitch=scores.find(([,v])=>v>=best*.85)[0];
 // The bottom line: the line nearest the bottom edge, up to 3/4 of a row above it (a sagging page lifts the middle).
 let y=bottom,near=Infinity;for(const q of peaks){const d=bottom-q;if(d>=-pitch/2&&d<=pitch*.75&&Math.abs(d)<near){near=Math.abs(d);y=q;}}
 const ys=[y];let local=pitch,found=0;
 while(ys.at(-1)-local>=top-local*.75&&ys.length<=SCAN_MAX_ROWS){
  const expected=ys.at(-1)-local;let next=null;for(const q of peaks)if(Math.abs(q-expected)<=local*.3&&(next===null||Math.abs(q-expected)<Math.abs(next-expected)))next=q;
  if(next!==null){found++;local=Math.max(pitch*.85,Math.min(pitch*1.15,local*.75+(ys.at(-1)-next)*.25));ys.push(next);}else ys.push(expected);
 }
 const rows=ys.length-1,confidence=rows?found/rows:0;
 // Unsure: no count, but the walk's count is kept as a guess for when no strip is sure.
 return rows<1||confidence<.6?{rows:null,confidence,ys:null,guess:rows>=1?rows:null}:{rows,confidence,ys:smooth(ys,pitch),guess:rows};
}

/** A boundary far from the middle of its neighbours caught a symbol stroke, not the row line: put it back between them. */
function smooth(ys,pitch){for(let i=1;i<ys.length-1;i++){const mid=(ys[i-1]+ys[i+1])/2;if(Math.abs(ys[i]-mid)>pitch*.25)ys[i]=mid;}return ys;}

/** Move each boundary onto the strongest printed line within a third of a row of its guess; keep the order. */
function snapLines(profile,guess,pitch,need){
 const ys=[...guess],reach=pitch/3;
 for(let i=0;i<ys.length;i++){let at=guess[i],best=need;for(let y=Math.ceil(guess[i]-reach);y<=Math.floor(guess[i]+reach);y++)if(y>=0&&y<profile.length&&profile[y]>best){best=profile[y];at=y;}ys[i]=at;}
 for(let i=1;i<ys.length;i++)if(!(ys[i]<ys[i-1]-pitch*.4))ys[i]=guess[i];
 for(let i=ys.length-2;i>=0;i--)if(!(ys[i]>ys[i+1]+pitch*.4))ys[i]=guess[i];
 return smooth(ys,pitch);
}

/**
 * rows+1 boundaries from the bottom edge up (0-1, image y) for one profile: evenly spaced between the grid edges,
 * each moved onto the nearest printed line within a third of a row.
 */
export function fitLines(profile,top,bottom,rows,imageHeight){
 if(!Number.isInteger(rows)||rows<1||rows>SCAN_MAX_ROWS)throw Error(`段数は1〜${SCAN_MAX_ROWS}の整数で入力してください。`);
 const pitch=(bottom-top)/rows,even=Array.from({length:rows+1},(_,i)=>bottom-pitch*i);
 const ys=profile&&pitch>=6?snapLines(profile,even,pitch,lineLevel(profile,top,bottom)):even;
 return ys.map(y=>Math.round(y/imageHeight*1e5)/1e5);
}

/** Vertical strips across the grid, about 80 px wide (4-24), each with its own line profile. */
export function analyzePage(gray,width,height,grid){
 const left=grid.left*width,right=grid.right*width,n=Math.max(4,Math.min(24,Math.round((right-left)/80))),top=grid.top*height,bottom=grid.bottom*height,strips=[];
 for(let s=0;s<n;s++){const x0=left+(right-left)*s/n,x1=left+(right-left)*(s+1)/n;let profile=lineProfile(gray,width,height,x0+2,x1-2,.3),estimate=estimateRows(profile,top,bottom);
  // Blurred or faint print loses its lines in the low share: read the strip again from the mean.
  if(!estimate.rows){const mean=lineProfile(gray,width,height,x0+2,x1-2),again=estimateRows(mean,top,bottom);if(again.rows||(!estimate.guess&&again.guess))estimate={...again,weight:.5};} // a weaker reading: half a vote, for the count only (the mean also catches symbol strokes, so lines are placed from the low share)
  strips.push({center:(x0+x1)/2/width,profile,estimate});}
 // The row count most strips agree on, weighted by how clearly each strip shows it.
 // Counts one apart agree half (the top edge may fall either side of a line in a strip).
 const votes=new Map();for(const st of strips){const r=st.estimate.rows;if(!r)continue;for(const [k,w] of [[r,1],[r-1,.5],[r+1,.5]])votes.set(k,(votes.get(k)||0)+st.estimate.confidence*w*(st.estimate.weight??1));}
 let rows=null,score=0;for(const [r,v] of votes)if(v>score||(v===score&&r>rows)){rows=r;score=v;}
 if(score>=Math.max(1.2,n*.15))return {width,height,top,bottom,left,right,strips,rows,sure:true,confidence:score/n};
 // No strip is sure: the middle of their guesses (shown for checking) rather than nothing.
 const guesses=strips.map(st=>st.estimate.rows??st.estimate.guess).filter(Boolean).sort((a,b)=>a-b);
 return {width,height,top,bottom,left,right,strips,rows:guesses.length?guesses[Math.floor(guesses.length/2)]:null,sure:false,confidence:score/n};
}

/**
 * Lines for every strip: start in the clearest strip (its own lines, or evenly spaced and snapped), then walk outward, each strip
 * starting from its neighbour's lines, so a row is followed as it bends toward the binding.
 */
export function fitPage(analysis,rows){
 if(!Number.isInteger(rows)||rows<1||rows>SCAN_MAX_ROWS)throw Error(`段数は1〜${SCAN_MAX_ROWS}の整数で入力してください。`);
 const {strips,top,bottom,height}=analysis,pitch=(bottom-top)/rows,even=Array.from({length:rows+1},(_,i)=>bottom-pitch*i),out=[];
 const level=strips.map(st=>lineLevel(st.profile,top,bottom)),clarity=strips.map(st=>st.estimate.rows===rows&&!st.estimate.weight?st.estimate.confidence:0); // a count-only reading has no lines to start from
 let start=clarity.indexOf(Math.max(...clarity));if(!(clarity[start]>0))start=Math.floor(strips.length/2);
 const fit=(s,guess)=>pitch>=6&&Number.isFinite(level[s])?snapLines(strips[s].profile,guess,pitch,level[s]):[...guess];
 // A strip that read the same count keeps its own lines when they agree with its neighbour's; otherwise it follows them.
 const own=(s,near)=>{const ys=strips[s].estimate.rows===rows&&!strips[s].estimate.weight?strips[s].estimate.ys:null;return ys&&(!near||ys.every((y,i)=>Math.abs(y-near[i])<pitch*.35))?[...ys]:null;};
 out[start]=own(start)||fit(start,even);
 for(let s=start-1;s>=0;s--)out[s]=own(s,out[s+1])||fit(s,out[s+1]);
 for(let s=start+1;s<strips.length;s++)out[s]=own(s,out[s-1])||fit(s,out[s-1]);
 // The page bends smoothly (sag, curl toward the binding): fit the shift of the lines from even spacing as one smooth
 // surface over the whole page, ignoring boundaries that sit on no printed line or disagree with the rest; snap again
 // from that surface, and repeat with more freedom. A strip that locked onto the wrong line is pulled back.
 if(pitch>=6&&strips.length>=3){
  const X=strips.map(st=>st.center),x0=Math.min(...X),x1=Math.max(...X),U=X.map(x=>x1>x0?(x-x0)/(x1-x0)*2-1:0),T=even.map((_,i)=>i/rows*2-1);
  const onLine=(s,y)=>{const p=strips[s].profile,k=Math.round(y);return Number.isFinite(level[s])&&[k-1,k,k+1].some(j=>j>=0&&j<p.length&&p[j]>=level[s]);};
  let surface=null;
  for(const deg of [1,2,3]){
   const pts=[];out.forEach((ys,s)=>ys.forEach((y,i)=>{if(onLine(s,y))pts.push([U[s],T[i],y-even[i]]);}));
   if(pts.length<(deg+1)**2*3)break;
   const f=smoothSurface(pts,deg,Math.max(1.5,pitch*.25));if(!f)break;surface=f;
   out.forEach((_,s)=>{const guess=even.map((y,i)=>y+surface(U[s],T[i]));out[s]=fit(s,guess);});
  }
  if(surface){out.forEach((ys,s)=>{out[s]=ys.map((y,i)=>{const g=even[i]+surface(U[s],T[i]);return onLine(s,y)?g+Math.max(-pitch*.2,Math.min(pitch*.2,y-g)):g;});});
   // The grid's own edges, from the surface: beyond the outer strips the lines keep bending instead of staying flat.
   if(analysis.left!==undefined&&x1>x0){const edge=x=>{const u=(x/analysis.width-x0)/(x1-x0)*2-1;return even.map((y,i)=>y+surface(u,T[i]));};
    const xs=strips.map(st=>st.center),L=analysis.left/analysis.width,R=analysis.right/analysis.width;
    return {strips:[L,...xs,R].map(x=>Math.round(x*1e5)/1e5),lines:[edge(analysis.left),...out,edge(analysis.right)].map(ys=>ys.map(y=>Math.round(y/height*1e5)/1e5))};}
  }
 }
 return {strips:strips.map(st=>Math.round(st.center*1e5)/1e5),lines:out.map(ys=>ys.map(y=>Math.round(y/height*1e5)/1e5))};
}

/**
 * Least-squares polynomial surface d(u,t) of the given degree in each variable (u,t in -1..1) through points [u,t,d],
 * refitted twice without the points further than `outlier` from it. Null when the system cannot be solved.
 */
function smoothSurface(points,deg,outlier){
 const terms=[];for(let a=0;a<=deg;a++)for(let b=0;b<=deg;b++)terms.push([a,b]);
 const basis=(u,t)=>terms.map(([a,b])=>u**a*t**b);let coef=null,use=points;
 for(let round=0;round<3;round++){
  const n=terms.length,A=Array.from({length:n},()=>new Float64Array(n+1));
  for(const [u,t,d] of use){const v=basis(u,t);for(let i=0;i<n;i++){for(let j=0;j<n;j++)A[i][j]+=v[i]*v[j];A[i][n]+=v[i]*d;}}
  for(let i=0;i<n;i++)A[i][i]+=1e-6;
  for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];if(Math.abs(A[c][c])<1e-12)return null;for(let r=0;r<n;r++)if(r!==c){const f=A[r][c]/A[c][c];for(let k=c;k<=n;k++)A[r][k]-=f*A[c][k];}}
  coef=A.map((row,i)=>row[n]/row[i]);
  const value=(u,t)=>basis(u,t).reduce((s,v,i)=>s+v*coef[i],0);
  const next=points.filter(([u,t,d])=>Math.abs(value(u,t)-d)<=outlier);if(next.length<n*2)break;use=next;
 }
 return (u,t)=>basis(u,t).reduce((s,v,i)=>s+v*coef[i],0);
}

/** Boundaries of a page at image x (0-1), interpolated between strips. */
export function linesAt(pg,x){
 const xs=pg.strips;if(x<=xs[0])return pg.lines[0];if(x>=xs.at(-1))return pg.lines.at(-1);
 let s=0;while(x>xs[s+1])s++;const t=(x-xs[s])/(xs[s+1]-xs[s]);return pg.lines[s].map((y,i)=>y+(pg.lines[s+1][i]-y)*t);
}

/** Fit x = a*t + b to points [t,x], dropping the worst third twice (labels and numbers that stick out of the grid). */
function robustLine(points){
 let pts=points;for(let round=0;round<3;round++){
  const n=pts.length,mt=pts.reduce((s,p)=>s+p[0],0)/n,mx=pts.reduce((s,p)=>s+p[1],0)/n;let num=0,den=0;for(const [t,x] of pts){num+=(t-mt)*(x-mx);den+=(t-mt)**2;}
  const a=den?num/den:0,b=mx-a*mt;if(round===2||n<8)return {a,b};
  pts=pts.map(p=>[p,Math.abs(p[1]-(a*p[0]+b))]).sort((p,q)=>p[1]-q[1]).slice(0,Math.max(4,Math.ceil(n*.67))).map(p=>p[0]);
 }
}

/**
 * Initial corners. The printed grid is one large connected web of thin dark lines: mark pixels that are a thin dark
 * line across or along (not broad shadows), take the biggest connected piece, and fit a straight line to each of its
 * four outer edges, ignoring the labels and row numbers that stick out. The corners are where those lines meet.
 * Null when nothing grid-like is found; the user then places the corners.
 */
export function detectGrid(gray,width,height){
 const mask=new Uint8Array(width*height),T=12,at=(x,y)=>gray[y*width+x];
 for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){const v=at(x,y);
  if(Math.min(at(x,y-2),at(x,y+2))-v>T||Math.min(at(x-2,y),at(x+2,y))-v>T||Math.min(at(x,y-1),at(x,y+1))-v>T||Math.min(at(x-1,y),at(x+1,y))-v>T)mask[y*width+x]=1;}
 const seen=new Uint8Array(width*height),stack=[];let best=null;
 for(let start=0;start<mask.length;start++){if(!mask[start]||seen[start])continue;
  const pixels=[];seen[start]=1;stack.push(start);
  while(stack.length){const i=stack.pop(),x=i%width,y=(i-x)/width;pixels.push(i);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const j=ny*width+nx;if(mask[j]&&!seen[j]){seen[j]=1;stack.push(j);}}}
  if(pixels.length>(best?.length??0))best=pixels;
 }
 if(!best||best.length<(width+height)*2)return null;
 const left=new Map(),right=new Map(),top=new Map(),bottom=new Map();
 for(const i of best){const x=i%width,y=(i-x)/width;
  if(!left.has(y)||x<left.get(y))left.set(y,x);if(!right.has(y)||x>right.get(y))right.set(y,x);
  if(!top.has(x)||y<top.get(x))top.set(x,y);if(!bottom.has(x)||y>bottom.get(x))bottom.set(x,y);}
 const L=robustLine([...left]),R=robustLine([...right]),U=robustLine([...top]),D=robustLine([...bottom]);
 // x = L.a*y + L.b meets y = U.a*x + U.b
 const meet=(V,H)=>{const y=(H.a*V.b+H.b)/(1-H.a*V.a);return [V.a*y+V.b,y];};
 const quad=[meet(L,U),meet(R,U),meet(R,D),meet(L,D)].map(([x,y])=>[Math.max(0,Math.min(width,x)),Math.max(0,Math.min(height,y))]);
 // Only a plausible frame is offered: edges within 10° of level/upright, opposite sides of similar length.
 // A twisted guess (shaped charts, faint grids) is harder to fix than the plain default rectangle.
 const side=(a,b)=>[quad[b][0]-quad[a][0],quad[b][1]-quad[a][1]],len=v=>Math.hypot(...v),[t,r,bt,l]=[side(0,1),side(1,2),side(3,2),side(0,3)];
 const level=v=>Math.abs(Math.atan2(v[1],v[0]))<Math.PI/18,upright=v=>Math.abs(Math.atan2(v[0],v[1]))<Math.PI/18,similar=(a,b)=>len(a)/len(b)>.8&&len(a)/len(b)<1/.8;
 if(len(t)<width*.15||len(l)<height*.1||!level(t)||!level(bt)||!upright(l)||!upright(r)||!similar(t,bt)||!similar(l,r))return null;
 try{checkQuad(quad,width,height);}catch{return null;}
 return quad;
}

/** Default corners when nothing is detected: an inset rectangle. */
export const insetQuad=(width,height,k=.15)=>[[width*k,height*k],[width*(1-k),height*k],[width*(1-k),height*(1-k)],[width*k,height*(1-k)]];
