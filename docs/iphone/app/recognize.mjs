import {STITCHES,cableStrands,cellCodes,PURLED} from './stitches.mjs';

// Reading the knitting symbols of a straightened book chart, cell by cell, without a model: every cell's ink is
// compared with drawn references of the Japanese chart symbols (JIS style), and cables are found as runs of cells
// whose strokes cross into each other, then told apart by which strands pass on top. Ink maps are N x N samples of a
// cell's inside (chart-convert.mjs readCells), 0 = paper, 1 = full ink, top row first.

export const INSET=.16; // the part of a cell next to its sides is not sampled (the grid lines)

/** Ink moved so its centre of ink sits in the middle (up to 2 samples), then scaled to its darkest stroke. */
export function centred(ink,N=Math.round(Math.sqrt(ink.length))){
 let s=0,sx=0,sy=0,top=0;for(let j=0;j<N;j++)for(let i=0;i<N;i++){const v=ink[j*N+i];s+=v;sx+=v*i;sy+=v*j;if(v>top)top=v;}
 if(!s)return Float32Array.from(ink);const dx=Math.max(-2,Math.min(2,Math.round((N-1)/2-sx/s))),dy=Math.max(-2,Math.min(2,Math.round((N-1)/2-sy/s))),o=new Float32Array(ink.length);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=i-dx,b=j-dy;if(a>=0&&b>=0&&a<N&&b<N)o[j*N+i]=ink[b*N+a]/top;}
 return o;
}
/** Softened by one sample, so a stroke a little off its place still matches. */
export function soften(ink,N=Math.round(Math.sqrt(ink.length))){const o=new Float32Array(ink.length);for(let j=0;j<N;j++)for(let i=0;i<N;i++){let s=0,n=0;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const a=i+di,b=j+dj;if(a>=0&&b>=0&&a<N&&b<N){const w=di||dj?.5:1;s+=ink[b*N+a]*w;n+=w;}}o[j*N+i]=s/n;}return o;}
export const shapeOf=ink=>soften(centred(ink));
export const distance=(a,b)=>{let s=0;for(let k=0;k<a.length;k++)s+=Math.abs(a[k]-b[k]);return s/a.length;};

// ---- drawn references ----
// Strokes in cell units (x right, y down, 0-1 per cell): seg [x0,y0,x1,y1], ring [cx,cy,r], dot [cx,cy,r], path [[x,y],…].
const bez=(p0,p1,p2,p3,n=10)=>Array.from({length:n+1},(_,i)=>{const t=i/n,u=1-t;return [0,1].map(k=>u*u*u*p0[k]+3*u*u*t*p1[k]+3*u*t*t*p2[k]+t*t*t*p3[k]);});
const mirror=strokes=>strokes.map(([kind,v])=>[kind,kind==='path'?v.map(([x,y])=>[1-x,y]):kind==='seg'?[1-v[0],v[1],1-v[2],v[3]]:[1-v[0],...v.slice(1)]]);
const SINGLE={
 P:[['seg',[.24,.5,.76,.5]]],
 YO:[['ring',[.5,.5,.24]]],
 BO:[['dot',[.5,.5,.22]]],
 SL:[['path',[[.26,.2],[.5,.8],[.74,.2]]]],
 TBL:[['path',[...bez([.26,.82],[.86,.5],[.78,.16],[.5,.16]),...bez([.5,.16],[.22,.16],[.14,.5],[.74,.82]).slice(1)]]],
 K2TOG:[['seg',[.22,.8,.5,.2]],['seg',[.78,.8,.56,.38]]],
 S2KP:[['seg',[.5,.8,.5,.2]],['seg',[.22,.8,.45,.36]],['seg',[.78,.8,.55,.36]]],
 K3TOG:[['seg',[.22,.8,.5,.2]],['seg',[.5,.8,.52,.38]],['seg',[.78,.8,.58,.36]]],
 KNIT:[['seg',[.5,.22,.5,.78]]],   // a 「｜」 mark: knit, like a blank cell
 // ねじり目 as many books print it: a small loop on top, the two legs crossing below it.
 TBL2:[['ring',[.5,.33,.15]],['seg',[.42,.45,.68,.8]],['seg',[.58,.45,.32,.8]]],
};
SINGLE.SSK=mirror(SINGLE.K2TOG);SINGLE.SK2P=mirror(SINGLE.K3TOG);

