// Knitting symbols (Japanese chart conventions) that a cell can carry besides its yarn. A blank cell is a knit stitch.
// Cables span several cells: each cell stores `CODE@i` (i = 0 for the leftmost cell), so copy, move, flip and the
// row/stitch edits keep working cell by cell. Drawing is shared by the chart, the import preview and the PDF.
export const STITCHES=Object.freeze([
 {code:'P',name:'裏目',width:1},
 {code:'TBL',name:'ねじり目',width:1},
 {code:'SL',name:'すべり目',width:1},
 {code:'K2TOG',name:'左上2目一度',width:1},
 {code:'SSK',name:'右上2目一度',width:1},
 {code:'S2KP',name:'中上3目一度',width:1},
 {code:'K3TOG',name:'左上3目一度',width:1},
 {code:'SK2P',name:'右上3目一度',width:1},
 {code:'BO',name:'伏せ目',width:1},
 {code:'RC1',name:'右上1目交差',width:2},
 {code:'LC1',name:'左上1目交差',width:2},
 {code:'RPC1',name:'右上1目交差（下側が裏目）',width:2},
 {code:'LPC1',name:'左上1目交差（下側が裏目）',width:2},
 {code:'RC2',name:'右上2目交差',width:4},
 {code:'LC2',name:'左上2目交差',width:4},
 {code:'RC21',name:'右上2目と1目の交差',width:3},
 {code:'LC21',name:'左上2目と1目の交差',width:3},
 {code:'RC21P',name:'右上2目と1目の交差（下側が裏目）',width:3},
 {code:'LC21P',name:'左上2目と1目の交差（下側が裏目）',width:3},
 {code:'RC12',name:'右上1目と2目の交差',width:3},
 {code:'LC12',name:'左上1目と2目の交差',width:3},
 {code:'RC12P',name:'右上1目と2目の交差（下側が裏目）',width:3},
 {code:'LC12P',name:'左上1目と2目の交差（下側が裏目）',width:3},
 {code:'RC3',name:'右上3目交差',width:6},
 {code:'LC3',name:'左上3目交差',width:6},
 {code:'RC4',name:'右上4目交差',width:8},
 {code:'LC4',name:'左上4目交差',width:8},
 {code:'UNK',name:'読み取れなかった記号（確認してください）',width:1},
]);
const byCode=new Map(STITCHES.map(s=>[s.code,s]));
// A left-right mirror turns a right-over cable into the left-over one of the same groups (右上2目と1目 ↔ 左上2目と1目).
const MIRROR={K2TOG:'SSK',SSK:'K2TOG',K3TOG:'SK2P',SK2P:'K3TOG',RC1:'LC1',LC1:'RC1',RPC1:'LPC1',LPC1:'RPC1',RC2:'LC2',LC2:'RC2',RC21:'LC21',LC21:'RC21',RC12:'LC12',LC12:'RC12',RC21P:'LC21P',LC21P:'RC21P',RC12P:'LC12P',LC12P:'RC12P',RC3:'LC3',LC3:'RC3',RC4:'LC4',LC4:'RC4'};
/** The same cable with the stitches underneath purled, if the app has it. */
export const PURLED=Object.freeze({RC1:'RPC1',LC1:'LPC1',RC21:'RC21P',LC21:'LC21P',RC12:'RC12P',LC12:'LC12P'});

/**
 * The strands of a cable, in cell units across its width: over/under: [[x at the bottom, x at the top], …].
 * 右上 (R…): the right-hand group crosses on top to the left (its strands run from bottom right to top left);
 * 左上 (L…): the left-hand group crosses on top to the right. k = stitches in the group on top. `purl`: the
 * stitches underneath are purled (「下側が裏目」).
 */
export function cableStrands(code){
 const s=byCode.get(code);if(!s||s.width<2)return null;
 const n=s.width,k={RC1:1,LC1:1,RPC1:1,LPC1:1,RC2:2,LC2:2,RC21:2,LC21:2,RC21P:2,LC21P:2,RC12:1,LC12:1,RC12P:1,LC12P:1,RC3:3,LC3:3,RC4:4,LC4:4}[code],m=n-k,a=i=>i+.5;
 const right=code.startsWith('R'),purl=code.includes('P');
 const over=right?Array.from({length:k},(_,i)=>[a(m+i),a(i)]):Array.from({length:k},(_,i)=>[a(i),a(m+i)]);
 const under=right?Array.from({length:m},(_,i)=>[a(i),a(k+i)]):Array.from({length:m},(_,i)=>[a(k+i),a(i)]);
 return {width:n,over,under,purl};
}

