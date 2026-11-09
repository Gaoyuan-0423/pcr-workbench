import { describe, expect, it } from 'vitest';
import { extractRows } from './analysis';
import { readInputFile, sheetToRawMatrix } from './parse';
import { sniff } from './sniff';

/** Read a text export through the production path (readInputFile → sniff → extractRows). */
async function rowsFrom(name: string, text: string) {
  const input = await readInputFile(new File([text], name));
  if (input.kind !== 'workbook') throw new Error('expected workbook');
  const matrix = sheetToRawMatrix(input.wb, input.sheetNames[0]);
  const { headerRow, mapping } = sniff(matrix);
  return { matrix, rows: extractRows(matrix.slice(headerRow + 1), mapping) };
}

describe('text tables are read verbatim (no locale type guessing)', () => {
  it('comma CSV: quoted decimal comma and date-like sample names keep their values', async () => {
    const { rows } = await rowsFrom('plate.csv',
      'Well,Sample Name,Target Name,Cq\nA1,1/10,GAPDH,"18,5"\nA2,2-3,GAPDH,18.25\nA3,S1,ACTB,Undetermined\n');
    expect(rows.map((r) => r.sample)).toEqual(['1/10', '2-3', 'S1']);
    expect(rows[0].cq).toBe(18.5);
    expect(rows[1].cq).toBe(18.25);
    expect(rows[2].cq).toBeNaN();
  });
  it('semicolon CSV with decimal commas: 23,45 is 23.45, not 2345', async () => {
    const { rows } = await rowsFrom('plate.csv',
      'Well;Sample Name;Target Name;Cq\nA1;1/10;GAPDH;23,45\nA2;S2;GAPDH;24,10\nA3;S3;ACTB;19,875\n');
    expect(rows.map((r) => r.cq)).toEqual([23.45, 24.1, 19.875]);
    expect(rows[0].sample).toBe('1/10');
  });
  it('dilution names survive to the standard-curve quantity column', async () => {
    const { rows } = await rowsFrom('curve.csv',
      'Well,Sample Name,Target Name,Task,Cq,Quantity\nA1,1/10,GAPDH,Standard,20.1,"1,5"\nA2,1/100,GAPDH,Standard,23.4,"0,15"\n');
    expect(rows.map((r) => r.sample)).toEqual(['1/10', '1/100']);
    expect(rows.map((r) => r.quantity)).toEqual([1.5, 0.15]);
  });
  it('tab TXT: cells stay as typed (leading zeros, scientific notation)', async () => {
    const { matrix } = await rowsFrom('plate.txt',
      'Well\tSample Name\tTarget Name\tCq\nA1\t0042\tGAPDH\t23,45\nA2\t1.00E+05\tGAPDH\t24.10\n');
    expect(matrix[1]).toEqual(['A1', '0042', 'GAPDH', '23,45']);
    expect(matrix[2]).toEqual(['A2', '1.00E+05', 'GAPDH', '24.10']);
  });
});
