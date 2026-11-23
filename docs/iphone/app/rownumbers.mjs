// Reading the row numbers printed beside a book chart (「5」「10」「15」, or circled ①⑤⑮), to tell how many rows a chart
// leaves out where it skips the middle of a ribbing or a plain stretch. Digits are matched against drawn references
// (0-9 in several common typefaces, 12 x 16 bits each); no model, no network. Only numbers that agree with each other
// are used, so stray text (「(136目)」, arrows, captions) does not count.

// 0-9, each in seven typefaces: 12 x 16 bits, row by row, as hex.
const DIGITS={"0":["0f81fc30c30620660660660660660620630630638c1fc0f0","0f818c10430620620620620220220620620630610c1880f0","0f81dc3063066026026026026026026026023063061fc0f8","0f81d818c30430630630630630630630630630c18c0f80f0","0f819c30430620620260260260260220620630430c1f80f0","1f83dc30e60660660360360360360360660630638c1fc0f8","0f018c30c30430630630630630630630630630410c188070"],"1":["0180180380f80d8018018018018018018018018018018018","0601e01200200200200200200200200200200200200201fc","0200603e00600600600600600600600600600600603fc3fe","0100300f0030030030030030030030030030030030030030","0080380f80d8018018018018018018018018018018018018","0200603e03e00600600600600600600600600600603fc3fc","0200e00600600600600600600600600600600600600600f8"],"2":["0f81fe30630610200600600e0180300700c03803007fe7fe","0f818c30630200600400400c0300200400c01003002003fe","3f87fc40c00600600600c00c0180300600c03807007ff7ff","0f81dc18c10410400c00c0180380300600c00c01803fe3fe","1f831c20c00600600c00c0180380600c03803002003fe3fe","3f87fc40e00600600600c01c0380300e01c01807007fe7fe","0f01f821c00c00c00c00c0080180100200400801023fe7fc"],"3":["0f83fc30c20600600c07807c00e00600660630630e1fc0f0","0f818c30400600400401807000c00400600600630438c0f8","3f83fc00600600600403807800e00600600600640e7fc1f8","0f81dc18c30c00c00c01803001800c00430630418c1f80f8","1f831c00c00400400c0181e001c00400600600620c3fc1f0","3fc3fc20e00600600c07807800e00600600600660e7fc1f0","0f81b801c00c00800801003801c00e00600600400c3983e0"],"4":["00c01c03c03c06c0cc08c18c30c60c7ff7ff00c00c00c00c","0180280280280480c80881881082082087fe008008008008","00c01c03c06c0cc18c30c30c60cc0cfff00c00c00c00c00c","0180380380780780d80d80981983183183fe018018018018","00c01c01c03c06c04c0cc18c30c20c7ff7ff00c00c00c00c","01c03c03c06c0cc18c30c30cc0cc0cfff00c00c00c00c00c","0080180380380580980981182182187ff7ff018018018018"],"5":["1fe1fe1003003003f83fc30e00600600660670630e1fc0f0","1fc3003003003003703f830c20600600600600630c1880f0","3fe3fe3003003003003f83fc00600600600600660c7fc3f0","1fc1801801001001301f818c10400600630630c18c1f80f0","1fc1001001003003003f837c00c00600600600400c3f83f0","3fe3fe3003003003003f833e00e00600600600660e7fc3f0","07c07c0800801c01f003801c00c0040040040040083901e0"],"6":["0f81dc38e3062006006fc78e70670660620630638e1fc070","07c08c18030030030027828c30620620230630610408c078","07c0fc1803003002006f878e6066036036033063061fc0f8","0780cc18c18038033037838c38c30c30430c18c18c0fc070","07c0c41803003003002f82dc30630620630630630c1fc0f0","07c0fc1803007006007fc79e60760760360770738e1fc0f8","0180200c00c018038037838c30630630630630630418c070"],"7":["7ff7fe00600c0180380300700600600e00c00c00c00c0080","3fe0060040080080180100300300200600600600400400c0","7ff7ff00200600c00c0180180300300600600c00c0180180","3fc00400c00c00c018018018038030030030020060060060","7fe00600400c0080180180300200600600400c00c00c00c0","7ff7ff00300600e00c00c0180300300700600c00c0180180","3fe3fe00400400c008008018010010030020020060040040"],"8":["0f81fc30e30630630e1f81f838e30660660660630e1fc0f0","0f818c3062063063040d807009830c20220220230638c0f8","1f838e3066066063063cc1f831c6066036036027063fc0f8","0f819c18c10410410c1880f81d810c30630630618c1fc0f8","0f819c30430630430c1fc0f830c30660260230630e1fc0f8","0f83fe3063063063063cc0f831e3066036036033063fc0f8","0d810430430430418c1d00f00b811c30c3063063041840f8"],"9":["0f83fc30e20660660620630e39e1f600600630630c1f80f0","0f018830c20420620620630e18e0f600600400410c3980f0","0f83dc3066066036036033033ff0f300200600600c1f81e0","0f019838c30c30c30c30c30c19c1fc06c00c30c3981f80f0","0f818c30e30620620630630e1fe0f600600600c00c3f81e0","1f83dc7066076076036037033ff0ff00700600e01c3f83e0","0f810c30c20420620630630638e0ec00c00c018030060380"]};
const W=12,H=16;
const references=Object.entries(DIGITS).flatMap(([d,list])=>list.map(hex=>{const bits=new Uint8Array(W*H);[...hex].forEach((c,i)=>{const v=parseInt(c,16);for(let b=0;b<4;b++)bits[i*4+b]=(v>>(3-b))&1;});return {digit:Number(d),bits};}));

