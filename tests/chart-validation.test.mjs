import test from 'node:test';import assert from 'node:assert/strict';
import {blank} from '../docs/iphone/app/model.mjs';import {validateImportedChart,repeatCandidate} from '../docs/iphone/app/chart-validation.mjs';
test('validation reports unknown symbols, count changes and repeat candidates',()=>{const p=blank(4,2);p.format='patterncanvas-web-3';p.symbols=[[null,'UNK',null,null],[null,null,null,null]];p.cells[1][3]=null;const v=validateImportedChart(p);assert.equal(v.unknown.length,1);assert.ok(v.issues.some(i=>i.type==='stitch_count'));assert.equal(repeatCandidate(blank(4,2)).width,1);});
