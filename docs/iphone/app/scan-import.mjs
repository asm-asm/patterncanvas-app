import {rectify,grayscale,detectGrid,insetQuad,checkQuad,SCAN_MAX_ROWS} from './scan-model.mjs';
import {analyzeGrid,fitGrid,buildMesh,unwarp,readCells,outsideCells,groupShapes,groupColours,mergeColours,buildChart,spanReader,hex} from './chart-convert.mjs';
import {STITCHES,stitchPart,stitchDef} from './stitches.mjs';
import {recognize} from './recognize.mjs';
import {INCREASES} from './model.mjs';
import {draw,sizeCanvas,CHART_GUTTER,CHART_HEADER,CHART_FOOTER} from './draw.mjs';

// 「本の編み図を撮って取り込む」: photograph a chart in a book (bent pages expected), fit the four corners of the grid,
// check the straightened grid and its row/stitch counts, join the pages of a spread, name each symbol shape once, and
// get an ordinary editable chart (yarn colours + knitting symbols). Everything stays on the device.
const SOURCE_LONG=3200,DETECT_LONG=640,HANDLE=36,LOUPE=112,ZOOM=3,CORNERS=['左上','右上','右下','左下'],UNWARP=16,MAX_COUNT=SCAN_MAX_ROWS;

/** One finger pans, two fingers (or the wheel) zoom. view: {scale,x,y,min,max}; screen = image*scale + offset. */
function zoomGestures(canvas,view,onChange){
 const pointers=new Map();
 const point=e=>{const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};};
 const zoomAt=(f,mid)=>{const old=view.scale;view.scale=Math.max(view.min||.05,Math.min(view.max||8,old*f));const k=view.scale/old;view.x=mid.x-(mid.x-view.x)*k;view.y=mid.y-(mid.y-view.y)*k;};
 canvas.addEventListener('pointerdown',e=>{e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch{}pointers.set(e.pointerId,point(e));});
 canvas.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;e.preventDefault();const pos=point(e);
  if(pointers.size>=2){const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1],d0=Math.hypot(old.x-other.x,old.y-other.y),d1=Math.hypot(pos.x-other.x,pos.y-other.y);if(d0>2)zoomAt(d1/d0,{x:(old.x+other.x)/2,y:(old.y+other.y)/2});view.x+=(pos.x-old.x)/2;view.y+=(pos.y-old.y)/2;}
  else{view.x+=pos.x-old.x;view.y+=pos.y-old.y;}
  pointers.set(e.pointerId,pos);onChange();});
 for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,e=>pointers.delete(e.pointerId));
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.deltaY<0?1.15:1/1.15,point(e));onChange();},{passive:false});
}

