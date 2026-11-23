// Training data for the knitting-symbol model: chart sheets drawn in Japanese (JIS) symbol style with wide variation,
// read cell by cell with the app's own reader (chart-convert.mjs readCells), so the model sees exactly what the app
// sees. Synthetic only: no book is used. Usage: node scripts/symbol-model/make-data.mjs <out-dir> [sheets] [seed]
import sharp from 'sharp';
import {writeFileSync,mkdirSync} from 'node:fs';
import {readCells,CELL} from '../../docs/iphone/app/chart-convert.mjs';
import {CLASSES} from '../../docs/iphone/app/symbol-model.mjs';

const [out,sheetsArg='400',seedArg='1']=process.argv.slice(2);
let seed=Number(seedArg)*7919+13;const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648,between=(a,b)=>a+(b-a)*rand(),pick=a=>a[Math.floor(rand()*a.length)];

// One symbol as SVG in a cell at (x,y) of size s, with random variation. Strokes in cell units (0-1).
function symbol(cls,x,y,s,ink){
 const w=between(.05,.12)*s,jx=between(-.06,.06),jy=between(-.06,.06),k=between(.78,1.12),rot=between(-6,6);
 const P=(u,v)=>`${(x+(.5+(u-.5)*k+jx)*s).toFixed(2)},${(y+(.5+(v-.5)*k+jy)*s).toFixed(2)}`;
 const line=(u0,v0,u1,v1)=>`<line x1="${P(u0,v0).split(',')[0]}" y1="${P(u0,v0).split(',')[1]}" x2="${P(u1,v1).split(',')[0]}" y2="${P(u1,v1).split(',')[1]}"/>`;
 const g=b=>`<g transform="rotate(${rot.toFixed(1)} ${x+s/2} ${y+s/2})" stroke="${ink}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" fill="none">${b}</g>`;
 const gap=between(.1,.22),top=between(.16,.24),bot=between(.76,.84);
 switch(cls){
  case 'KNIT':return rand()<.35?g(line(.5,between(.18,.3),.5,between(.7,.82))):'';           // blank, or a 「｜」 mark
  case 'P':{const h=between(.24,.4);return g(line(.5-h,.5,.5+h,.5));}
  case 'YO':{const r=between(.16,.27);return g(`<circle cx="${P(.5,.5).split(',')[0]}" cy="${P(.5,.5).split(',')[1]}" r="${(r*s*k).toFixed(2)}"/>`);}
  case 'BO':{const r=between(.14,.24);return `<circle cx="${x+(.5+jx)*s}" cy="${y+(.5+jy)*s}" r="${(r*s).toFixed(2)}" fill="${ink}"/>`;}
  case 'SL':{const sp=between(.2,.3);return g(line(.5-sp,top,.5,bot)+line(.5,bot,.5+sp,top));}
  case 'TBL':{// loop on top with crossing legs, or a script 「ℓ」
   if(rand()<.5){const r=between(.12,.18),cy=between(.28,.38);return g(`<circle cx="${P(.5,cy).split(',')[0]}" cy="${P(.5,cy).split(',')[1]}" r="${(r*s*k).toFixed(2)}"/>`+line(.5-r*.7,cy+r*.7,.5+between(.15,.25),bot)+line(.5+r*.7,cy+r*.7,.5-between(.15,.25),bot));}
   if(rand()<.3)return g(`<path d="M ${P(.3,bot)} C ${P(.85,.55)} ${P(.78,top)} ${P(.5,top)} C ${P(.22,top)} ${P(.15,.55)} ${P(.72,bot)}"/>`);
   // As many books print it small: a tall narrow arch whose left leg curls right at the foot.
   if(rand()<.6){const half=between(.13,.2),t=between(.1,.2),b=between(.74,.86);return g(`<path d="M ${P(.5+half,b-.12)} L ${P(.5+half,t+.12)} Q ${P(.5+half,t)} ${P(.5,t)} Q ${P(.5-half,t)} ${P(.5-half,t+.12)} L ${P(.5-half,b-.15)} Q ${P(.5-half,b)} ${P(.5,b)} L ${P(.5+half+between(0,.1),b)}"/>`);}
   // A script 「ℓ」: up from the lower left, a narrow loop at the top, down across itself, a small curl to the right.
   const lx=between(.3,.4),top2=between(.14,.24),wide=between(.1,.18);
   return g(`<path d="M ${P(lx,bot)} Q ${P(.5+wide,.55)} ${P(.5+wide*.6,top2+.12)} Q ${P(.5,top2-.04)} ${P(.5-wide*.6,top2+.12)} Q ${P(.45,.55)} ${P(.52,bot-.04)} Q ${P(.6,bot+.03)} ${P(.7,bot-.04)}"/>`);}
  case 'K2TOG':{const sp=between(.22,.3);return g(line(.5-sp,bot,.5,top)+line(.5+sp,bot,.5+gap*.4,top+gap));}
  case 'SSK':{const sp=between(.22,.3);return g(line(.5+sp,bot,.5,top)+line(.5-sp,bot,.5-gap*.4,top+gap));}
  case 'S2KP':{const sp=between(.22,.3);return g(line(.5,bot,.5,top)+line(.5-sp,bot,.5-gap*.3,top+gap)+line(.5+sp,bot,.5+gap*.3,top+gap));}
  case 'K3TOG':{const sp=between(.22,.3);return g(line(.5-sp,bot,.5,top)+line(.5,bot,.5+gap*.15,top+gap*1.1)+line(.5+sp,bot,.5+gap*.4,top+gap));}
  case 'SK2P':{const sp=between(.22,.3);return g(line(.5+sp,bot,.5,top)+line(.5,bot,.5-gap*.15,top+gap*1.1)+line(.5-sp,bot,.5-gap*.4,top+gap));}
  case 'OTHER':{const kind=rand();
   if(kind<.08){// a 「×」 or 「+」 (crochet marks, not knitting symbols), drawn as strokes
    const r=between(.22,.36),q=between(-.04,.04);return rand()<.7?g(line(.5-r,.5-r+q,.5+r,.5+r-q)+line(.5+r,.5-r-q,.5-r,.5+r+q)):g(line(.5,.5-r,.5,.5+r)+line(.5-r,.5,.5+r,.5));}
   if(kind<.2){// hatching or a dot pattern over the whole cell (a shading style, not a symbol)
    const n=Math.floor(between(3,7)),ang=between(0,180),sw=between(.04,.1)*s,dots=rand()<.3;let b='';
    for(let i=0;i<n;i++)for(let j=0;j<(dots?n:1);j++){const t=(i+.5)/n;
     if(dots)b+=`<circle cx="${(x+t*s).toFixed(2)}" cy="${(y+(j+.5)/n*s).toFixed(2)}" r="${(sw*.7).toFixed(2)}" fill="${ink}"/>`;
     else{const c=Math.cos(ang*Math.PI/180),d=Math.sin(ang*Math.PI/180),o=(t-.5)*1.4*s,cx=x+s/2-d*o,cy=y+s/2+c*o;b+=`<line x1="${(cx-c*s).toFixed(2)}" y1="${(cy-d*s).toFixed(2)}" x2="${(cx+c*s).toFixed(2)}" y2="${(cy+d*s).toFixed(2)}" stroke="${ink}" stroke-width="${sw.toFixed(2)}"/>`;}}
    return `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="${x} ${y} ${s} ${s}" overflow="hidden">${b}</svg>`;}
   if(kind<.45){const ch=pick([...'目段糸をつける模様編みゴム右左上下中心表裏作伏止めABCDE0123456789（）→←↑','①','⑤','⑩','⑮','⑳']);
    return `<text x="${x+s*(.5+jx)}" y="${y+s*(.78+jy)}" font-family="${pick(['Yu Gothic','Meiryo','MS Gothic','Arial'])}" font-size="${(s*between(.55,.85)).toFixed(1)}" text-anchor="middle" fill="${ink}">${ch}</text>`;}
   if(kind<.8){// a strand of a cable passing through: a diagonal from one side to the other, sometimes broken
    const a=between(-.2,.4),b=between(.6,1.2),up=rand()<.5;return g(up?line(a,1.05,b,-.05):line(a,-.05,b,1.05));}
   return g(`<path d="M ${P(between(.2,.4),between(.2,.8))} Q ${P(between(.3,.7),between(.1,.9))} ${P(between(.6,.8),between(.2,.8))}"/>`);}
 }
 return '';
}

