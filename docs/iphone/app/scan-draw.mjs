import {sizeCanvas} from './draw.mjs';
import {rowNumber,knittingSide} from './model.mjs';
import {scanLayout,rowBands,rowAtPoint,linesAt} from './scan-model.mjs';

// Drawing the photographed chart for row counting. The photo is shown as taken (flattened only); the current row is
// a translucent band with a frame in the row colour, completed rows get a light green wash, and the gutter carries the
// app's row numbers so they can be checked against the book's own.
export const SCAN_GUTTER=52;
const images=new Map();
/** Decoded page image for a data URL; repaints once it is ready. Old images are dropped. */
export function pageImage(src,onReady){
 let img=images.get(src);
 if(!img){img=new Image();img.onload=()=>onReady?.();img.src=src;images.set(src,img);while(images.size>6)images.delete(images.keys().next().value);}
 return img.complete&&img.naturalWidth?img:null;
}
const contrast=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#000000':'#ffffff';};
const alpha=(hex,a)=>hex+Math.round(a*255).toString(16).padStart(2,'0');

/** view: {scale,x,y} (screen = layout*scale + offset; x includes the gutter). Clamped so the chart stays reachable. */
export function clampView(view,layout,width,height){
 const w=layout.width*view.scale,h=layout.height*view.scale,room=width-SCAN_GUTTER;
 view.x=w<=room?SCAN_GUTTER+(room-w)/2:Math.min(SCAN_GUTTER,Math.max(width-w,view.x));
 view.y=h<=height?(height-h)/2:Math.min(0,Math.max(height-h,view.y));
}
export function fitView(view,layout,width,height){view.scale=Math.max(.02,(width-SCAN_GUTTER-8)/layout.width);clampView(view,layout,width,height);}
/** Counting view: at least the whole width, and large enough that a row is easy to read and tap (about 20 px). */
export function readableView(view,p,width,height){
 const layout=scanLayout(p.scan),pg=p.scan.pages[0],o=layout.pages[0],ys=linesAt(pg,(pg.grid.left+pg.grid.right)/2),row=(ys[0]-ys[pg.rows])*o.h/pg.rows;
 view.scale=Math.max(.02,(width-SCAN_GUTTER-8)/layout.width,Math.min(20/row,8*(width-SCAN_GUTTER-8)/layout.width));clampView(view,layout,width,height);
}
/** Centre the current row vertically (and its page horizontally when zoomed in). */
export function focusRow(view,p,width,height){
 const layout=scanLayout(p.scan),band=rowBands(p.scan,p.currentRow)[0];if(!band)return;
 const o=layout.pages[band.page],mid=o.y+(band.top+band.bottom)/2*o.h;view.y=height/2-mid*view.scale;
 if(layout.width*view.scale>width-SCAN_GUTTER)view.x=SCAN_GUTTER+(width-SCAN_GUTTER)/2-(o.x+o.w/2)*view.scale;
 clampView(view,layout,width,height);
}

