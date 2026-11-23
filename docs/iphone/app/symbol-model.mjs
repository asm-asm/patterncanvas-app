import {WEIGHTS} from './symbol-weights.mjs';

// A small on-device model that names the knitting symbol in one cell: a convolutional network trained on drawn
// Japanese (JIS) chart symbols in many styles (scripts/symbol-model). Input: the cell's ink map (CELL x CELL, from
// chart-convert.mjs readCells). Runs in plain JavaScript on the device; nothing is sent anywhere.
export const CLASSES=Object.freeze(['KNIT','P','YO','TBL','SL','K2TOG','SSK','S2KP','K3TOG','SK2P','BO','OTHER']);

let net=null;
function load(){
 if(net!==null)return net;if(!WEIGHTS){net=false;return net;}
 const f32=b64=>{const bin=atob(b64),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return new Float32Array(u8.buffer);};
 net=Object.fromEntries(Object.entries(WEIGHTS.tensors).map(([k,v])=>[k,f32(v)]));net.shape=WEIGHTS.shape;return net;
}
export const hasModel=()=>Boolean(load());

/** 3x3 convolution with padding 1, then ReLU. in: [ch][n][n] flat. */
function conv(input,cin,n,w,b,cout){
 const out=new Float32Array(cout*n*n);
 for(let o=0;o<cout;o++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=b[o];
  for(let c=0;c<cin;c++)for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=n)continue;for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=n)continue;s+=input[(c*n+yy)*n+xx]*w[((o*cin+c)*3+dy+1)*3+dx+1];}}
  out[(o*n+y)*n+x]=s>0?s:0;}
 return out;
}
function pool(input,ch,n){const m=n/2,out=new Float32Array(ch*m*m);for(let c=0;c<ch;c++)for(let y=0;y<m;y++)for(let x=0;x<m;x++){const i=(c*n+2*y)*n+2*x;out[(c*m+y)*m+x]=Math.max(input[i],input[i+1],input[i+n],input[i+n+1]);}return out;}
function dense(input,w,b,nout,relu){const nin=input.length,out=new Float32Array(nout);for(let o=0;o<nout;o++){let s=b[o];for(let i=0;i<nin;i++)s+=input[i]*w[o*nin+i];out[o]=relu&&s<0?0:s;}return out;}

/** Probabilities for each class (CLASSES order), or null when no model is bundled. */
export function predict(ink){
 const m=load();if(!m)return null;const [c1,c2,h]=m.shape,n=Math.round(Math.sqrt(ink.length));
 let x=conv(Float32Array.from(ink),1,n,m.w1,m.b1,c1);x=pool(x,c1,n);x=conv(x,c1,n/2,m.w2,m.b2,c2);x=pool(x,c2,n/2);
 x=dense(x,m.w3,m.b3,h,true);const z=dense(x,m.w4,m.b4,CLASSES.length,false),top=Math.max(...z),e=z.map(v=>Math.exp(v-top)),sum=e.reduce((a,b)=>a+b,0);
 return e.map(v=>v/sum);
}
