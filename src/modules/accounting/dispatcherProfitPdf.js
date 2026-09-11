import { jsPDF } from 'jspdf';
import { dispatcherStatistics } from './dispatcherProfitReport.js';

const navy = '#0B2038', blue = '#2463A6', muted = '#62758A', green = '#087F67', red = '#BE3D43';
const money = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value);
const percent = value => value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
export function createDispatcherProfitPdf({ jobs = [], generatedBy = 'Administrator', generatedAt = new Date().toISOString(), filterLabel = 'All Time', footer = 'Confidential - NTTR' }) {
  const { people, total } = dispatcherStatistics(jobs);
  const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'letter', compress:true });
  doc.setProperties({ title:'NTTR | Dispatcher Performance', author:generatedBy });
  function text(value, x, y, size=10, color=navy, bold=false, width=700) {
    doc.setFont('helvetica', bold?'bold':'normal'); doc.setFontSize(size); doc.setTextColor(color);
    while (doc.getTextWidth(String(value)) > width && size > 7) { size -= .5; doc.setFontSize(size); }
    doc.text(String(value), x, y, { maxWidth:width });
  }
  function header(title, subtitle) {
    doc.setFillColor(navy); doc.rect(0,0,792,92,'F');
    text('NTTR / ACCOUNTING CENTER',32,25,9,'#8DBDE8',true);
    text(title,32,53,23,'#FFFFFF',true);
    text(subtitle,32,76,10,'#CAD9E8',false,720);
  }
  function metric(label,value,x,y,w=170,color=navy) {
    doc.setFillColor('#EFF4F8'); doc.roundedRect(x,y,w,59,5,5,'F');
    text(label.toUpperCase(),x+12,y+18,8,muted,true,w-24);
    text(value,x+12,y+43,19,color,true,w-24);
  }
  header('Dispatcher performance',filterLabel);
  metric('Total jobs',total.count,32,112);
  metric('Total billed',money(total.billed),218,112);
  metric('Estimated profit',money(total.profit),404,112,170,total.profit<0?red:green);
  metric('Profit margin',percent(total.margin),590,112);
  const ranked=[...people].sort((a,b)=>b.profit-a.profit || a.name.localeCompare(b.name));
  const scale=Math.max(1,...people.map(p=>Math.abs(p.profit)));
  if (!people.length) text('No jobs found for the selected period.',32,222,15,muted);
  ranked.forEach((person,i)=> {
    if (i>0 && i%7===0) { doc.addPage(); header('Profit comparison',filterLabel); }
    const y=(i<7?215:132)+(i%7)*45;
    if(i%7===0) text('ESTIMATED PROFIT BY DISPATCHER',32,y-18,9,muted,true);
    text(person.name,32,y+4,11,navy,true,180);
    text(`${person.count} jobs`,32,y+19,8,muted);
    // Signed bars share a zero baseline and the same absolute scale.
    doc.setDrawColor('#CEDAE5'); doc.line(452,y-8,452,y+22);
    const width=Math.abs(person.profit)/scale*190;
    doc.setFillColor(person.profit<0?red:blue);
    if(width) doc.rect(person.profit<0?452-width:452,y-5,width,16,'F');
    text(money(person.profit),660,y+7,11,person.profit<0?red:green,true,100);
  });
  for(let i=0;i<people.length;i++) {
    if(i%2===0) {doc.addPage();header('Dispatcher profiles',filterLabel);}
    const p=people[i], y=112+(i%2)*214;
    doc.setDrawColor('#D5E0E9');doc.setFillColor('#FFFFFF');doc.roundedRect(32,y,728,198,7,7,'FD');
    text(p.name,48,y+29,20,navy,true,520);
    text(`${p.count} JOBS`,648,y+28,11,blue,true,95);
    const cards=[['Billed',money(p.billed)],['Expenses',money(p.expenses)],['Estimated profit',money(p.profit)],['Margin',percent(p.margin)]];
    cards.forEach(([label,value],j)=>metric(label,value,48+j*176,y+44,166,j===2?(p.profit<0?red:green):navy));
    text(`Parts: ${money(p.parts)}`,48,y+127,10,muted);
    text(`Tech labor: ${money(p.labor)}`,280,y+127,10,muted);
    text(`Average billed / job: ${money(p.averageBill)}`,48,y+151,11);
    text(`Average profit / job: ${money(p.averageProfit)}`,400,y+151,11);
    text(`Share of jobs: ${percent(total.count?p.count/total.count:0)}`,48,y+178,10,blue,true);
    text(`Share of billed: ${percent(total.billed?p.billed/total.billed:null)}`,400,y+178,10,blue,true);
  }
  const pages=doc.getNumberOfPages();
  for(let p=1;p<=pages;p++) {
    doc.setPage(p);doc.setDrawColor('#D5E0E9');doc.line(32,558,760,558);
    text('Estimated profit = billed - parts - tech labor. Excludes company overhead. Margin = profit / billed.',32,573,8,muted);
    text(`${footer || 'Confidential - NTTR'} | ${generatedBy} | ${new Date(generatedAt).toISOString().slice(0,10)}`,32,591,8,muted,false,620);
    text(`${p} / ${pages}`,719,591,8,muted);
  }
  return doc.output('blob');
}