/** Every code a cell may hold: single-cell codes and each part of a wide symbol. */
export const STITCH_CELL_CODES=Object.freeze(STITCHES.flatMap(s=>s.width===1?[s.code]:Array.from({length:s.width},(_,i)=>`${s.code}@${i}`)));
/** {code, index, width, name} for a cell code, or null when it is not a stitch symbol. */
export function stitchPart(cellCode){
 if(typeof cellCode!=='string')return null;const [code,at]=cellCode.split('@'),s=byCode.get(code);if(!s)return null;
 const index=at===undefined?0:Number(at);if(s.width===1?at!==undefined:!(Number.isInteger(index)&&index>=0&&index<s.width&&String(index)===at))return null;
 return {code,index,width:s.width,name:s.name};
}
export const stitchDef=code=>byCode.get(code)??null;
export const cellCodes=(code)=>{const s=byCode.get(code);return s.width===1?[code]:Array.from({length:s.width},(_,i)=>`${code}@${i}`);};
/** The cell code seen in a left-right mirror (the cell itself moves to the mirrored column). */
export function mirrorStitch(cellCode){const part=stitchPart(cellCode);if(!part)return cellCode;const code=MIRROR[part.code]??part.code;return part.width===1?code:`${code}@${part.width-1-part.index}`;}

/**
 * Draw the symbol of one cell into the rectangle (x,y,w,h), in `ink`. A wide symbol is drawn across its whole span
 * (index cells to the left, the rest to the right) but clipped to this cell, so every cell can be drawn on its own.
 */
export function drawStitch(c,cellCode,x,y,w,h,ink){
 const part=stitchPart(cellCode);if(!part)return false;
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
 const sx=x-part.index*w,sw=w*part.width,lw=Math.max(.6,Math.min(w,h)*.09);
 c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=lw;c.lineCap='round';c.lineJoin='round';
 const L=(x0,y0,x1,y1)=>{c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();};
 const cx=x+w/2,cy=y+h/2,top=y+h*.18,bottom=y+h*.82,left=x+w*.2,right=x+w*.8;
 switch(part.code){
  case 'P':L(left,cy,right,cy);break;
  // ねじり目: a loop whose strands cross low in the cell.
  case 'TBL':c.beginPath();c.moveTo(left,bottom);c.bezierCurveTo(right+w*.08,y+h*.5,cx+w*.28,top,cx,top);c.bezierCurveTo(cx-w*.28,top,left-w*.08,y+h*.5,right,bottom);c.stroke();break;
  case 'SL':L(left,top,cx,bottom);L(cx,bottom,right,top);break;
  // 2目一度 / 3目一度: strokes meeting at the top; the stitch that lies on top is the unbroken stroke.
  case 'K2TOG':L(left,bottom,cx,top);L(right,bottom,cx+w*.07,top+h*.2);break;     // 左上: the left stitch on top
  case 'SSK':L(right,bottom,cx,top);L(left,bottom,cx-w*.07,top+h*.2);break;       // 右上: the right stitch on top
  case 'S2KP':L(cx,bottom,cx,top);L(left,bottom,cx-w*.06,top+h*.2);L(right,bottom,cx+w*.06,top+h*.2);break;
  case 'K3TOG':L(left,bottom,cx,top);L(cx,bottom,cx+w*.03,top+h*.22);L(right,bottom,cx+w*.08,top+h*.2);break;
  case 'SK2P':L(right,bottom,cx,top);L(cx,bottom,cx-w*.03,top+h*.22);L(left,bottom,cx-w*.08,top+h*.2);break;
  case 'BO':c.beginPath();c.arc(cx,cy,Math.min(w,h)*.22,0,Math.PI*2);c.fill();break;
  case 'UNK':c.font=`bold ${Math.min(w,h)*.7}px -apple-system, sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('?',cx,cy+h*.04);break;
  default:{// Cables: the strands on top are drawn whole; the ones underneath are broken where they pass under.
   const g=cableStrands(part.code),t=top,b=bottom,X=u=>sx+u*w,my=(t+b)/2,gap=.22;
   for(const [x0,x1] of g.under){const p0=X(x0),p1=X(x1),mx=(p0+p1)/2;L(p0,b,p0+(mx-p0)*(1-gap),b+(my-b)*(1-gap));L(mx+(p1-mx)*gap,my+(t-my)*gap,p1,t);}
   for(const [x0,x1] of g.over)L(X(x0),b,X(x1),t);
   // 「下側が裏目」: a purl bar where each stitch underneath starts.
   if(g.purl)for(const [x0] of g.under)L(X(x0)-w*.22,b+h*.07,X(x0)+w*.22,b+h*.07);
  }
 }
 c.restore();return true;
}