export function drawScan(canvas,p,view,readability,onImage){
 const s=sizeCanvas(canvas);if(!s)return;const {ctx:c,width,height}=s,scan=p.scan,layout=scanLayout(scan);
 if(!view.scale){readableView(view,p,width,height);focusRow(view,p,width,height);}clampView(view,layout,width,height);
 const X=x=>view.x+x*view.scale,Y=y=>view.y+y*view.scale;
 c.fillStyle='#e9ebe3';c.fillRect(0,0,width,height);
 c.save();c.beginPath();c.rect(SCAN_GUTTER,0,width-SCAN_GUTTER,height);c.clip();
 scan.pages.forEach((pg,i)=>{const o=layout.pages[i],img=pageImage(pg.image,onImage);
  if(img){c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(img,X(o.x),Y(o.y),o.w*view.scale,o.h*view.scale);}
  else{c.fillStyle='#fffefa';c.fillRect(X(o.x),Y(o.y),o.w*view.scale,o.h*view.scale);}});
 // Completed rows: a light wash that leaves the printed symbols readable.
 const total=p.rows;
 // A band follows the row through the strips (a bent page bends the row); screen points along its top and bottom.
 const edge=(b,ys,shift=0)=>b.xs.map((x,i)=>{const o=layout.pages[b.page];return [X(o.x+x*o.w),Y(o.y+ys[i]*o.h)+shift];});
 const area=b=>{const top=edge(b,b.tops),bottom=edge(b,b.bottoms).reverse();c.beginPath();[...top,...bottom].forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();};
 c.fillStyle='#14653422';
 for(const row of p.completedRows)if(row!==p.currentRow)for(const b of rowBands(scan,row)){area(b);c.fill();}
 // Current row: the whole page width, so the book's own row number is inside the band too.
 for(const b of rowBands(scan,p.currentRow)){const o=layout.pages[b.page],h=Math.max(2,(b.bottom-b.top)*o.h*view.scale),t=Math.max(1.5,Math.min(readability.width,h/3));
  c.fillStyle=alpha(readability.color,.16);area(b);c.fill();
  for(const [style,line] of [[contrast(readability.color),t+2],[readability.color,t]]){c.strokeStyle=style;c.lineWidth=line;c.lineJoin='round';c.beginPath();
   for(const pts of [edge(b,b.tops,-t/2),edge(b,b.bottoms,t/2)])pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}}
 c.restore();
 // Gutter: the app's row numbers at the rows of the first page (side by side) or of each page (stacked).
 c.fillStyle='#f5f7f2';c.fillRect(0,0,SCAN_GUTTER,height);c.strokeStyle='#dbe3d9';c.beginPath();c.moveTo(SCAN_GUTTER-.5,0);c.lineTo(SCAN_GUTTER-.5,height);c.stroke();
 c.textBaseline='middle';c.textAlign='right';
 let lastY=Infinity;
 for(let row=1;row<=total;row++){const b=rowBands(scan,row)[0];if(!b)continue;const o=layout.pages[b.page],top=Y(o.y+b.tops[1]*o.h),bottom=Y(o.y+b.bottoms[1]*o.h),h=bottom-top,mid=(top+bottom)/2;
  if(bottom<0||top>height)continue;
  const current=row===p.currentRow,done=p.completedRows.includes(row),number=rowNumber(p,row);
  if(current||done){c.fillStyle=current?readability.color:'#146534';c.fillRect(0,top,SCAN_GUTTER-1,Math.max(1,h));}
  const font=Math.max(9,Math.min(16,h*.7)),room=Math.abs(lastY-mid)>=font+2;
  if(current||room&&(h>=font||number%5===0||number===1)){c.font=`${current?'bold ':''}${current?Math.max(12,font):font}px -apple-system, sans-serif`;c.fillStyle=current?contrast(readability.color):done?'white':'#52665a';c.fillText(String(number),SCAN_GUTTER-6,mid);lastY=mid;
   if(p.flatKnitting&&h>=12){c.save();c.font='10px -apple-system, sans-serif';c.textAlign='center';c.fillText(knittingSide(p,row).wrongSide?'→':'←',12,mid);c.restore();}}}
}

/** Physical row under a screen point, or null. */
export function rowAtScreen(p,view,x,y){const layout=scanLayout(p.scan),first=p.scan.pages[0],lx=x<SCAN_GUTTER?layout.pages[0].x+first.strips[0]*layout.pages[0].w:(x-view.x)/view.scale;return rowAtPoint(p.scan,layout,lx,(y-view.y)/view.scale);}

/**
 * One finger pans, two fingers pinch-zoom (or the wheel), a tap reports its point. `onChange` repaints.
 * The same gestures serve the counter view and the row check in the import dialog.
 */
export function zoomGestures(canvas,view,{onChange,onTap,minScale=()=>.02,maxScale=()=>8}){
 const pointers=new Map();let start=null,moved=false,multi=false;
 const point=e=>{const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};};
 const zoomAt=(f,mid)=>{const old=view.scale;view.scale=Math.max(minScale(),Math.min(maxScale(),old*f));const k=view.scale/old;view.x=mid.x-(mid.x-view.x)*k;view.y=mid.y-(mid.y-view.y)*k;};
 canvas.addEventListener('pointerdown',e=>{e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch{}const pos=point(e);pointers.set(e.pointerId,pos);if(pointers.size===1){start=pos;moved=false;multi=false;}else multi=true;});
 canvas.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;e.preventDefault();const pos=point(e);
  if(Math.hypot(pos.x-start.x,pos.y-start.y)>6)moved=true;
  if(pointers.size>=2){const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1],d0=Math.hypot(old.x-other.x,old.y-other.y),d1=Math.hypot(pos.x-other.x,pos.y-other.y);if(d0>2)zoomAt(d1/d0,{x:(old.x+other.x)/2,y:(old.y+other.y)/2});view.x+=(pos.x-old.x)/2;view.y+=(pos.y-old.y)/2;}
  else{view.x+=pos.x-old.x;view.y+=pos.y-old.y;}
  pointers.set(e.pointerId,pos);onChange();});
 const end=(e,cancel)=>{const pos=pointers.get(e.pointerId);if(!pos)return;pointers.delete(e.pointerId);if(!pointers.size&&!cancel&&!moved&&!multi)onTap?.(pos);};
 canvas.addEventListener('pointerup',e=>end(e,false));canvas.addEventListener('pointercancel',e=>end(e,true));
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.deltaY<0?1.15:1/1.15,point(e));onChange();},{passive:false});
 return {zoomBy:f=>{const b=canvas.getBoundingClientRect();zoomAt(f,{x:b.width/2,y:b.height/2});onChange();}};
}
