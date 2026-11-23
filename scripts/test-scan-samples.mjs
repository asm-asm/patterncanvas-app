import {readdir} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import sharp from 'sharp';
import {grayscale,detectGridAuto} from '../docs/iphone/app/scan-model.mjs';

const folder=process.argv[2];
if(!folder)throw Error('使い方: node scripts/test-scan-samples.mjs <編み図画像フォルダ>');
const names=(await readdir(resolve(folder))).filter(name=>/\.(jpe?g|png|webp)$/i.test(extname(name))).sort();
if(!names.length)throw Error('対応する画像が見つかりません。');
const results=[];
for(const name of names){
 const {data,info}=await sharp(join(folder,name)).rotate().resize({width:1000,withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const quad=detectGridAuto(grayscale(data,info.width,info.height),info.width,info.height);
 const result={name,width:info.width,height:info.height,detected:Boolean(quad),quad:quad?.map(([x,y])=>[Math.round(x),Math.round(y)])};results.push(result);console.log(JSON.stringify(result));
}
const missing=results.filter(result=>!result.detected);if(missing.length)throw Error(`格子候補を検出できなかった画像: ${missing.map(v=>v.name).join(', ')}`);
console.log(`scan samples: ${results.length}/${results.length} detected`);
