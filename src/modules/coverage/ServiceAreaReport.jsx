import React, { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Printer, X } from 'lucide-react';
import { buildServiceAreaReport, reportStatuses } from './serviceAreaReportData.js';

export default function ServiceAreaReport({ rows, unassignedJobs, periodLabel, scopeLabel, onClose }) {
  const [showJobs,setShowJobs]=useState(true);
  const [page,setPage]=useState(0);
  const [error,setError]=useState('');
  const closeRef=useRef(null);
  const dialogRef=useRef(null);
  const report=useMemo(()=>buildServiceAreaReport(rows,unassignedJobs,{periodLabel,scopeLabel}),[rows,unassignedJobs,periodLabel,scopeLabel]);
  useEffect(()=>{
    const previous=document.activeElement;
    closeRef.current?.focus();
    const key=event=>{
      if(event.key==='Escape')onClose();
      if(event.key==='Tab'){
        const controls=[...dialogRef.current.querySelectorAll('button:not(:disabled),input')];
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);previous?.focus?.();};
  },[onClose]);
  function print() {
    const popup=window.open('','_blank');
    if(!popup){setError('Allow pop-ups to print or save this report as PDF.');return;}
    // React escapes all job and location text before writing the print document.
    const body=renderToStaticMarkup(<ReportBody report={report} showJobs={showJobs} printing />);
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>NTTR Service Area Demand Report</title><style>'+reportCss+'</style></head><body>'+body+'</body></html>');
    popup.document.close(); popup.focus();
    popup.setTimeout(()=>popup.print(),250);
  }
  return <div className="fixed inset-0 z-[180] overflow-y-auto bg-slate-950/80 p-2 md:p-6" role="dialog" aria-modal="true" aria-labelledby="service-area-report-title" ref={dialogRef}>
    <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white p-4">
        <div><h2 id="service-area-report-title" className="text-lg font-black">Service Area Demand Report</h2><p className="text-xs text-slate-500">Review the report before printing or saving as PDF.</p></div>
        <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showJobs} onChange={e=>setShowJobs(e.target.checked)} />Include job details</label><button type="button" onClick={print} className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 font-bold text-white"><Printer size={18}/>Print / Save PDF</button><button ref={closeRef} type="button" onClick={onClose} aria-label="Close report" className="min-h-11 rounded-xl bg-slate-100 px-3"><X/></button></div>
      </header>
      {error && <p role="alert" className="p-4 text-red-700">{error}</p>}
      <style>{reportCss}</style>
      <ReportBody report={report} showJobs={showJobs} page={page} />
      {showJobs && report.jobs.length>50 && <div className="flex items-center justify-end gap-3 border-t p-4 text-sm"><button disabled={!page} onClick={()=>setPage(page-1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Previous</button><span>Page {page+1} of {Math.ceil(report.jobs.length/50)} · Print includes all {report.jobs.length} jobs</span><button disabled={(page+1)*50>=report.jobs.length} onClick={()=>setPage(page+1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Next</button></div>}
    </div>
  </div>;
}

function ReportBody({report:r,showJobs,printing=false,page=0}) {
  const top=r.areas.find(a=>a.total>0);
  const jobs=printing?r.jobs:r.jobs.slice(page*50,page*50+50);
  return <article className="nttr-area-report">
    <header className="report-heading"><div><div className="eyebrow">NTTR · OPERATIONS INTELLIGENCE</div><h1>Service Area<br/>Demand Report</h1><p>Where work arrives. How each service area performs.</p></div><div className="report-meta"><strong>{r.periodLabel || 'Selected period'}</strong><span>{r.scopeLabel || 'Selected service areas'}</span><span>Prepared {new Date(r.generatedAt).toLocaleString('en-US')}</span></div></header>
    <div className="report-kpis">{[['Total jobs',r.total],['Areas receiving jobs',r.areasWithJobs],['Cities receiving jobs',r.citiesWithJobs],['Completion rate',r.completionRate.toFixed(1)+'%']].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <section className="report-overview"><h2>Executive summary</h2><p>{r.total ? <>{r.assigned} jobs were assigned to service areas and {r.unassigned} were outside coverage or unassigned. {top && <><strong>{top.name}</strong> received the most work in this scope: <strong>{top.total} jobs</strong> ({(100*top.total/r.total).toFixed(1)}% of the report total).</>}</> : 'No jobs were received in the selected period and scope.'}</p><div className="status-strip">{reportStatuses.map(([key,label])=><span key={key}>{label} <b>{r.status[key]}</b></span>)}</div></section>
    <section><div className="section-heading"><h2>01 / Service area performance</h2><span>{r.areas.length} areas in scope</span></div><div className="report-table-scroll"><table><thead><tr><th>Service area</th><th>State</th><th>Jobs</th><th>Share</th><th>Completed</th><th>Cancelled</th><th>Dry runs</th><th>Open / Other</th><th>Last job</th></tr></thead><tbody>{r.areas.map(a=><tr key={a.id}><td><strong>{a.name}</strong></td><td>{a.state}</td><td>{a.total}</td><td>{r.total?(100*a.total/r.total).toFixed(1):'0.0'}%</td><td>{a.completed}</td><td>{a.cancelled}</td><td>{a.dryRuns}</td><td>{a.active+a.pending+a.inProgress+a.other}</td><td>{a.lastJob}</td></tr>)}</tbody></table></div></section>
    <section><div className="section-heading"><h2>02 / Cities generating work</h2><span>Actual job locations</span></div><div className="report-table-scroll"><table><thead><tr><th>City</th><th>State</th><th>Assigned service area</th><th>Jobs</th><th>Completed</th><th>Share</th></tr></thead><tbody>{r.cities.map((c,i)=><tr key={i}><td>{c.city}</td><td>{c.state||'—'}</td><td>{c.area}</td><td>{c.total}</td><td>{c.completed}</td><td>{(100*c.total/r.total).toFixed(1)}%</td></tr>)}</tbody></table>{!r.cities.length&&<p className="empty">No job locations in this scope.</p>}</div></section>
    {showJobs&&<section><div className="section-heading"><h2>03 / Job register</h2><span>{r.total} jobs · newest first</span></div><div className="report-table-scroll"><table><thead><tr><th>Date</th><th>Job / Invoice</th><th>Service area</th><th>City / State</th><th>Customer</th><th>Technician</th><th>Status</th></tr></thead><tbody>{jobs.map((j,i)=><tr key={j.id||i}><td>{j.date||'—'}</td><td>{j.number}</td><td>{j.area}</td><td>{j.city}{j.state?', '+j.state:''}</td><td>{j.company}</td><td>{j.technician}</td><td>{j.status}</td></tr>)}</tbody></table></div></section>}
    <footer className="report-footer"><strong>NTTR · Service Area Operations</strong><p>Counts reflect the jobs and filters selected when this report was opened. Configured city aliases are coverage definitions, not received jobs. Each job is counted once. Shares use the report total, including unassigned jobs when included. Completion rate = completed jobs / total jobs.</p></footer>
  </article>;
}

const reportCss=`
.nttr-area-report{font-family:Arial,Helvetica,sans-serif;color:#17263c;background:#fff;padding:38px;line-height:1.45;font-size:13px}
.nttr-area-report .report-heading{display:flex;justify-content:space-between;gap:24px;padding:0 0 27px;border-bottom:4px solid #1763c4}
.nttr-area-report .eyebrow{font-size:10px;letter-spacing:2px;font-weight:700;color:#1763c4}
.nttr-area-report h1{font-size:34px;line-height:1.1;letter-spacing:-1px;margin:12px 0;font-weight:800;color:#10213b}
.nttr-area-report p{margin:8px 0;color:#526277}.nttr-area-report .report-meta{display:grid;align-content:end;gap:5px;text-align:right;max-width:35%;font-size:11px}
.nttr-area-report .report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:25px 0}
.nttr-area-report .report-kpis>div{border:1px solid #d9e3ef;border-top:3px solid #1763c4;padding:15px;background:#f7faff}
.nttr-area-report .report-kpis span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#526277}
.nttr-area-report .report-kpis strong{display:block;font-size:29px;margin-top:6px;color:#10213b}
.nttr-area-report h2{font-size:15px;color:#10213b;margin:0;font-weight:700}.nttr-area-report .report-overview{background:#f1f5fa;padding:18px;border-left:3px solid #1763c4}
.nttr-area-report .status-strip{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:14px;font-size:11px}.nttr-area-report .status-strip b{margin-left:4px;color:#1763c4}
.nttr-area-report .section-heading{display:flex;justify-content:space-between;gap:15px;align-items:center;margin:30px 0 12px}.nttr-area-report .section-heading>span{font-size:10px;color:#526277}
.nttr-area-report .report-table-scroll{overflow:auto;max-height:520px}.nttr-area-report table{width:100%;border-collapse:collapse;font-size:11px}
.nttr-area-report th{background:#10213b;color:#fff;text-align:left;padding:10px 8px;font-weight:600}.nttr-area-report td{padding:9px 8px;border-bottom:1px solid #e1e8f0;vertical-align:top;overflow-wrap:anywhere}
.nttr-area-report tr:nth-child(even) td{background:#f5f8fc}.nttr-area-report .report-footer{margin-top:28px;padding-top:14px;border-top:1px solid #bccbdd;font-size:10px}.nttr-area-report .empty{padding:15px}
@media(max-width:650px){.nttr-area-report{padding:18px}.nttr-area-report .report-heading{display:block}.nttr-area-report .report-meta{max-width:none;text-align:left;margin-top:15px}.nttr-area-report .report-kpis{grid-template-columns:repeat(2,1fr)}.nttr-area-report table{min-width:650px}}
@media print{@page{size:A4 landscape;margin:12mm}body{margin:0}.nttr-area-report{padding:0;font-size:10px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.nttr-area-report h1{font-size:28px}.nttr-area-report .report-table-scroll{overflow:visible;max-height:none}.nttr-area-report table{min-width:0;font-size:9px}.nttr-area-report th,.nttr-area-report td{padding:6px}.nttr-area-report thead{display:table-header-group}.nttr-area-report tr{break-inside:avoid}.nttr-area-report .section-heading{break-after:avoid}.nttr-area-report .report-heading,.nttr-area-report .report-kpis,.nttr-area-report .report-overview{break-inside:avoid}}
`;
