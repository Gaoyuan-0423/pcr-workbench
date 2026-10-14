import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { readInputFile, sheetToRawMatrix } from './core/parse';
import { sniff } from './core/sniff';

it('dbg abs-quant', async () => {
  const out: string[] = [];
  const bytes = readFileSync('/tmp/abs-quant.xlsx');
  const file = new File([bytes.slice().buffer as ArrayBuffer], 'abs-quant.xlsx');
  const parsed = await readInputFile(file);
  if (parsed.kind !== 'workbook') {
    out.push('kind=' + parsed.kind);
  } else {
    out.push('sheets: ' + JSON.stringify(parsed.sheetNames));
    for (const name of parsed.sheetNames) {
      const m = sheetToRawMatrix(parsed.wb, name);
      out.push(`--- sheet [${name}] ${m.length} rows x ${m[0]?.length ?? 0} cols`);
      for (let i = 0; i < Math.min(10, m.length); i++) {
        out.push('row' + i + ': ' + JSON.stringify(m[i].slice(0, 18)));
      }
      const s = sniff(m);
      out.push('sniff: headerRow=' + s.headerRow + ' mapping=' + JSON.stringify(s.mapping));
      const hdr = m[s.headerRow] ?? [];
      out.push('headers: ' + JSON.stringify(hdr.slice(0, 18)));
    }
  }
  writeFileSync('/tmp/abs-dbg.txt', out.join('\n'));
});