function segDist(px,py,x0,y0,x1,y1){const dx=x1-x0,dy=y1-y0,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((px-x0)*dx+(py-y0)*dy)/l)):0;return Math.hypot(px-x0-t*dx,py-y0-t*dy);}
/** Ink of the strokes at a point (cell units), soft-edged. */
function inkAt(strokes,x,y,width){
 let best=0;for(const [kind,v] of strokes){let d;
  if(kind==='seg')d=segDist(x,y,...v);else if(kind==='ring')d=Math.abs(Math.hypot(x-v[0],y-v[1])-v[2]);else if(kind==='dot')d=Math.max(0,Math.hypot(x-v[0],y-v[1])-v[2]);
  else{d=Infinity;for(let i=1;i<v.length;i++)d=Math.min(d,segDist(x,y,...v[i-1],...v[i]));}
  best=Math.max(best,Math.max(0,Math.min(1,1-(d-width/2)/.04)));}
 return best;
}
/** Strokes drawn into an N x N ink map of a cell's inside, scaled about the centre. */
function rasterCell(strokes,N,scale=1,width=.09){
 const out=new Float32Array(N*N);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const u=INSET+(1-2*INSET)*(i+.5)/N,v=INSET+(1-2*INSET)*(j+.5)/N;out[j*N+i]=inkAt(strokes,.5+(u-.5)/scale,.5+(v-.5)/scale,width/scale);}
 return out;
}
const references=new Map();
/** Reference shapes for single-cell symbols: each in a few sizes and stroke weights, as print varies. */
export function singleReferences(N){
 if(references.has(N))return references.get(N);
 const list=[];for(const [name,strokes] of Object.entries(SINGLE)){const code=name==='KNIT'?null:name==='TBL2'?'TBL':name;for(const scale of [.82,1,1.15])for(const width of [.07,.12])list.push({code,shape:shapeOf(rasterCell(strokes,N,scale,width))});}
 references.set(N,list);return list;
}

/**
 * Decreases differ only in which stroke reaches the top (the stitch that lies on top): find the ink in the top band of
 * the symbol and compare its centre with the centre of the whole symbol. Negative: the left stroke reaches the top.
 */
function topLean(ink,N){
 let minY=N,maxY=-1,sx=0,s=0;for(let j=0;j<N;j++)for(let i=0;i<N;i++){const v=ink[j*N+i];if(v>.3){minY=Math.min(minY,j);maxY=Math.max(maxY,j);}s+=v;sx+=v*i;}
 if(maxY<0||!s)return 0;const band=minY+Math.max(1,Math.round((maxY-minY)*.3));let ts=0,tx=0;
 for(let j=minY;j<=band;j++)for(let i=0;i<N;i++){const v=ink[j*N+i];ts+=v;tx+=v*i;}
 return ts?(tx/ts-sx/s)/N:0;
}
/**
 * Grid lines that cross into a cell (a slanted page edge, a corner): the ink is one or two thin straight lines, each
 * close to level or upright and running across most of the cell. Such a cell is blank (knit).
 */
