import sharp from 'sharp';
// A ribbing chart with its middle left out, as books print it: rows 1-5 at the bottom, a band with no grid, then rows
// 15-20; row numbers 1, 5, 15, 20 in the right margin. 20 stitches of 1x1 ribbing (purl dash in every other stitch).
export const OMIT={cols:20,cell:22,lower:5,upper:6,first:15,band:34,left:40,top:40};
export async function omissionPhoto(){
 const {cols,cell,lower,upper,band,left,top,first}=OMIT,W=left*2+cols*cell+70,upperTop=top,upperBottom=top+upper*cell,lowerTop=upperBottom+band,lowerBottom=lowerTop+lower*cell,H=lowerBottom+top;
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f2f0ea"/>`;
 const block=(y0,rows,firstRow)=>{for(let r=0;r<=rows;r++)svg+=`<line x1="${left}" y1="${y0+r*cell}" x2="${left+cols*cell}" y2="${y0+r*cell}" stroke="#555" stroke-width="1.2"/>`;
  for(let c=0;c<=cols;c++)svg+=`<line x1="${left+c*cell}" y1="${y0}" x2="${left+c*cell}" y2="${y0+rows*cell}" stroke="#555" stroke-width="1.2"/>`;
  for(let r=0;r<rows;r++)for(let c=1;c<cols;c+=2){const y=y0+r*cell+cell/2;svg+=`<line x1="${left+c*cell+cell*.25}" y1="${y}" x2="${left+c*cell+cell*.75}" y2="${y}" stroke="#333" stroke-width="2"/>`;}
  for(let r=0;r<rows;r++){const n=firstRow+(rows-1-r);if(n===firstRow||n%5===0)svg+=`<text x="${left+cols*cell+12}" y="${y0+r*cell+cell*.8}" font-family="Arial" font-size="17" fill="#333">${n}</text>`;}};
 block(upperTop,upper,first);block(lowerTop,lower,1);
 svg+=`<text x="${left+30}" y="${upperBottom+band*.7}" font-family="Arial" font-size="14" fill="#666">ribbing (rows 6-14 left out)</text></svg>`;
 const {data,info}=await sharp(Buffer.from(svg)).blur(.5).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const quad=[[left,top],[left+cols*cell,top],[left+cols*cell,lowerBottom],[left,lowerBottom]];
 return {rgba:new Uint8ClampedArray(data.buffer,data.byteOffset,data.length),width:info.width,height:info.height,quad,
  jpeg:await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).jpeg({quality:92}).toBuffer()};
}
