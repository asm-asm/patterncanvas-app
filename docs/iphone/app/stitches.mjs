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
 {code:'RC21P',name:'右上2目と1目の交差（下側が裏目）',width:3},
 {code:'LC21P',name:'左上2目と1目の交差（下側が裏目）',width:3},
 {code:'RC3',name:'右上3目交差',width:6},
 {code:'LC3',name:'左上3目交差',width:6},
 {code:'UNK',name:'読み取れなかった記号（確認してください）',width:1},
]);
const byCode=new Map(STITCHES.map(s=>[s.code,s]));
const MIRROR={K2TOG:'SSK',SSK:'K2TOG',K3TOG:'SK2P',SK2P:'K3TOG',RC1:'LC1',LC1:'RC1',RPC1:'LPC1',LPC1:'RPC1',RC2:'LC2',LC2:'RC2',RC21P:'LC21P',LC21P:'RC21P',RC3:'LC3',LC3:'RC3'};

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
  default:{// Cables: the stitches crossing on top are drawn whole; the ones behind are broken where they pass under.
   const n=part.width,k=part.code.includes('21')?2:part.code.endsWith('3')?3:part.code.endsWith('2')?2:1,front=k,back=n-k,rightOver=part.code.startsWith('R');
   const purl=part.code.includes('P'),t=top,b=bottom,step=sw/n,a=i=>sx+step*(i+.5);
   // Over: from the bottom positions of one group to the top positions of the other.
   const over=rightOver?Array.from({length:front},(_,i)=>[a(i),a(back+i)]):Array.from({length:front},(_,i)=>[a(back+i),a(i)]);
   const under=rightOver?Array.from({length:back},(_,i)=>[a(front+i),a(i)]):Array.from({length:back},(_,i)=>[a(i),a(front+i)]);
   // Under strands first, with a gap in the middle.
   for(const [x0,x1] of under){const mx=(x0+x1)/2,my=(t+b)/2,g=.22;L(x0,b,x0+(mx-x0)*(1-g),b+(my-b)*(1-g));L(mx+(x1-mx)*g,my+(t-my)*g,x1,t);}
   for(const [x0,x1] of over)L(x0,b,x1,t);
   if(purl)for(const [,x1] of under)L(x1-step*.3,t-h*.05,x1+step*.3,t-h*.05);
  }
 }
 c.restore();return true;
}
