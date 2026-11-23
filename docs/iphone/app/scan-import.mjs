import {rectify,grayscale,analyzePage,fitPage,linesAt,detectGrid,insetQuad,checkQuad,scanProject,scanLayout,SCAN_MAX_ROWS,SCAN_IMAGE_MAX} from './scan-model.mjs';
import {drawScan,fitView,zoomGestures} from './scan-draw.mjs';
import {sizeCanvas} from './draw.mjs';

// 「本の編み図を撮って段数を数える」: photograph a book page (or both pages of a spread, one at a time), fit the
// four corners of the grid, check the rows, and count on the photo itself. Everything stays on the device.
const SOURCE_LONG=3200,DETECT_LONG=640,HANDLE=36,LOUPE=112,ZOOM=3,CORNERS=['左上','右上','右下','左下'];
export function setupScanImport({replace,editable,message,readability}){
 const $=id=>document.getElementById(id),dialog=$('scan-dialog');
 let pages=[],join='single',addAt='right',source=null,quad=null,flat=null,analysis=null,detected=null,drag=null,fit=null,last=null;
 const checkView={scale:0,x:0,y:0};
 const step=name=>{for(const s of ['start','corners','rows','done'])$(`scan-step-${s}`).hidden=s!==name;dialog.querySelector('.dialog-body').scrollTop=0;};
 const pageLabel=()=>pages.length===0?'1ページ目':join==='side'?`2ページ目（${addAt==='left'?'左':'右'}のページ）`:'2ページ目（段の続き）';

 function open(){if(!editable())return;pages=[];join='single';addAt='right';last=null;source=null;$('scan-name').value='本の編み図';$('scan-page-label').textContent=pageLabel();step('start');dialog.showModal();}
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
  $('scan-corners-error').textContent=found?'':'マス目を見つけられませんでした。4つの丸を編み図の角に合わせてください。';
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
  // Dim outside the chart; outline the edges.
  c.fillStyle='rgba(27,52,43,.45)';c.beginPath();c.rect(0,0,width,height);quad.forEach((q,i)=>{const [x,y]=S(q);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fill('evenodd');
  c.lineWidth=2;c.strokeStyle='#ffe600';c.beginPath();quad.forEach((q,i)=>{const [x,y]=S(q);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.stroke();
  quad.forEach((q,i)=>{const [x,y]=S(q);c.beginPath();c.arc(x,y,drag?.i===i?16:12,0,Math.PI*2);c.fillStyle='rgba(255,230,0,.35)';c.fill();c.lineWidth=3;c.strokeStyle='#ffe600';c.stroke();
   c.font='bold 11px -apple-system, sans-serif';c.textAlign='center';c.textBaseline='middle';const lx=x+(i===1||i===2?-26:26),ly=y+(i>=2?-20:20);c.lineWidth=3;c.strokeStyle='#1b342b';c.strokeText(CORNERS[i],lx,ly);c.fillStyle='white';c.fillText(CORNERS[i],lx,ly);});
  if(drag){// Loupe away from the finger: the corner it marks is under the cross.
   const [hx,hy]=quad[drag.i],left=S(quad[drag.i])[0]>width/2,lx=left?12:width-LOUPE-12,ly=12,r=LOUPE/2;
   c.save();c.beginPath();c.arc(lx+r,ly+r,r,0,Math.PI*2);c.clip();c.fillStyle='white';c.fillRect(lx,ly,LOUPE,LOUPE);
   const half=LOUPE/2/(ZOOM*k);c.drawImage(source,hx-half,hy-half,half*2,half*2,lx,ly,LOUPE,LOUPE);
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

 // ---- 3. rows ----
 $('scan-flatten').onclick=()=>{
  try{checkQuad(quad,source.width,source.height);}catch(error){$('scan-corners-error').textContent=error.message;return;}
  $('scan-flatten').disabled=true;$('scan-flatten').textContent='補正しています…';
  setTimeout(()=>{try{
   const data=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height).data,r=rectify(data,source.width,source.height,quad);
   const canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;canvas.getContext('2d').putImageData(new ImageData(r.data,r.width,r.height),0,0);
   flat={canvas,width:r.width,height:r.height,grid:r.grid};
   analysis=analyzePage(grayscale(r.data,r.width,r.height),r.width,r.height,r.grid);detected=analysis.rows;
   const fixed=join==='side'&&pages.length===1?pages[0].rows:null;
   $('scan-rows').value=fixed??detected??'';$('scan-rows').disabled=fixed!==null;$('scan-rows-less').disabled=$('scan-rows-more').disabled=fixed!==null;
   $('scan-detected').textContent=fixed!==null?`もう片方のページと同じ${fixed}段です。`+(detected&&detected!==fixed?`（写真からは${detected}段に見えます。四隅がずれていないか確かめてください）`:''):detected?`写真のマス目から${detected}段と読み取りました。本の段数と合っているか確かめてください。`:'段の線を読み取れませんでした。このページの段数を入力してください。';
   checkView.scale=0;step('rows');requestAnimationFrame(drawCheck);
  }catch(error){$('scan-corners-error').textContent=error.message;}finally{$('scan-flatten').disabled=false;$('scan-flatten').textContent='次へ：段を確かめる';}},30);
 };
 $('scan-back-corners').onclick=()=>{step('corners');requestAnimationFrame(drawCorners);};
 const rowsValue=()=>{const n=Number($('scan-rows').value);return Number.isInteger(n)&&n>=1&&n<=SCAN_MAX_ROWS?n:null;};
 const lines=()=>{const n=rowsValue();return n?fitPage(analysis,n):null;};
 $('scan-rows').oninput=()=>{$('scan-rows-error').textContent=rowsValue()?'':`段数は1〜${SCAN_MAX_ROWS}の整数で入力してください。`;drawCheck();};
 $('scan-rows-less').onclick=()=>{$('scan-rows').value=Math.max(1,(rowsValue()||2)-1);$('scan-rows').oninput();};
 $('scan-rows-more').onclick=()=>{$('scan-rows').value=Math.min(SCAN_MAX_ROWS,(rowsValue()||0)+1);$('scan-rows').oninput();};
 function drawCheck(){
  const canvas=$('scan-check'),s=sizeCanvas(canvas);if(!s||!flat)return;const {ctx:c,width,height}=s,v=checkView,gutter=34;
  const fitScale=(width-gutter)/flat.width;if(!v.scale){v.scale=fitScale;v.x=gutter;v.y=Math.min(0,(height-flat.height*v.scale)/2);}
  const w=flat.width*v.scale,h=flat.height*v.scale;v.x=w<=width-gutter?gutter+(width-gutter-w)/2:Math.min(gutter,Math.max(width-w,v.x));v.y=h<=height?(height-h)/2:Math.min(0,Math.max(height-h,v.y));
  c.fillStyle='#e9ebe3';c.fillRect(0,0,width,height);c.imageSmoothingQuality='high';c.drawImage(flat.canvas,v.x,v.y,w,h);
  const fitted=lines();if(!fitted)return;const g=flat.grid,xs=[g.left,...fitted.strips,g.right],at=xs.map(x=>linesAt(fitted,x));
  c.fillStyle='#f5f7f2';c.fillRect(0,0,gutter,height);c.font='10px -apple-system, sans-serif';c.textAlign='right';c.textBaseline='middle';
  const first=pages.length&&join==='stack'?pages[0].rows:0,rows=at[0].length-1;let lastY=Infinity;
  // Each boundary follows the strips, so a bent row shows as a bent line.
  for(let i=0;i<=rows;i++){const major=(first+i)%5===0;c.strokeStyle=major?'#d0021b':'#d0021bb0';c.lineWidth=major?2:1;c.beginPath();xs.forEach((x,k)=>{const px=v.x+x*w,py=v.y+at[k][i]*h;k?c.lineTo(px,py):c.moveTo(px,py);});c.stroke();
   if(i<rows){const mid=v.y+(at[0][i]+at[0][i+1])/2*h,n=first+i+1;if((n%5===0||n===1||Math.abs(at[0][i+1]-at[0][i])*h>=13)&&Math.abs(lastY-mid)>=12){c.fillStyle='#52665a';c.fillText(String(n),gutter-5,mid);lastY=mid;}}}
 }
 zoomGestures($('scan-check'),checkView,{onChange:drawCheck,minScale:()=>flat?($('scan-check').clientWidth-34)/flat.width:.02,maxScale:()=>6});
 $('scan-page-done').onclick=()=>{
  const fitted=lines();if(!fitted){$('scan-rows-error').textContent=`段数は1〜${SCAN_MAX_ROWS}の整数で入力してください。`;return;}
  const image=flat.canvas.toDataURL('image/jpeg',.85);if(image.length>SCAN_IMAGE_MAX){$('scan-rows-error').textContent='写真が大きすぎます。編み図を枠いっぱいに撮り直してください。';return;}
  const g=flat.grid,round=v=>Math.round(v*1e5)/1e5;
  const page={image,width:flat.width,height:flat.height,rows:fitted.lines[0].length-1,grid:{left:round(g.left),right:round(g.right),top:round(g.top),bottom:round(g.bottom)},strips:fitted.strips,lines:fitted.lines};
  if(pages.length===1&&join==='side'&&addAt==='left')pages.unshift(page);else pages.push(page);
  if(pages.length===1)join='single';last={source,quad:quad.map(q=>[...q])};source=null;flat=null;showDone();
 };

 // ---- 4. pages and start ----
 let preview=null;const overview={scale:0,x:0,y:0};
 function showDone(){
  $('scan-done-error').textContent='';
  try{preview=scanProject({version:1,join,pages},$('scan-name').value);}catch(error){preview=null;$('scan-done-error').textContent=error.message;}
  const total=preview?.rows??0;
  $('scan-summary').textContent=pages.length===1?`1ページ・${total}段`:join==='side'?`左右2ページ・${total}段（同じ段が左右に続きます）`:`2ページ・${pages[0].rows}段＋${pages[1].rows}段＝${total}段（下のページの続きを上に表示）`;
  $('scan-add-page').hidden=pages.length>=2;$('scan-add-same').hidden=!last?.source;$('scan-remove-page').hidden=pages.length<2;$('scan-start').disabled=!preview;
  overview.scale=0;step('done');requestAnimationFrame(drawOverview);
 }
 function drawOverview(){if(!preview)return;const c=$('scan-overview');if(!overview.scale&&c.clientWidth)fitView(overview,scanLayout(preview.scan),c.clientWidth,c.clientHeight);drawScan(c,preview,overview,readability(),drawOverview);}
 zoomGestures($('scan-overview'),overview,{onChange:drawOverview});
 const addPage=(kind,at='right')=>{join=kind;addAt=at;$('scan-page-label').textContent=pageLabel();$('scan-start-error').textContent='';step('start');};
 $('scan-add-left').onclick=()=>addPage('side','left');$('scan-add-side').onclick=()=>addPage('side','right');$('scan-add-stack').onclick=()=>addPage('stack');
 // Charts split into blocks on one page (body below, raglan above, a gap between): the next block of the same photo.
 $('scan-add-same').onclick=()=>{if(!last?.source)return;join='stack';addAt='top';source=last.source;
  const [tl,tr,br,bl]=last.quad,h=(Math.hypot(bl[0]-tl[0],bl[1]-tl[1])+Math.hypot(br[0]-tr[0],br[1]-tr[1]))/2,up=Math.min(h,tl[1],tr[1]);
  quad=up<8?last.quad.map(q=>[...q]):[[tl[0],tl[1]-up],[tr[0],tr[1]-up],[tr[0],tr[1]],[tl[0],tl[1]]];
  $('scan-page-label').textContent=pageLabel();$('scan-corners-error').textContent='下のブロックの上に枠を置きました。続きのブロックの四隅に合わせてください。';step('corners');requestAnimationFrame(drawCorners);};
 $('scan-remove-page').onclick=()=>{pages=join==='side'&&addAt==='left'?pages.slice(1):pages.slice(0,1);join='single';showDone();};
 $('scan-name').oninput=()=>{if(preview)preview.name=$('scan-name').value.trim()||'本の編み図';};
 $('scan-start').onclick=()=>{if(!preview||!editable())return;if(!confirm('現在の作品を、撮影した編み図に置き換えますか？必要なら先に作品を書き出してください。'))return;
  const next=scanProject({version:1,join,pages},$('scan-name').value);replace(next);dialog.close();
  message('撮影した編み図で段数カウンターを始めました。今の段に帯が付きます。編めたら「この段を完了」を押してください。');};
 // While a page is being set up, leaving the dialog keeps nothing half-done.
 dialog.addEventListener('close',()=>{source=null;flat=null;analysis=null;drag=null;last=null;});
 window.addEventListener('resize',()=>{if(dialog.open){if(!$('scan-step-corners').hidden)drawCorners();if(!$('scan-step-rows').hidden)drawCheck();if(!$('scan-step-done').hidden)drawOverview();}});
}