/** The 12 x 16 bit pattern of a dark shape (pixels as [x,y]), scaled to the height and centred across. */
function normalise(pixels,box){
 const h=box.y1-box.y0+1,w=box.x1-box.x0+1,set=new Set(pixels.map(([x,y])=>y*100000+x)),bits=new Uint8Array(W*H);
 for(let j=0;j<H;j++)for(let i=0;i<W;i++){const x=Math.round(box.x0+w/2+(i-W/2+.5)*h/H),y=Math.round(box.y0+(j+.5)*h/H);bits[j*W+i]=set.has(y*100000+x)?1:0;}
 return bits;
}
/** The digit of a shape, or null: the nearest reference by differing bits, if close enough. */
export function readDigit(pixels,box){
 const h=box.y1-box.y0+1,w=box.x1-box.x0+1;if(w>h*1.1||h<6)return null;
 const bits=normalise(pixels,box);let best=null;
 for(const ref of references){let d=0;for(let k=0;k<bits.length;k++)d+=bits[k]!==ref.bits[k];if(!best||d<best.d)best={digit:ref.digit,d};}
 return best.d<=bits.length*.3?best.digit:null;
}

/** A shape wider than a digit, cut where its columns are thinnest (into two). */
function splitTouching(s){
 const h=s.box.y1-s.box.y0+1,w=s.box.x1-s.box.x0+1;if(w<h*.95||w>h*2)return [s];
 const cols=new Array(w).fill(0);for(const [x] of s.pixels)cols[x-s.box.x0]++;
 let cut=-1,least=Infinity;for(let x=Math.round(w*.3);x<=Math.round(w*.7);x++)if(cols[x]<least){least=cols[x];cut=x;}
 if(least>h*.35)return [s];
 const a=s.pixels.filter(([x])=>x-s.box.x0<cut),b=s.pixels.filter(([x])=>x-s.box.x0>=cut),box=p=>({x0:Math.min(...p.map(q=>q[0])),x1:Math.max(...p.map(q=>q[0])),y0:Math.min(...p.map(q=>q[1])),y1:Math.max(...p.map(q=>q[1]))});
 return a.length&&b.length?[{pixels:a,box:box(a)},{pixels:b,box:box(b)}]:[s];
}