export function setupScanImport({replace,editable,message}){
 const $=id=>document.getElementById(id),dialog=$('scan-dialog');
 let pages=[],join='single',addAt='right',source=null,quad=null,current=null,drag=null,fit=null,last=null,reading=null,chart=null,timer=0;
 const gridView={scale:0,x:0,y:0};
 const step=name=>{for(const s of ['start','corners','grid','pages','symbols'])$(`scan-step-${s}`).hidden=s!==name;dialog.querySelector('.dialog-body').scrollTop=0;};
 const pageLabel=()=>pages.length===0?'1ページ目':join==='side'?`2ページ目（${addAt==='left'?'左':'右'}のページ）`:'2ページ目（段の続き）';

 function open(){if(!editable())return;pages=[];join='single';addAt='right';last=null;source=null;current=null;reading=null;$('scan-name').value='本の編み図';$('scan-page-label').textContent=pageLabel();$('scan-start-error').textContent='';step('start');dialog.showModal();}
 $('scan-open').onclick=open;
 $('scan-cancel').onclick=()=>dialog.close();

 // ---- 1. photo ----
 async function load(file){
  if(!file)return;if(file.size>40000000)throw Error('写真は40MB以下にしてください');
  const url=URL.createObjectURL(file);
  try{const image=new Image();image.src=url;await image.decode();
   const k=Math.min(1,SOURCE_LONG/Math.max(image.naturalWidth,image.naturalHeight));source=document.createElement('canvas');source.width=Math.max(1,Math.round(image.naturalWidth*k));source.height=Math.max(1,Math.round(image.naturalHeight*k));
   source.getContext('2d').drawImage(image,0,0,source.width,source.height);}
  finally{URL.revokeObjectURL(url);}
  autoCorners();step('corners');requestAnimationFrame(drawCorners);
 }
 for(const id of ['scan-camera','scan-library'])$(id).onchange=async e=>{try{await load(e.target.files[0]);}catch(error){$('scan-start-error').textContent='写真を読み込めません：'+error.message;}finally{e.target.value='';}};

 // ---- 2. corners ----
 function autoCorners(){
  const k=Math.min(1,DETECT_LONG/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*k)),h=Math.max(1,Math.round(source.height*k)),c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(source,0,0,w,h);
  const found=detectGrid(grayscale(g.getImageData(0,0,w,h).data,w,h),w,h);
  quad=(found||insetQuad(w,h)).map(([x,y])=>[x/k,y/k]);
  $('scan-corners-error').textContent=found?'':'黄色い丸を、編み図のマス目の四隅に合わせてください。';
  return !!found;
 }
 $('scan-detect').onclick=()=>{if(!source)return;if(autoCorners())$('scan-corners-error').textContent='マス目の角に合わせました。ずれている角はドラッグで直してください。';drawCorners();};
 $('scan-rotate').onclick=()=>{if(!source)return;const c=document.createElement('canvas');c.width=source.height;c.height=source.width;const g=c.getContext('2d');g.translate(c.width,0);g.rotate(Math.PI/2);g.drawImage(source,0,0);source=c;autoCorners();drawCorners();};
 $('scan-retake').onclick=()=>{source=null;step('start');};
 function drawCorners(){
  const canvas=$('scan-corners'),s=sizeCanvas(canvas);if(!s||!source)return;const {ctx:c,width,height}=s;
  const k=Math.min(width/source.width,height/source.height),ox=(width-source.width*k)/2,oy=(height-source.height*k)/2;fit={k,ox,oy};
  const S=([x,y])=>[ox+x*k,oy+y*k];
  c.fillStyle='#30483e';c.fillRect(0,0,width,height);c.drawImage(source,ox,oy,source.width*k,source.height*k);
  c.fillStyle='rgba(27,52,43,.45)';c.beginPath();c.rect(0,0,width,height);quad.forEach((q,i)=>{const [x,y]=S(q);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fill('evenodd');
  c.lineWidth=2;c.strokeStyle='#ffe600';c.beginPath();quad.forEach((q,i)=>{const [x,y]=S(q);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.stroke();
  quad.forEach((q,i)=>{const [x,y]=S(q);c.beginPath();c.arc(x,y,drag?.i===i?16:12,0,Math.PI*2);c.fillStyle='rgba(255,230,0,.35)';c.fill();c.lineWidth=3;c.strokeStyle='#ffe600';c.stroke();
   c.font='bold 11px -apple-system, sans-serif';c.textAlign='center';c.textBaseline='middle';const lx=x+(i===1||i===2?-26:26),ly=y+(i>=2?-20:20);c.lineWidth=3;c.strokeStyle='#1b342b';c.strokeText(CORNERS[i],lx,ly);c.fillStyle='white';c.fillText(CORNERS[i],lx,ly);});
  if(drag){// Loupe away from the finger: the corner it marks is under the cross.
   const [hx,hy]=quad[drag.i],lx=S(quad[drag.i])[0]>width/2?12:width-LOUPE-12,ly=12,r=LOUPE/2,half=LOUPE/2/(ZOOM*k);
   c.save();c.beginPath();c.arc(lx+r,ly+r,r,0,Math.PI*2);c.clip();c.fillStyle='white';c.fillRect(lx,ly,LOUPE,LOUPE);
   c.drawImage(source,hx-half,hy-half,half*2,half*2,lx,ly,LOUPE,LOUPE);
   c.strokeStyle='#d0021b';c.lineWidth=1.5;c.beginPath();c.moveTo(lx+r,ly+r-14);c.lineTo(lx+r,ly+r+14);c.moveTo(lx+r-14,ly+r);c.lineTo(lx+r+14,ly+r);c.stroke();c.restore();
   c.lineWidth=3;c.strokeStyle='white';c.beginPath();c.arc(lx+r,ly+r,r,0,Math.PI*2);c.stroke();}
 }
 const cornerCanvas=$('scan-corners');
 const local=e=>{const b=cornerCanvas.getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top];};
 cornerCanvas.addEventListener('pointerdown',e=>{if(!fit||!quad)return;e.preventDefault();const [x,y]=local(e);let best=-1,dist=HANDLE;
  quad.forEach(([qx,qy],i)=>{const d=Math.hypot(fit.ox+qx*fit.k-x,fit.oy+qy*fit.k-y);if(d<dist){dist=d;best=i;}});
  if(best<0)return;try{cornerCanvas.setPointerCapture(e.pointerId);}catch{}drag={i:best,id:e.pointerId,dx:fit.ox+quad[best][0]*fit.k-x,dy:fit.oy+quad[best][1]*fit.k-y};drawCorners();});
 cornerCanvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();const [x,y]=local(e);
  quad[drag.i]=[Math.max(0,Math.min(source.width,(x+drag.dx-fit.ox)/fit.k)),Math.max(0,Math.min(source.height,(y+drag.dy-fit.oy)/fit.k))];$('scan-corners-error').textContent='';drawCorners();});
 for(const type of ['pointerup','pointercancel'])cornerCanvas.addEventListener(type,e=>{if(drag?.id===e.pointerId){drag=null;drawCorners();}});

 // ---- 3. grid: straighten the page, check the counts ----
 $('scan-flatten').onclick=()=>{
  try{checkQuad(quad,source.width,source.height);}catch(error){$('scan-corners-error').textContent=error.message;return;}
  $('scan-flatten').disabled=true;$('scan-flatten').textContent='ゆがみを直しています…';
  setTimeout(()=>{try{
   const data=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height).data,r=rectify(data,source.width,source.height,quad);
   const analysis=analyzeGrid(grayscale(r.data,r.width,r.height),r.width,r.height,r.grid);
   current={rgba:r.data,width:r.width,height:r.height,analysis,source,quad:quad.map(q=>[...q])};
   const fixedRows=join==='side'&&pages.length===1?pages[0].R:null;
   $('scan-rows').value=fixedRows??analysis.rows.rows??'';$('scan-cols').value=analysis.cols.rows??'';
   $('scan-rows').disabled=$('scan-rows-less').disabled=$('scan-rows-more').disabled=fixedRows!==null;
   const read=[analysis.rows.rows&&`${analysis.rows.rows}段`,analysis.cols.rows&&`${analysis.cols.rows}目`].filter(Boolean).join('・');
   $('scan-detected').textContent=(fixedRows!==null?`段数はもう片方のページと同じ${fixedRows}段です。`:'')+(read?`写真のマス目から${read}と読み取りました。本の段数・目数と合っているか確かめてください。`:'')+(!analysis.rows.rows||!analysis.cols.rows?'読み取れなかった数を入力してください。':'');
   gridView.scale=0;step('grid');refit();
  }catch(error){$('scan-corners-error').textContent=error.message;}finally{$('scan-flatten').disabled=false;$('scan-flatten').textContent='次へ：マス目を確かめる';}},30);
 };
 $('scan-back-corners').onclick=()=>{source=current?.source??source;step('corners');requestAnimationFrame(drawCorners);};
 const count=id=>{const n=Number($(id).value);return Number.isInteger(n)&&n>=1&&n<=MAX_COUNT?n:null;};
 function refit(){
  clearTimeout(timer);current.fit=null;current.unwarp=null;const R=count('scan-rows'),C=count('scan-cols');
  $('scan-grid-error').textContent=R&&C?'':`段数・目数は1〜${MAX_COUNT}の整数で入力してください。`;$('scan-page-done').disabled=true;
  if(!R||!C){drawGrid();return;}
  timer=setTimeout(()=>{try{
   const f=fitGrid(current.analysis,R,C),mesh=buildMesh(f);current.fit=f;current.mesh=mesh;current.R=R;current.C=C;
   const u=unwarp(current.rgba,current.width,current.height,mesh,R,C,UNWARP),canvas=document.createElement('canvas');canvas.width=u.width;canvas.height=u.height;canvas.getContext('2d').putImageData(new ImageData(u.data,u.width,u.height),0,0);current.unwarp=canvas;
   $('scan-page-done').disabled=false;drawGrid();
  }catch(error){$('scan-grid-error').textContent=error.message;}},60);
 }
 function drawGrid(){
  const canvas=$('scan-grid'),s=sizeCanvas(canvas);if(!s)return;const {ctx:c,width,height}=s,v=gridView,gutter=30;
  c.fillStyle='#e9ebe3';c.fillRect(0,0,width,height);const img=current?.unwarp;if(!img)return;
  v.min=(width-gutter)/img.width*.5;v.max=(width-gutter)/img.width*10;if(!v.scale){v.scale=(width-gutter)/img.width;v.x=gutter;v.y=Math.min(0,height-img.height*v.scale);}
  const w=img.width*v.scale,h=img.height*v.scale;v.x=w<=width-gutter?gutter+(width-gutter-w)/2:Math.min(gutter,Math.max(width-w,v.x));v.y=h<=height?(height-h)/2:Math.min(0,Math.max(height-h,v.y));
  c.imageSmoothingQuality='high';c.drawImage(img,v.x,v.y,w,h);
  // Every 5th row and stitch in red, counted like the chart: rows from the bottom, stitches from the right.
  const R=current.R,C=current.C,cell=w/C,ch=h/R;c.strokeStyle='#d0021bcc';c.lineWidth=1.5;c.beginPath();
  for(let i=5;i<R;i+=5){const y=v.y+h-i*ch;c.moveTo(v.x,y);c.lineTo(v.x+w,y);}for(let j=5;j<C;j+=5){const x=v.x+w-j*cell;c.moveTo(x,v.y);c.lineTo(x,v.y+h);}c.stroke();
  c.fillStyle='#f5f7f2';c.fillRect(0,0,gutter,height);c.fillStyle='#52665a';c.font='10px -apple-system, sans-serif';c.textAlign='right';c.textBaseline='middle';
  const first=pages.length&&join==='stack'?pages.reduce((n,pg)=>n+pg.R,0):0;
  for(let i=1;i<=R;i++){const n=first+i;if(n!==1&&n%5)continue;const y=v.y+h-(i-.5)*ch;if(y>-10&&y<height+10)c.fillText(String(n),gutter-4,y);}
 }
 zoomGestures($('scan-grid'),gridView,drawGrid);
 for(const id of ['scan-rows','scan-cols'])$(id).oninput=refit;
 for(const [id,target,d] of [['scan-rows-less','scan-rows',-1],['scan-rows-more','scan-rows',1],['scan-cols-less','scan-cols',-1],['scan-cols-more','scan-cols',1]])
  $(id).onclick=()=>{$(target).value=Math.max(1,Math.min(MAX_COUNT,(count(target)||0)+d));refit();};
 $('scan-page-done').onclick=()=>{
  if(!current?.fit){$('scan-grid-error').textContent='マス目の計算が終わるまでお待ちください。';return;}
  const page={...current};if(pages.length===1&&join==='side'&&addAt==='left')pages.unshift(page);else pages.push(page);
  if(pages.length===1)join='single';last={source:current.source,quad:current.quad};current=null;source=null;reading=null;showPages();
 };

 // ---- 4. pages ----
 function showPages(){
  const total=join==='side'?pages[0].R:pages.reduce((n,pg)=>n+pg.R,0),cols=join==='side'?pages.reduce((n,pg)=>n+pg.C,0):Math.max(...pages.map(pg=>pg.C));
  $('scan-summary').textContent=pages.length===1?`1ページ：${cols}目 × ${total}段`:join==='side'?`左右2ページ：${cols}目 × ${total}段（同じ段が左右に続きます）`:`2ブロック：${pages[0].R}段＋${pages[1].R}段＝${total}段・${cols}目（下のブロックの上に続けます）`;
  $('scan-pages-error').textContent='';$('scan-add-page').hidden=pages.length>=2;$('scan-add-same').hidden=!last?.source||pages.length>=2;$('scan-remove-page').hidden=pages.length<2;step('pages');
 }
 const addPage=(kind,at='right')=>{join=kind;addAt=at;$('scan-page-label').textContent=pageLabel();$('scan-start-error').textContent='';step('start');};
 $('scan-add-left').onclick=()=>addPage('side','left');$('scan-add-side').onclick=()=>addPage('side','right');$('scan-add-stack').onclick=()=>addPage('stack');
 // Charts split into blocks on one page (body below, raglan above, a gap between): the next block of the same photo.
 $('scan-add-same').onclick=()=>{if(!last?.source)return;join='stack';addAt='top';source=last.source;
  const [tl,tr,br,bl]=last.quad,h=(Math.hypot(bl[0]-tl[0],bl[1]-tl[1])+Math.hypot(br[0]-tr[0],br[1]-tr[1]))/2,up=Math.min(h,tl[1],tr[1]);
  quad=up<8?last.quad.map(q=>[...q]):[[tl[0],tl[1]-up],[tr[0],tr[1]-up],[tr[0],tr[1]],[tl[0],tl[1]]];
  $('scan-page-label').textContent=pageLabel();$('scan-corners-error').textContent='下のブロックの上に枠を置きました。続きのブロックの四隅に合わせてください。';step('corners');requestAnimationFrame(drawCorners);};
 $('scan-remove-page').onclick=()=>{pages=join==='side'&&addAt==='left'?pages.slice(1):pages.slice(0,1);join='single';reading=null;showPages();};

 // ---- 5. symbols and colours ----
 // Every cell is read automatically (recognize.mjs). The results are listed by kind of symbol; changing a kind changes
 // every cell of it. Shapes that matched no symbol are listed by shape so each can be named once.
 const SINGLE_CHOICES=[['','記号なし（表目）'],['UNK','わからない（？で残す）'],...STITCHES.filter(s=>s.width===1&&s.code!=='UNK').map(s=>[s.code,s.name]),...INCREASES.map(s=>[s.code,`${s.name}（${s.code}）`])];
 const cableChoices=w=>[...STITCHES.filter(s=>s.width===w).map(s=>[s.code,s.name]),['UNK','交差ではない（？で残す）']];
 const nameOf=code=>code===null?'記号なし（表目）':code==='UNK'?'読み取れなかった形':(stitchDef(code)?.name??INCREASES.find(s=>s.code===code)?.name??code);
 $('scan-to-symbols').onclick=()=>{
  $('scan-to-symbols').disabled=true;$('scan-to-symbols').textContent='記号を読み取っています…';
  setTimeout(()=>{try{read();step('symbols');showSymbols();}catch(error){$('scan-pages-error').textContent=error.message;}finally{$('scan-to-symbols').disabled=false;$('scan-to-symbols').textContent='次へ：記号と色を確かめる';}},30);
 };
 function read(){
  if(reading)return;
  const all=[],at=[];
  pages.forEach((pg,n)=>{if(!pg.cells){pg.cells=readCells(pg.rgba,pg.width,pg.height,pg.mesh,pg.R,pg.C);pg.outside=outsideCells(pg.cells,pg.R,pg.C);
    pg.codes=recognize(pg.cells,pg.R,pg.C,pg.outside,{groups:groupShapes(pg.cells,pg.outside),span:spanReader(pg.rgba,pg.width,pg.height,pg.mesh,pg.C,pg.cells)});}
   pg.cells.forEach((c,k)=>{all.push(c);at.push([n,k]);});});
  const skip=Uint8Array.from(at,([n,k])=>pages[n].outside[k]),detected=groupColours(all,skip);
  // Unread cells, grouped by shape over all pages, so the same unknown symbol is named once.
  const unknown=all.map((c,m)=>{const [n,k]=at[m];return pages[n].codes[k]==='UNK';}),shapes=groupShapes(all,Uint8Array.from(unknown,u=>u?0:1));
  const unknownGroup=pages.map(pg=>new Int32Array(pg.cells.length).fill(-1));shapes.forEach((g,i)=>g.members.forEach(m=>{const [n,k]=at[m];unknownGroup[n][k]=i;}));
  // Kinds: knit, each symbol, each cable (counted per cable), and each unread shape.
  const kinds=new Map();
  pages.forEach((pg,n)=>pg.codes.forEach((code,k)=>{if(pg.outside[k])return;const part=stitchPart(code);if(part&&part.index>0)return;
   const key=code==='UNK'?`UNK:${unknownGroup[n][k]}`:part&&part.width>1?part.code:(code??'');
   // The example shown is the cell nearest the middle of the page (the clearest part of a photo).
   const c=pg.cells[k],off=Math.hypot(c.r/pg.R-.5,c.c/pg.C-.5);
   if(!kinds.has(key))kinds.set(key,{key,code:part&&part.width>1?part.code:code,width:part?.width??1,count:0,example:[n,k],off});
   const kind=kinds.get(key);kind.count++;if(off<kind.off){kind.off=off;kind.example=[n,k];}}));
  reading={all,at,detected,colour:pages.map(pg=>new Int32Array(pg.cells.length).fill(0)),unknownGroup,kinds:[...kinds.values()].sort((a,b)=>(a.code==='UNK')-(b.code==='UNK')||b.count-a.count),changed:new Map()};
  $('scan-colour-count').value='auto';setColours();
 }
 // The colours the user asked for: as detected, or merged down to a number (a black-and-white chart is one yarn).
 function setColours(){
  const n=$('scan-colour-count').value,colours=n==='auto'?reading.detected:mergeColours(reading.detected,Number(n));
  reading.colours=colours;reading.yarns=colours.map(c=>({color:hex(c.rgb)}));
  colours.forEach((c,i)=>c.members.forEach(m=>{const [p,k]=reading.at[m];reading.colour[p][k]=i;}));
 }
 $('scan-colour-count').onchange=()=>{if(!reading)return;setColours();showColours();update();};
 function thumb([n,k],w){// The cell (or the whole cable) and the cells beside it, from the straightened page.
  const pg=pages[n],c=pg.cells[k],from=Math.max(0,c.c-(w>1?0:1)),cols=Math.min(pg.C-from,Math.max(3,w)),scale=w>2?2:3,canvas=document.createElement('canvas');canvas.width=UNWARP*scale*Math.max(3,w);canvas.height=UNWARP*scale;
  const g=canvas.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle='#ffffff';g.fillRect(0,0,canvas.width,canvas.height);
  g.drawImage(pg.unwarp,from*UNWARP,(pg.R-1-c.r)*UNWARP,cols*UNWARP,UNWARP,0,0,cols*UNWARP*scale,UNWARP*scale);g.strokeStyle='#d0021b';g.lineWidth=3;g.strokeRect((c.c-from)*UNWARP*scale+1.5,1.5,UNWARP*scale*w-3,UNWARP*scale-3);return canvas;
 }
 function select(choices,value,onchange){const s=document.createElement('select');for(const [v,label] of choices){const o=document.createElement('option');o.value=v;o.textContent=label;s.append(o);}s.value=value;s.onchange=()=>onchange(s.value);return s;}
 function showSymbols(){
  const list=$('scan-groups');list.replaceChildren();
  for(const kind of reading.kinds){const item=document.createElement('div');item.className='scan-group'+(kind.code==='UNK'?' scan-unknown':'');const pics=document.createElement('div');pics.className='scan-group-pics';pics.append(thumb(kind.example,kind.width));
   const text=document.createElement('div'),p=document.createElement('p');p.textContent=kind.code==='UNK'?`読み取れなかった形（${kind.count}マス）`:`${nameOf(kind.code)}（${kind.count}${kind.width>1?'か所':'マス'}）`;
   const value=reading.changed.get(kind.key)??(kind.code??'');
   text.append(p,select(kind.width>1?cableChoices(kind.width):SINGLE_CHOICES,value,v=>{reading.changed.set(kind.key,v);update();}));item.append(pics,text);list.append(item);}
  const unknown=reading.kinds.filter(k=>k.code==='UNK').reduce((n,k)=>n+k.count,0);
  $('scan-symbols-summary').textContent=unknown?`記号を自動で読み取りました。違うものだけ選び直してください。読み取れなかった形が${unknown}マスあります。`:'記号を自動で読み取りました。違うものだけ選び直してください。';
  showColours();update();
 }
 function showColours(){
  const box=$('scan-colours');box.replaceChildren();
  reading.colours.forEach((c,i)=>{const label=document.createElement('label');label.className='scan-colour';const input=document.createElement('input');input.type='color';input.value=reading.yarns[i].color;input.oninput=()=>{reading.yarns[i].color=input.value;update();};
   label.append(input,document.createTextNode(`色${i+1}（${c.members.length}マス）`));box.append(label);});
 }
 /** The code of a page cell after the user's changes: a changed kind applies to all its cells (a cable keeps its parts). */
 function codeOf(n,k){
  const pg=pages[n],code=pg.codes[k],part=stitchPart(code);
  const key=code==='UNK'?`UNK:${reading.unknownGroup[n][k]}`:part&&part.width>1?part.code:(code??'');
  if(!reading.changed.has(key))return code;const next=reading.changed.get(key)||null;
  if(part&&part.width>1)return next&&stitchDef(next)?.width===part.width?`${next}@${part.index}`:next==='UNK'?'UNK':null;
  return next;
 }
 const build=()=>buildChart({pages,join,codeOf,colourOf:(n,k)=>reading.colour[n][k],colours:reading.yarns.map((y,i)=>({color:y.color,name:`色${i+1}`})),name:$('scan-name').value});
 function update(){
  try{
   chart=build();
   const unknown=chart.symbols.flat().filter(c=>c==='UNK').length,missing=chart.cells.flat().filter(c=>c===null).length;
   $('scan-result').textContent=`${chart.columns}目 × ${chart.rows}段・${chart.yarns.length}色。`+(unknown?`「？」のマスが${unknown}か所あります。上で記号を選ぶか、作成後に記号ツールで直してください。`:'すべてのマスに記号が入りました。')+(missing?` 編み図の外の${missing}マスは「目がない場所」になります。`:'');
   $('scan-done-error').textContent='';$('scan-start').disabled=false;drawPreview();
  }catch(error){chart=null;$('scan-done-error').textContent=error.message;$('scan-start').disabled=true;}
 }
 function drawPreview(){
  const canvas=$('scan-preview'),width=canvas.clientWidth||canvas.parentElement.clientWidth;if(!chart||!width)return;
  const cell=Math.max(2,Math.min(24,(width-CHART_GUTTER-4)/chart.columns));canvas.style.height=`${Math.round(chart.rows*cell+CHART_HEADER+CHART_FOOTER)}px`;
  draw(canvas,chart,{cell,x:CHART_GUTTER,y:CHART_HEADER,numberFromRight:true},false,null,{color:'#8d1735',width:2});
 }
 $('scan-back-pages').onclick=()=>showPages();
 $('scan-name').oninput=()=>{if(chart)chart.name=$('scan-name').value.trim()||'本の編み図';};
 $('scan-start').onclick=()=>{if(!chart||!editable())return;if(!confirm('現在の作品を、取り込んだ編み図に置き換えますか？必要なら先に作品を書き出してください。'))return;
  const next=chart;next.name=$('scan-name').value.trim()||'本の編み図';replace(next);dialog.close();
  const unknown=next.symbols.flat().filter(c=>c==='UNK').length;
  message('本の編み図を取り込みました。'+(unknown?`「？」のマス（${unknown}か所）は、記号ツールで正しい記号に直してください。`:'マスの色や記号は、ふつうの編み図と同じように直せます。'));};
 dialog.addEventListener('close',()=>{source=null;current=null;drag=null;last=null;pages=[];reading=null;chart=null;});
 window.addEventListener('resize',()=>{if(dialog.open){if(!$('scan-step-corners').hidden)drawCorners();if(!$('scan-step-grid').hidden)drawGrid();if(!$('scan-step-symbols').hidden)drawPreview();}});
}
