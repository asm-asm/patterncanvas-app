import {rectify,grayscale,detectGrid,insetQuad,checkQuad,flatRegion,linesAt,SCAN_MAX_ROWS} from './scan-model.mjs';
import {readRowNumbers,readStitchNumbers,rowOffset} from './rownumbers.mjs';
import {analyzeGrid,findGaps,checkCounts,noteBoxes,cellsUnderNotes,fitGrid,buildMesh,unwarp,readCells,outsideCells,groupShapes,groupColours,mergeColours,buildChart,spanReader,hex} from './chart-convert.mjs';
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

export function setupScanImport({replace,editable,message,readText=null}){
 const $=id=>document.getElementById(id),dialog=$('scan-dialog');
 let units=[],unitOf=[],pages=[],join='single',addAt='right',source=null,quad=null,current=null,drag=null,fit=null,last=null,reading=null,chart=null,timer=0;
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
  setTimeout(async()=>{try{
   const data=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height).data,r=rectify(data,source.width,source.height,quad);
   const gray=grayscale(r.data,r.width,r.height),analysis=analyzeGrid(gray,r.width,r.height,r.grid),C0=analysis.cols.rows;
   // Bands with no stitch lines across the grid are rows the book left out (「省略」): the frame splits into blocks there.
   const gaps=C0?findGaps(gray,r.width,r.height,r.grid,C0):[],top=r.grid.top*r.height,bottom=r.grid.bottom*r.height,edges=[top,...gaps.flat(),bottom],blocks=[];
   for(let i=edges.length-2;i>=0;i-=2){const grid={...r.grid,top:edges[i]/r.height,bottom:edges[i+1]/r.height};blocks.push({grid,analysis:gaps.length?analyzeGrid(gray,r.width,r.height,grid):analysis});}
   // The row and stitch numbers printed beside and under the chart, read from the photo's own pixels: they check the
   // counts and tell how many rows each omission leaves out.
   const density=Math.max(1,Math.min(3,Math.hypot(quad[1][0]-quad[0][0],quad[1][1]-quad[0][1])/((r.grid.right-r.grid.left)*r.width)));
   const region=(x0,x1,y0,y1)=>({...flatRegion(data,source.width,source.height,quad,r.width,r.height,{x0,x1,y0,y1},density),k:density});
   const rowPitch=(r.grid.bottom-r.grid.top)*r.height/Math.max(1,analysis.rows.rows||40),colPitch=(r.grid.right-r.grid.left)*r.width/Math.max(1,C0||40);
   const numbers={rows:readRowNumbers(region,r.width,r.height,r.grid,rowPitch),stitches:readStitchNumbers(region,r.width,r.height,r.grid,colPitch)};
   // On the device: the system's text recognition finds the notes and reads the numbers far better than the digit
   // shapes above (which stay for when it is not there).
   let notes=[];
   if(readText){try{const canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;canvas.getContext('2d').putImageData(new ImageData(r.data,r.width,r.height),0,0);
     const found=await readText(canvas.toDataURL('image/jpeg',.9).split(',')[1]),W=r.width,H=r.height,g=r.grid;
     const items=(found.items||[]).map(t=>({text:String(t.text),confidence:t.confidence,x:t.x*W,y:t.y*H,w:t.w*W,h:t.h*H}));notes=noteBoxes(items);
     const read=(found.numbers||[]).map(n=>({value:n.value,x:(n.x+n.w/2)*W,y:(n.y+n.h/2)*H}));
     const side=read.filter(n=>n.x<g.left*W||n.x>g.right*W),below=read.filter(n=>n.y<g.top*H||n.y>g.bottom*H);
     if(side.length>=2)numbers.rows=side;if(below.length>=2)numbers.stitches=below;}catch{}}
   const whole=checkCounts(analysis,blocks.length===1?analysis.rows.rows:null,C0,numbers);
   blocks.forEach(b=>{b.count=blocks.length===1?whole.rows:checkCounts(b.analysis,b.analysis.rows.rows,null,{rows:numbers.rows}).rows;});
   const C1=whole.cols;
   current={rgba:r.data,width:r.width,height:r.height,analysis,blocks,notes,numbers:numbers.rows,omits:gaps.map(()=>({value:null,edited:false})),source,quad:quad.map(q=>[...q])};
   const fixedRows=join==='side'&&pages.length===1&&blocks.length===1&&(pages[0].parts?.length??1)===1?pages[0].R:null;
   $('scan-rows').value=fixedRows??blocks[0].count??'';$('scan-cols').value=C1??'';
   $('scan-rows').disabled=$('scan-rows-less').disabled=$('scan-rows-more').disabled=fixedRows!==null;
   $('scan-rows-step').hidden=blocks.length>1;showBlocks();
   const read=[blocks.length===1&&whole.rows&&`${whole.rows}段`,C1&&`${C1}目`].filter(Boolean).join('・');
   const checked=(blocks.length>1||whole.rowsChecked)&&whole.colsChecked,unsure=!analysis.rows.sure||!analysis.cols.sure;
   $('scan-detected').textContent=(fixedRows!==null?`段数はもう片方のページと同じ${fixedRows}段です。`:'')+(blocks.length>1?`途中に段の省略が${gaps.length}か所あります。省略された段は、すぐ下の段の模様をくり返して埋めます。`:'')
    +(read?(checked?`マス目と段・目の番号から${read}と読み取りました。`:unsure?`マス目から${read}と見積もりました。線がはっきりしない所があるので、本の段数・目数と見比べてください。`:`写真のマス目から${read}と読み取りました。本の段数・目数と合っているか確かめてください。`):'')+(!C1||blocks.some(b=>!b.count)?'読み取れなかった数を入力してください。':'');
   gridView.scale=0;step('grid');refit();
  }catch(error){$('scan-corners-error').textContent=error.message;}finally{$('scan-flatten').disabled=false;$('scan-flatten').textContent='次へ：マス目を確かめる';}},30);
 };
 $('scan-back-corners').onclick=()=>{source=current?.source??source;step('corners');requestAnimationFrame(drawCorners);};
 const count=id=>{const n=Number($(id).value);return Number.isInteger(n)&&n>=1&&n<=MAX_COUNT?n:null;};
 // Several blocks: a row count for each (top first, as on the page) and the rows left out between them.
 function showBlocks(){
  const box=$('scan-blocks');box.replaceChildren();box.hidden=current.blocks.length<2;if(current.blocks.length<2)return;
  const stepper=(label,id,value,oninput)=>{const row=document.createElement('div');row.className='color-step';const less=document.createElement('button'),more=document.createElement('button'),wrap=document.createElement('label'),input=document.createElement('input');
   less.type=more.type='button';less.textContent='−1';more.textContent='＋1';wrap.textContent=label;input.id=id;input.type='number';input.min='0';input.max=String(MAX_COUNT);input.inputMode='numeric';input.value=value??'';wrap.append(input);
   input.oninput=()=>oninput(input);less.onclick=()=>{input.value=Math.max(0,(Number(input.value)||0)-1);oninput(input);};more.onclick=()=>{input.value=Math.min(MAX_COUNT,(Number(input.value)||0)+1);oninput(input);};
   row.append(less,wrap,more);return row;};
  for(let i=current.blocks.length-1;i>=0;i--){const b=current.blocks[i];
   box.append(stepper(`${i===current.blocks.length-1?'いちばん上':i===0?'いちばん下':`下から${i+1}つ目`}のブロックの段数`,`scan-block-rows-${i}`,b.count,()=>refit()));
   if(i>0){const o=current.omits[i-1],row=stepper('省略された段数',`scan-omit-${i-1}`,o.value,input=>{o.edited=true;o.value=Number(input.value)||0;refit();});row.classList.add('scan-omit');box.append(row);
    const note=document.createElement('p');note.className='hint';note.id=`scan-omit-note-${i-1}`;box.append(note);}}
 }
 function refit(){
  clearTimeout(timer);current.unwarp=null;$('scan-page-done').disabled=true;
  const C=count('scan-cols'),blocks=current.blocks,rowsOf=i=>blocks.length===1?count('scan-rows'):count(`scan-block-rows-${i}`);
  const ok=C&&blocks.every((_,i)=>rowsOf(i));$('scan-grid-error').textContent=ok?'':`段数・目数は1〜${MAX_COUNT}の整数で入力してください。`;
  if(!ok){drawGrid();return;}
  timer=setTimeout(()=>{try{
   current.C=C;
   blocks.forEach((b,i)=>{b.R=rowsOf(i);b.fit=fitGrid(b.analysis,b.R,C);b.mesh=buildMesh(b.fit);const u=unwarp(current.rgba,current.width,current.height,b.mesh,b.R,C,UNWARP),canvas=document.createElement('canvas');canvas.width=u.width;canvas.height=u.height;canvas.getContext('2d').putImageData(new ImageData(u.data,u.width,u.height),0,0);b.unwarp=canvas;
    // How the book numbers this block's rows, from the numbers beside it.
    const edge=linesAt(b.fit.rows,b.grid.right).map(v=>v*current.height);b.offset=current.numbers.length?rowOffset(current.numbers,y=>{for(let r=1;r<=b.R;r++)if(y<=edge[r-1]&&y>=edge[r])return r;return null;}):null;});
   current.omits.forEach((o,i)=>{const lo=blocks[i],up=blocks[i+1],guess=lo.offset!=null&&up.offset!=null?up.offset-lo.offset-lo.R:null,ok=guess!==null&&guess>=0&&guess<=MAX_COUNT;
    if(!o.edited){o.value=ok?guess:0;const input=$(`scan-omit-${i}`);if(input)input.value=o.value;}
    const note=$(`scan-omit-note-${i}`);if(note)note.textContent=o.edited?'':ok?`段番号から${guess}段と予測しました。本の段番号と合っているか確かめてください。`:'段番号を読み取れませんでした。本の段番号から、省略された段数を入力してください。';});
   current.R=blocks.reduce((n,b)=>n+b.R,0)+current.omits.reduce((n,o)=>n+(o.value||0),0);
   // One picture: the blocks top first, with a hatched band for each omission.
   const band=Math.round(UNWARP*1.4),canvas=document.createElement('canvas');canvas.width=C*UNWARP;canvas.height=blocks.reduce((n,b)=>n+b.unwarp.height,0)+band*(blocks.length-1);
   const g=canvas.getContext('2d');let y=0;current.rowsAt=[];let first=pages.length&&join==='stack'?pages.reduce((n,pg)=>n+pg.R,0):0;
   const numbered=[];let row=first;blocks.forEach((b,i)=>{numbered[i]=row;row+=b.R+(current.omits[i]?.value||0);});
   for(let i=blocks.length-1;i>=0;i--){const b=blocks[i];g.drawImage(b.unwarp,0,y);for(let r=1;r<=b.R;r++)current.rowsAt.push({n:numbered[i]+r,y:y+(b.R-r+.5)*UNWARP});y+=b.unwarp.height;
    if(i>0){g.fillStyle='#f8e6d8';g.fillRect(0,y,canvas.width,band);g.strokeStyle='#d0021b88';g.lineWidth=2;for(let x=-band;x<canvas.width;x+=12){g.beginPath();g.moveTo(x,y+band);g.lineTo(x+band,y);g.stroke();}
     g.fillStyle='#8d1735';g.font=`bold ${Math.round(band*.6)}px -apple-system, sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(`${current.omits[i-1].value||0}段省略`,canvas.width/2,y+band/2);y+=band;}}
   current.unwarp=canvas;$('scan-page-done').disabled=false;drawGrid();
  }catch(error){$('scan-grid-error').textContent=error.message;}},60);
 }
 function drawGrid(){
  const canvas=$('scan-grid'),s=sizeCanvas(canvas);if(!s)return;const {ctx:c,width,height}=s,v=gridView,gutter=30;
  c.fillStyle='#e9ebe3';c.fillRect(0,0,width,height);const img=current?.unwarp;if(!img)return;
  v.min=(width-gutter)/img.width*.5;v.max=(width-gutter)/img.width*10;if(!v.scale){v.scale=(width-gutter)/img.width;v.x=gutter;v.y=Math.min(0,height-img.height*v.scale);}
  const w=img.width*v.scale,h=img.height*v.scale;v.x=w<=width-gutter?gutter+(width-gutter-w)/2:Math.min(gutter,Math.max(width-w,v.x));v.y=h<=height?(height-h)/2:Math.min(0,Math.max(height-h,v.y));
  c.imageSmoothingQuality='high';c.drawImage(img,v.x,v.y,w,h);
  // Every 5th row (as the chart will number them) and every 5th stitch from the right, in red.
  const k=v.scale,C=current.C,cell=w/C;c.strokeStyle='#d0021bcc';c.lineWidth=1.5;c.beginPath();
  for(const {n,y} of current.rowsAt)if(n%5===0){const py=v.y+(y-UNWARP/2)*k;c.moveTo(v.x,py);c.lineTo(v.x+w,py);}
  for(let j=5;j<C;j+=5){const x=v.x+w-j*cell;c.moveTo(x,v.y);c.lineTo(x,v.y+h);}c.stroke();
  c.fillStyle='#f5f7f2';c.fillRect(0,0,gutter,height);c.fillStyle='#52665a';c.font='10px -apple-system, sans-serif';c.textAlign='right';c.textBaseline='middle';
  for(const {n,y} of current.rowsAt){if(n!==1&&n%5)continue;const py=v.y+y*k;if(py>-10&&py<height+10)c.fillText(String(n),gutter-4,py);}
 }
 zoomGestures($('scan-grid'),gridView,drawGrid);
 for(const id of ['scan-rows','scan-cols'])$(id).oninput=refit;
 for(const [id,target,d] of [['scan-rows-less','scan-rows',-1],['scan-rows-more','scan-rows',1],['scan-cols-less','scan-cols',-1],['scan-cols-more','scan-cols',1]])
  $(id).onclick=()=>{$(target).value=Math.max(1,Math.min(MAX_COUNT,(count(target)||0)+d));refit();};
 $('scan-page-done').onclick=()=>{
  if(!current?.unwarp){$('scan-grid-error').textContent='マス目の計算が終わるまでお待ちください。';return;}
  const page={source:current.source,quad:current.quad,R:current.R,C:current.C,omits:current.omits.map(o=>o.value||0),
   parts:current.blocks.map(b=>({rgba:current.rgba,width:current.width,height:current.height,mesh:b.mesh,R:b.R,C:current.C,unwarp:b.unwarp,notes:current.notes}))};
  if(pages.length===1&&join==='side'&&addAt==='left')pages.unshift(page);else pages.push(page);
  if(pages.length===1)join='single';last={source:current.source,quad:current.quad};current=null;source=null;reading=null;showPages();
 };

 // ---- 4. pages ----
 function showPages(){
  const total=join==='side'?pages[0].R:pages.reduce((n,pg)=>n+pg.R,0),cols=join==='side'?pages.reduce((n,pg)=>n+pg.C,0):Math.max(...pages.map(pg=>pg.C));
  const omitted=pages.reduce((n,pg)=>n+(pg.omits||[]).reduce((a,b)=>a+b,0),0);
  $('scan-summary').textContent=(pages.length===1?`1ページ：${cols}目 × ${total}段`:join==='side'?`左右2ページ：${cols}目 × ${total}段（同じ段が左右に続きます）`:`2ブロック：${pages[0].R}段＋${pages[1].R}段＝${total}段・${cols}目（下のブロックの上に続けます）`)+(omitted?`。省略された${omitted}段を含みます`:'');
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
  // Every block of every page is read on its own (a unit); unitOf[n][p] finds it again.
  units=pages.flatMap((pg,n)=>pg.parts.map((part,p)=>({n,p,part})));unitOf=pages.map((pg,n)=>pg.parts.map((_,p)=>units.findIndex(u=>u.n===n&&u.p===p)));
  units.forEach(({part:pg},n)=>{if(!pg.cells){pg.cells=readCells(pg.rgba,pg.width,pg.height,pg.mesh,pg.R,pg.C);pg.outside=outsideCells(pg.cells,pg.R,pg.C);
    const under=cellsUnderNotes(pg.cells,pg.mesh,pg.C,pg.width,pg.height,pg.notes||[],pg.outside);pg.outside=under.outside;
    pg.codes=recognize(pg.cells,pg.R,pg.C,pg.outside,{groups:groupShapes(pg.cells,pg.outside),span:spanReader(pg.rgba,pg.width,pg.height,pg.mesh,pg.C,pg.cells)});
    under.notes.forEach((v,k)=>{if(v&&!pg.outside[k])pg.codes[k]=null;});} // a note printed over the grid is not a symbol
   pg.cells.forEach((c,k)=>{all.push(c);at.push([n,k]);});});
  const U=units.map(u=>u.part),skip=Uint8Array.from(at,([n,k])=>U[n].outside[k]),detected=groupColours(all,skip);
  // Unread cells, grouped by shape over all pages, so the same unknown symbol is named once.
  const unknown=all.map((c,m)=>{const [n,k]=at[m];return U[n].codes[k]==='UNK';}),shapes=groupShapes(all,Uint8Array.from(unknown,u=>u?0:1));
  const unknownGroup=U.map(pg=>new Int32Array(pg.cells.length).fill(-1));shapes.forEach((g,i)=>g.members.forEach(m=>{const [n,k]=at[m];unknownGroup[n][k]=i;}));
  // Kinds: knit, each symbol, each cable (counted per cable), and each unread shape.
  const kinds=new Map();
  U.forEach((pg,n)=>pg.codes.forEach((code,k)=>{if(pg.outside[k])return;const part=stitchPart(code);if(part&&part.index>0)return;
   const key=code==='UNK'?`UNK:${unknownGroup[n][k]}`:part&&part.width>1?part.code:(code??'');
   // The example shown is the cell nearest the middle of the page (the clearest part of a photo).
   const c=pg.cells[k],off=Math.hypot(c.r/pg.R-.5,c.c/pg.C-.5);
   if(!kinds.has(key))kinds.set(key,{key,code:part&&part.width>1?part.code:code,width:part?.width??1,count:0,example:[n,k],off});
   const kind=kinds.get(key);kind.count++;if(off<kind.off){kind.off=off;kind.example=[n,k];}}));
  reading={all,at,detected,colour:U.map(pg=>new Int32Array(pg.cells.length).fill(0)),unknownGroup,kinds:[...kinds.values()].sort((a,b)=>(a.code==='UNK')-(b.code==='UNK')||b.count-a.count),changed:new Map()};
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
  const pg=units[n].part,c=pg.cells[k],from=Math.max(0,c.c-(w>1?0:1)),cols=Math.min(pg.C-from,Math.max(3,w)),scale=w>2?2:3,canvas=document.createElement('canvas');canvas.width=UNWARP*scale*Math.max(3,w);canvas.height=UNWARP*scale;
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
 function codeOf(page,k,p=0){
  const n=unitOf[page][p],pg=units[n].part,code=pg.codes[k],part=stitchPart(code);
  const key=code==='UNK'?`UNK:${reading.unknownGroup[n][k]}`:part&&part.width>1?part.code:(code??'');
  if(!reading.changed.has(key))return code;const next=reading.changed.get(key)||null;
  if(part&&part.width>1)return next&&stitchDef(next)?.width===part.width?`${next}@${part.index}`:next==='UNK'?'UNK':null;
  return next;
 }
 const build=()=>buildChart({pages,join,codeOf,colourOf:(page,k,p=0)=>reading.colour[unitOf[page][p]][k],colours:reading.yarns.map((y,i)=>({color:y.color,name:`色${i+1}`})),name:$('scan-name').value});
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