export function gridLinesOnly(ink,N=Math.round(Math.sqrt(ink.length))){
 let pts=[];for(let j=0;j<N;j++)for(let i=0;i<N;i++)if(ink[j*N+i]>.4)pts.push([i,j]);
 if(!pts.length)return true;
 // Take out the best straight line (within 15° of level or upright: a slanted stroke of a decrease is steeper) twice;
 // a corner is one of each.
 for(let line=0;line<2&&pts.length>2;line++){
  let best=null;
  for(let deg=-15;deg<=15;deg+=5)for(const upright of [true,false]){const a=(upright?90+deg:deg)*Math.PI/180,nx=-Math.sin(a),ny=Math.cos(a);
   const offs=pts.map(([x,y])=>x*nx+y*ny),lo=Math.floor(Math.min(...offs)),hi=Math.ceil(Math.max(...offs));
   for(let o=lo;o<=hi;o+=.5){const on=pts.filter((_,i)=>Math.abs(offs[i]-o)<=1.6);if(!best||on.length>best.on.length)best={on,a};}}
  const along=best.on.map(([x,y])=>x*Math.cos(best.a)+y*Math.sin(best.a)),span=Math.max(...along)-Math.min(...along);
  if(best.on.length<pts.length*.35||span<N*.82)return false;
  const set=new Set(best.on);pts=pts.filter(p=>!set.has(p));
 }
 return pts.length<=2;
}
const DECREASE2=new Set(['K2TOG','SSK']),DECREASE3=new Set(['K3TOG','SK2P','S2KP']);
/** The closest reference to a shape: {code, distance}. */
export function nearestReference(shape,N){let best=null;for(const ref of singleReferences(N)){const d=distance(shape,ref.shape);if(!best||d<best.distance)best={code:ref.code,distance:d};}return best;}
/** The single-cell symbol of an ink map: {code, distance}. code null is knit; 'UNK' when nothing is close enough. */
export function classifyCell(ink,{threshold=.13}={}){
 const N=Math.round(Math.sqrt(ink.length));let amount=0,peak=0;for(const v of ink){amount+=v;if(v>peak)peak=v;}amount/=ink.length;
 // Paper texture or a shaded ground: faint all over, no stroke. Grid lines crossing into the cell: not a symbol.
 if(amount<.02||peak<.55||gridLinesOnly(ink,N))return {code:null,distance:0};
 const shape=shapeOf(ink);let best=null;
 for(const ref of singleReferences(N)){const d=distance(shape,ref.shape);if(!best||d<best.distance)best={code:ref.code,distance:d};}
 if(best.distance>threshold)return {code:'UNK',distance:best.distance};
 const lean=topLean(ink,N);
 if(DECREASE2.has(best.code))best.code=lean<0?'K2TOG':'SSK';
 else if(DECREASE3.has(best.code))best.code=lean<-.04?'K3TOG':lean>.04?'SK2P':'S2KP';
 return best;
}

// ---- cables ----
const CABLES=STITCHES.filter(s=>s.width>1);
/** Ink that reaches the left or right side of a cell's inside, at mid height (a stroke crossing into the next cell). */
function sideInk(ink,N,side){let s=0;const cols=side==='left'?[0,1]:[N-2,N-1];for(let j=Math.floor(N*.15);j<Math.ceil(N*.85);j++)for(const i of cols)s+=ink[j*N+i];return s;}
/** Mean (or minimum) ink along a strand from (x0, bottom) to (x1, top) for t in [t0,t1], allowing a small sideways shift. */
function strand(sample,x0,x1,t0,t1,mode){
 const vals=[];for(let t=t0;t<=t1+1e-9;t+=.04){const y=.84-.68*t,x=x0+(x1-x0)*t;let best=null;for(const d of [-.08,-.04,0,.04,.08]){const v=sample(x+d,y);if(v!==null&&(best===null||v>best))best=v;}if(best!==null)vals.push(best);}
 if(!vals.length)return null;return mode==='min'?Math.min(...vals):vals.reduce((a,b)=>a+b,0)/vals.length;
}
/**
 * Which cable a run of w cells shows: every cable of that width is tried; the strands must carry ink (fit) and the
 * strands on top must run unbroken through the middle where the ones underneath have a gap.
 */
export function classifyCable(sample,w){
 let best=null;
 for(const c of CABLES){if(c.width!==w||c.code.endsWith('P')||c.code.startsWith('RP')||c.code.startsWith('LP'))continue;
  const g=cableStrands(c.code),all=[...g.over,...g.under];
  const fit=all.map(([a,b])=>strand(sample,a,b,.1,.9,'mean')??0).reduce((s,v)=>s+v,0)/all.length;
  const cont=list=>list.map(([a,b])=>strand(sample,a,b,.36,.64,'min')??0).reduce((s,v)=>s+v,0)/list.length;
  const score=fit+(cont(g.over)-cont(g.under));
  if(!best||score>best.score)best={code:c.code,score,fit};}
 return best&&best.fit>.25?best:{code:null,score:0,fit:best?.fit??0};
}
/**
 * 「下側が裏目」: a level purl bar where each stitch underneath starts (at the bottom of its strand). The ink of a short
 * level stretch there, less the same stretch where the strands on top start (which carry no bar). Print and focus vary
 * from cable to cable, so the caller decides per kind of cable over the whole chart.
 */