const WEIGHTS={KNIT:6,P:5,YO:1.2,TBL:1.5,SL:1,K2TOG:1.3,SSK:1.3,S2KP:.9,K3TOG:.8,SK2P:.8,BO:.8,OTHER:2.6};
const bag=CLASSES.flatMap(c=>Array(Math.round(WEIGHTS[c]*10)).fill(c));
const sheets=Number(sheetsArg),X=[],Y=[];
mkdirSync(out,{recursive:true});
for(let n=0;n<sheets;n++){
 const s=Math.round(between(18,36)),C=Math.round(between(14,24)),R=Math.round(between(10,18)),left=Math.round(s*between(1,2)),top=Math.round(s*between(1,2)),W=left*2+C*s,H=top*2+R*s;
 const paper=Math.round(between(200,250)),ink=`rgb(${[0,0,0].map(()=>Math.round(between(25,90))).join(',')})`,gridInk=Math.round(between(70,140)),gridW=between(.6,1.6);
 const labels=[];let body='';
 // Shaded cells (a colour chart) on some sheets.
 if(rand()<.3){const g=Math.round(paper*between(.65,.85));for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(rand()<.35)body+=`<rect x="${left+c*s}" y="${top+r*s}" width="${s}" height="${s}" fill="rgb(${g},${g},${g})"/>`;}
 for(let r=0;r<R;r++)for(let c=0;c<C;c++){const cls=pick(bag);labels.push(cls);body+=symbol(cls,left+c*s,top+r*s,s,ink);
  // Block borders and grid lines the fit misses run through some cells, thick or doubled: they are not symbols.
  if(rand()<.14){const along=rand()<.6,at=pick([between(.04,.3),between(.7,.96)]),wd=between(1,3.2),col=Math.round(between(40,120)),x0=left+c*s,y0=top+r*s;
   const ln=t=>along?`<line x1="${x0+t*s}" y1="${y0-1}" x2="${x0+t*s}" y2="${y0+s+1}" stroke="rgb(${col},${col},${col})" stroke-width="${wd.toFixed(2)}"/>`:`<line x1="${x0-1}" y1="${y0+t*s}" x2="${x0+s+1}" y2="${y0+t*s}" stroke="rgb(${col},${col},${col})" stroke-width="${wd.toFixed(2)}"/>`;
   body+=ln(at)+(rand()<.3?ln(Math.min(.97,at+between(.08,.16))):'');}}
 let grid='';for(let i=0;i<=R;i++)grid+=`<line x1="${left}" y1="${top+i*s}" x2="${left+C*s}" y2="${top+i*s}" stroke="rgb(${gridInk},${gridInk},${gridInk})" stroke-width="${((R-i)%5===0&&rand()<.5?gridW*1.8:gridW).toFixed(2)}"/>`;
 for(let j=0;j<=C;j++)grid+=`<line x1="${left+j*s}" y1="${top}" x2="${left+j*s}" y2="${top+R*s}" stroke="rgb(${gridInk},${gridInk},${gridInk})" stroke-width="${(j%10===0&&rand()<.5?gridW*1.8:gridW).toFixed(2)}"/>`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="rgb(${paper},${paper},${Math.round(paper*.96)})"/>${body}${grid}</svg>`;
 const {data}=await sharp(Buffer.from(svg)).blur(between(.3,1.2)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgba=new Uint8ClampedArray(data.buffer,data.byteOffset,data.length);
 // Uneven light and sensor noise.
 const gx=between(-30,10),gy=between(-20,10);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,d=gx*x/W+gy*y/H+(rand()-.5)*between(4,16);for(let ch=0;ch<3;ch++)rgba[i+ch]=Math.max(0,Math.min(255,rgba[i+ch]+d));}
 // The mesh as the app would fit it: exact, then nudged a little (the fit is never perfect on a real page).
 const mesh=new Float64Array((R+1)*(C+1)*2),shiftX=between(-.14,.14)*s,shiftY=between(-.14,.14)*s;
 for(let i=0;i<=R;i++)for(let j=0;j<=C;j++){const k=(i*(C+1)+j)*2;mesh[k]=(left+j*s+shiftX+between(-.1,.1)*s)/W;mesh[k+1]=(top+(R-i)*s+shiftY+between(-.1,.1)*s)/H;}
 if(process.env.SHEET&&n<3)await sharp(Buffer.from(rgba.buffer),{raw:{width:W,height:H,channels:4}}).png().toFile(`${process.env.SHEET}-${n}.png`);
 const cells=readCells(rgba,W,H,mesh,R,C);
 for(const cell of cells){const label=labels[(R-1-cell.r)*C+cell.c];X.push(cell.ink);Y.push(CLASSES.indexOf(label));}
 if(n%50===0)console.log('sheet',n,'cells',X.length);
}
const flat=new Float32Array(X.length*CELL*CELL);X.forEach((ink,i)=>flat.set(ink,i*CELL*CELL));
writeFileSync(`${out}/x.bin`,Buffer.from(flat.buffer));writeFileSync(`${out}/y.bin`,Buffer.from(Uint8Array.from(Y).buffer));
writeFileSync(`${out}/meta.json`,JSON.stringify({count:Y.length,size:CELL,classes:CLASSES}));
console.log('done',Y.length,'cells');
