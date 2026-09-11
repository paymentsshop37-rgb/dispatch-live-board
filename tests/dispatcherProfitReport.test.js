import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDispatcherProfitReport } from '../src/modules/accounting/dispatcherProfitReport.js';
import { createAccountingWorkbookBuffer } from '../src/modules/accounting/accountingWorkbook.js';
import ExcelJS from 'exceljs';
const jobs = [
 { dispatcher:' Ana ', date:'2026-09-01', invoiceNumber:'1', totalBill:100, parts:20, techLabor:30 },
 { dispatcher:'ana', date:'2026-09-02', invoiceNumber:'2', totalBill:20, parts:10, techLabor:40 },
 { dispatcher:'', date:'2026-09-03', invoiceNumber:'3', totalBill:50, parts:0, techLabor:10 },
];
test('dispatcher detail reconciles case-normalized groups, losses, unassigned jobs and total', () => {
 const report = buildDispatcherProfitReport(jobs);
 assert.deepEqual(report.summary, [['Ana',2,120,30,70,20],['Unassigned',1,50,0,10,40],['TOTAL',3,170,30,80,60]]);
 assert.equal(report.rows.length,6);
 assert.equal(report.rows[1][8],-30);
 assert.deepEqual(buildDispatcherProfitReport([]).summary,[['TOTAL',0,0,0,0,0]]);
 assert.equal(jobs[0].dispatcher,' Ana ');
});
test('dispatcher Excel exports both summary and detailed jobs with numeric profit', async () => {
 const buffer = await createAccountingWorkbookBuffer({model:{jobs}}, {reportId:'dispatcher-profit',filterLabel:'September 2026'});
 const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
 assert.equal(book.worksheets.length,2);
 assert.equal(book.getWorksheet('Dispatcher Profit Summary').getCell('F9').value,60);
 assert.equal(book.getWorksheet('Dispatcher Job Detail').getCell('I8').value,-30);
 assert.equal(book.getWorksheet('Dispatcher Job Detail').getCell('I12').value,60);
});