export function purlUnder(sample,code){
 const g=cableStrands(code),bar=x0=>{let best=0;for(let y=.74;y<=.93;y+=.03){let s=0,n=0;for(let x=x0-.24;x<=x0+.24;x+=.04){const v=sample(x,y);if(v!==null){s+=v;n++;}}if(n>=5)best=Math.max(best,s/n);}return best;};
 const mean=list=>list.reduce((a,b)=>a+b,0)/list.length;
 return mean(g.under.map(([x0])=>bar(x0)))-mean(g.over.map(([x0])=>bar(x0)));
}

/**
 * Symbols for a page: cell codes (null = knit, 'UNK', or a cable part CODE@i), by cell index (r*C + c).
 * Runs of 2-8 cells joined by strokes are cables, read with span(r,c0,w) → (x,y) → ink (chart-convert.mjs
 * spanReader); the rest are single cells. Cells in the same shape group then take
 * the code most of the group got, so one smudged cell does not differ from the hundred like it.
 */
export function recognize(cells,R,C,outside=new Uint8Array(R*C),{groups=null,span}={}){
 const N=Math.round(Math.sqrt(cells[0].ink.length)),codes=Array(R*C).fill(null),cable=new Uint8Array(R*C),spans=[];
 const amount=k=>cells[k].amount;
 for(let r=0;r<R;r++){
  for(let c=0;c<C;){const k=r*C+c;
   // A run: neighbours whose strokes meet across the shared side.
   let end=c;while(end+1<C){const a=r*C+end,b=a+1;if(outside[a]||outside[b]||amount(a)<.02||amount(b)<.02)break;const t=Math.max(.6,N*.08);if(sideInk(cells[a].ink,N,'right')<t||sideInk(cells[b].ink,N,'left')<t)break;end++;}
   const w=end-c+1;
   if(w>=2&&w<=8&&w!==5&&w!==7&&span){const sample=span(r,c,w),found=classifyCable(sample,w);
    if(found.code){cellCodes(found.code).forEach((part,i)=>{codes[k+i]=part;cable[k+i]=1;});spans.push({k,code:found.code,bar:PURLED[found.code]?purlUnder(sample,found.code):0});c=end+1;continue;}}
   c++;
  }
 }
 // A kind of cable whose stitches underneath carry purl bars on the whole is the 「下側が裏目」 one.
 const kinds=new Map();for(const s of spans)if(PURLED[s.code]){if(!kinds.has(s.code))kinds.set(s.code,[]);kinds.get(s.code).push(s.bar);}
 for(const [code,bars] of kinds)if(bars.reduce((a,b)=>a+b,0)/bars.length>.2)for(const s of spans)if(s.code===code)cellCodes(PURLED[code]).forEach((part,i)=>{codes[s.k+i]=part;});
 const distances=new Float32Array(R*C);
 for(let k=0;k<R*C;k++){if(outside[k]||cable[k])continue;const {code,distance:d}=classifyCell(cells[k].ink);codes[k]=code;distances[k]=d;}
 if(groups)for(const g of groups){if(g.blank)continue;const votes=new Map();for(const k of g.members){if(cable[k])continue;votes.set(codes[k],(votes.get(codes[k])||0)+1);}
  const [top,n]=[...votes].sort((a,b)=>b[1]-a[1])[0]??[];if(n===undefined)continue;
  // Follow the group only when it clearly agrees (a mixed group keeps each cell's own reading).
  if(n>=g.members.length*.6&&top!=='UNK'){for(const k of g.members)if(!cable[k])codes[k]=top;continue;}
  // Many cells of one shape that no single cell matched well (a book's own drawing of a symbol): their average shape
  // is cleaner than any one of them; compare it with the references a little more leniently.
  const own=g.members.filter(k=>!cable[k]&&codes[k]==='UNK');if(own.length<3)continue;
  const mean=new Float32Array(N*N);for(const k of own){const sh=shapeOf(cells[k].ink);for(let i=0;i<mean.length;i++)mean[i]+=sh[i]/own.length;}
  const near=nearestReference(mean,N);if(near.distance<=.17){const lean=topLean(mean,N),code=DECREASE2.has(near.code)?(lean<0?'K2TOG':'SSK'):DECREASE3.has(near.code)?(lean<-.04?'K3TOG':lean>.04?'SK2P':'S2KP'):near.code;for(const k of own)codes[k]=code;}}
 return codes;
}