/** Dark shapes in a grey image region: pixels clearly darker than their surroundings, joined 8-ways. */
function shapes(gray,width,height,x0,x1,y0,y1,radius){
 x0=Math.max(0,Math.floor(x0));x1=Math.min(width,Math.ceil(x1));y0=Math.max(0,Math.floor(y0));y1=Math.min(height,Math.ceil(y1));
 const w=x1-x0,h=y1-y0;if(w<4||h<4)return [];
 const sum=new Float64Array((w+1)*(h+1));for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=gray[(y+y0)*width+x+x0];sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;}}
 const dark=new Uint8Array(w*h),r=Math.max(3,Math.round(radius));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=Math.max(0,x-r),b=Math.max(0,y-r),c=Math.min(w,x+r+1),d=Math.min(h,y+r+1),mean=(sum[d*(w+1)+c]-sum[b*(w+1)+c]-sum[d*(w+1)+a]+sum[b*(w+1)+a])/((c-a)*(d-b)),v=gray[(y+y0)*width+x+x0];if(v<mean-22&&v<190)dark[y*w+x]=1;}
 const seen=new Uint8Array(w*h),out=[];
 for(let s=0;s<dark.length;s++){if(!dark[s]||seen[s])continue;const pixels=[],stack=[s];seen[s]=1;let bx0=1e9,bx1=-1,by0=1e9,by1=-1;
  while(stack.length){const i=stack.pop(),x=i%w,y=(i-x)/w;pixels.push([x+x0,y+y0]);bx0=Math.min(bx0,x);bx1=Math.max(bx1,x);by0=Math.min(by0,y);by1=Math.max(by1,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const j=ny*w+nx;if(dark[j]&&!seen[j]){seen[j]=1;stack.push(j);}}}
  out.push({pixels,box:{x0:bx0+x0,x1:bx1+x0,y0:by0+y0,y1:by1+y0}});}
 return out;
}

/**
 * Numbers printed in the side margins of a flattened page: [{value, y}] (y: centre, image pixels). `pitch` is the row
 * height in pixels; digits are about that tall. A ring around digits (a circled number) is looked inside.
 */
/** A region of a grey image enlarged k times (bilinear), so small print keeps its strokes joined. */
function enlarged(gray,width,height,x0,x1,y0,y1,k){
 x0=Math.max(0,Math.floor(x0));x1=Math.min(width,Math.ceil(x1));y0=Math.max(0,Math.floor(y0));y1=Math.min(height,Math.ceil(y1));
 const w=Math.max(1,(x1-x0)*k),h=Math.max(1,(y1-y0)*k),out=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const fx=Math.min(x1-x0-1.001,Math.max(0,(x+.5)/k-.5)),fy=Math.min(y1-y0-1.001,Math.max(0,(y+.5)/k-.5)),ix=Math.floor(fx),iy=Math.floor(fy),ax=fx-ix,ay=fy-iy,at=(xx,yy)=>gray[(y0+yy)*width+x0+xx];
  out[y*w+x]=(at(ix,iy)*(1-ax)+at(Math.min(ix+1,x1-x0-1),iy)*ax)*(1-ay)+(at(ix,Math.min(iy+1,y1-y0-1))*(1-ax)+at(Math.min(ix+1,x1-x0-1),Math.min(iy+1,y1-y0-1))*ax)*ay;}
 return {gray:out,width:w,height:h,x0,y0};
}

/**
 * Numbers printed in the side margins: [{value, y}] (y: centre, in the flattened page's pixels). `pitch` is the row
 * height there. region(x0,x1,y0,y1) gives that part of the page as {gray,width,height,k} (k pixels per page pixel):
 * from the photo itself in the app (flatRegion), or the flattened image enlarged (pageRegion).
 */
