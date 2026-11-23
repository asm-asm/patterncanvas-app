import {stitchPart} from './stitches.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function repeatCandidate(chart){
 const {cells,symbols=[],columns,rows}=chart;
 const repeatsWidth=w=>{for(let r=0;r<rows;r++)for(let x=0;x<columns;x++)if(cells[r][x]!==cells[r][x%w]||((symbols[r]?.[x]??null)!==(symbols[r]?.[x%w]??null)))return false;return true;};
 const repeatsHeight=h=>{for(let r=0;r<rows;r++)if(!same(cells[r],cells[r%h])||!same(symbols[r]??[],symbols[r%h]??[]))return false;return true;};
 const width=Array.from({length:columns-1},(_,i)=>i+1).find(w=>columns%w===0&&repeatsWidth(w));
 const height=Array.from({length:rows-1},(_,i)=>i+1).find(h=>rows%h===0&&repeatsHeight(h));
 return {width:width??null,height:height??null};
}
export function validateImportedChart(chart){const issues=[],counts=chart.cells.map(row=>row.filter(v=>v!==null).length),unknown=[];for(let r=0;r<chart.rows;r++)for(let c=0;c<chart.columns;c++){const code=chart.symbols?.[r]?.[c];if(code==='UNK')unknown.push({row:r+1,column:c+1});const part=stitchPart(code);if(part?.width>1)for(let i=0;i<part.width;i++)if(stitchPart(chart.symbols[r]?.[c-part.index+i])?.code!==part.code)issues.push({type:'cable',row:r+1,column:c+1,message:`${r+1}段 ${c+1}目の交差記号が途中で切れています。`});}if(unknown.length)issues.push({type:'unknown',count:unknown.length,message:`読み取れなかった記号が${unknown.length}か所あります。`});for(let r=1;r<counts.length;r++)if(counts[r]!==counts[r-1])issues.push({type:'stitch_count',row:r+1,before:counts[r-1],after:counts[r],message:`${r+1}段は前段から${counts[r]-counts[r-1]}目変化します。`});const repeat=repeatCandidate(chart);if(repeat.width)issues.push({type:'repeat',axis:'horizontal',size:repeat.width,message:`横${repeat.width}目の繰り返し候補があります。`});if(repeat.height)issues.push({type:'repeat',axis:'vertical',size:repeat.height,message:`縦${repeat.height}段の繰り返し候補があります。`});return {counts,unknown,repeat,issues};}