export function readRowNumbers(region,width,height,grid,pitch){
 const left=grid.left*width,right=grid.right*width,top=Math.max(0,grid.top*height-pitch),bottom=Math.min(height,grid.bottom*height+pitch);
 return [[0,left-pitch*.2],[right+pitch*.2,width]].flatMap(([x0,x1])=>readMargin(region,{x0,x1,y0:top,y1:bottom},pitch));
}
/** Stitch numbers printed under (or over) the chart: [{value, x}] (x: centre, in the flattened page's pixels). */
export function readStitchNumbers(region,width,height,grid,pitch){
 const left=Math.max(0,grid.left*width-pitch),right=Math.min(width,grid.right*width+pitch),top=grid.top*height,bottom=grid.bottom*height;
 return [[0,top-pitch*.15],[bottom+pitch*.15,height]].flatMap(([y0,y1])=>readMargin(region,{x0:left,x1:right,y0,y1},pitch));
}
/** The numbers in one rectangle of the page: digits read and joined side by side. [{value, x, y}] in page pixels. */
function readMargin(region,{x0,x1,y0,y1},pitch){
 if(x1-x0<pitch*.5||y1-y0<pitch*.5)return [];
 let part=region(x0,x1,y0,y1);
 // Digits are read about 34 px tall or more: still smaller print is enlarged.
 const more=Math.max(1,Math.min(4,Math.ceil(34/(pitch*part.k))));
 if(more>1){const e=enlarged(part.gray,part.width,part.height,0,part.width,0,part.height,more);part={gray:e.gray,width:e.width,height:e.height,k:part.k*more};}
 const k=part.k,size=pitch*k,raw=shapes(part.gray,part.width,part.height,0,part.width,0,part.height,size*1.2);
 // Two digits printed touching («20») come as one shape: cut it at its thinnest column.
 const all=raw.flatMap(s=>splitTouching(s));
 // Circled numbers: a ring about a row tall with other shapes inside it; read those instead of the ring.
 const inside=s=>all.filter(t=>t!==s&&t.box.x0>s.box.x0&&t.box.x1<s.box.x1&&t.box.y0>s.box.y0&&t.box.y1<s.box.y1);
 const digits=[];
 for(const s of all){const h=s.box.y1-s.box.y0+1,w=s.box.x1-s.box.x0+1;
  if(h>size*.6&&h<size*2.2&&w>h*.7&&w<h*1.4&&inside(s).length){continue;}
  const ring=all.find(r=>r!==s&&s.box.x0>r.box.x0&&s.box.x1<r.box.x1&&s.box.y0>r.box.y0&&s.box.y1<r.box.y1);
  const limit=ring?(ring.box.y1-ring.box.y0)*.8:size*1.6;if(h<Math.max(6,size*(ring?.25:.35))||h>limit)continue;
  if(w<h*.18)continue; // a stroke of a grid line, not a 「1」
  const d=readDigit(s.pixels,s.box);if(d!==null)digits.push({d,box:s.box,h});}
 // Digits side by side on one line make one number.
 digits.sort((a,b)=>a.box.x0-b.box.x0);const used=new Set(),found=[];
 for(const a of digits){if(used.has(a))continue;const group=[a];used.add(a);let last=a;
  for(const b of digits){if(used.has(b))continue;const cy=(last.box.y0+last.box.y1)/2,by=(b.box.y0+b.box.y1)/2;if(Math.abs(cy-by)<last.h*.35&&b.box.x0>last.box.x1-1&&b.box.x0-last.box.x1<last.h*.6&&Math.abs(b.h-last.h)<last.h*.3){group.push(b);used.add(b);last=b;}}
  if(group.length<=3)found.push({value:Number(group.map(g=>g.d).join('')),x:x0+(group[0].box.x0+group.at(-1).box.x1)/2/k,y:y0+(group[0].box.y0+group[0].box.y1)/2/k});}
 return found;
}

/**
 * How the book numbers a block's rows: each number beside it, minus the row it sits on, gives an offset (row number =
 * offset + row, 1 = the block's bottom row). Readings vote, every 5th row (which books always number) counting double;
 * the offset needs a clear lead, so a misread digit or stray text does not decide it. rowAt(y) → row or null.
 */
/** region() for readRowNumbers from a flattened grey image, enlarged so small print can be read. */
export const pageRegion=(gray,width,height)=>(x0,x1,y0,y1)=>{const k=2,e=enlarged(gray,width,height,x0,x1,y0,y1,k);return {gray:e.gray,width:e.width,height:e.height,k};};

export function rowOffset(numbers,rowAt){
 // A stroke of a grid line or an arrow reads like 「1」: a 1 counts only beside a block's first row (books number it).
 const votes=new Map();for(const {value,y} of numbers){if(value<1)continue;const r=rowAt(y);if(!r||(value===1&&r!==1))continue;const o=value-r,w=value%5===0?2:1;votes.set(o,(votes.get(o)||0)+w);}
 const ranked=[...votes].sort((a,b)=>b[1]-a[1]);if(!ranked.length)return null;
 const [offset,score]=ranked[0];return score>=3&&score-(ranked[1]?.[1]??0)>=2?offset:null;
}

/** How well printed numbers agree with a numbering: the weight of the biggest group sharing one offset (see rowOffset). */
export function agreement(numbers,indexAt,key='y'){
 const votes=new Map();for(const n of numbers){if(n.value<1)continue;const i=indexAt(n[key]);if(!i||(n.value===1&&i!==1))continue;const o=n.value-i;votes.set(o,(votes.get(o)||0)+(n.value%5===0?2:1));}
 return Math.max(0,...votes.values());
}
