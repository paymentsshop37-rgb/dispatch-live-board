import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Search, X, ChevronRight } from "lucide-react";
import { buildDispatcherPerformance, dispatcherExportRows, dispatcherJobProfit, dispatcherSummary, isMeasuredDispatcherJob, sourceAmount, dispatcherAmount, fullDispatcherJobProfit, jobCredit } from "./dispatcherPerformance.js";
import { intelligenceCsv } from "./intelligenceModel.js";
import { coverageStatusBucket } from "../coverage/serviceAreaAssignment.js";

const money = value => value == null ? "No data" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const percent = value => value == null ? "No data" : `${value.toFixed(1)}%`;
const change = value => value == null ? "No comparison" : `${value > 0 ? "+" : ""}${money(value)}`;
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No date";
const countStatus = (jobs, status) => jobs.filter(job => coverageStatusBucket(job.status) === status).length;
function download(rows, filename) {
  const url = URL.createObjectURL(new Blob([intelligenceCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DispatcherPerformance({ jobs, previousJobs, range, onOpenJobs }) {
  const [mode, setMode] = useState("individual");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("profit");
  const [selectedName, setSelectedName] = useState("");
  const groups = useMemo(() => buildDispatcherPerformance(jobs, previousJobs, { mode }), [jobs, previousJobs, mode]);
  const rows = useMemo(() => groups.filter(row => row.name.includes(search.trim().toUpperCase())).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "jobs") return b.participated - a.participated || a.name.localeCompare(b.name);
    return (b.measured > 0) - (a.measured > 0) || b.profit - a.profit || a.name.localeCompare(b.name);
  }), [groups, search, sort]);
  const total = useMemo(() => dispatcherSummary(rows), [rows]);
  const selected = rows.find(row => row.name === selectedName);
  useEffect(() => setSelectedName(""), [mode, range.from, range.to]);
  return <div className="intel-dispatcher-performance intel-dispatcher-simple">
    <section className="intel-panel">
      <div className="intel-panel-heading"><div><p className="intel-eyebrow">CFO · DISPATCHER PROFITS</p><h2>Who is generating profit?</h2><p className="intel-muted">Each dispatcher's contribution. Open Details for costs, comparisons and jobs.</p></div><button className="intel-button" onClick={() => download(dispatcherExportRows(rows, range), `dispatcher-profits-${mode}-${range.from}-${range.to}.csv`)}><Download size={16} />Export report</button></div>
      <div className="intel-allocation-toggle" role="group" aria-label="Dispatcher attribution view"><button className={mode === "individual" ? "selected" : ""} aria-pressed={mode === "individual"} onClick={() => setMode("individual")}>People</button><button className={mode === "team" ? "selected" : ""} aria-pressed={mode === "team"} onClick={() => setMode("team")}>Teams</button></div>
      <p className="intel-split-explanation">{mode === "individual" ? <>Shared jobs are split equally. <strong>$400 profit shared by 2 people = $200 each.</strong></> : <>Each team receives the full result of its jobs. <strong>Mariana / Michelle appears as one team.</strong></>}</p>
      <div className="intel-city-filters"><label className="intel-search"><Search size={17} /><input aria-label="Search dispatchers" placeholder={mode === "individual" ? "Find a dispatcher" : "Find a team"} value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Sort dispatchers" value={sort} onChange={event => setSort(event.target.value)}><option value="profit">Highest profit first</option><option value="jobs">Most jobs first</option><option value="name">Name A–Z</option></select></div>
    </section>
    <div className="intel-dispatcher-summary"><Summary label="Estimated profit" value={total.measured ? money(total.profit) : "No data"} note="Profit attributed to the visible names" /><Summary label="Jobs covered" value={total.participated} note="Each job counted once in this total" /><Summary label={mode === "individual" ? "Dispatchers" : "Teams"} value={total.dispatchers} note="With activity in the selected period" /></div>
    <section className="intel-panel">
      <div className="intel-panel-heading"><h2>{mode === "individual" ? "Profit by person" : "Profit by team"}</h2><span className="intel-muted">{rows.length} {mode === "individual" ? "names" : "teams"} shown</span></div>
      <div className="intel-table-scroll"><table className="intel-simple-scorecard">
        <thead><tr><th>{mode === "individual" ? "Dispatcher" : "Team"}</th><th>Jobs involved</th><th>{mode === "individual" ? "Their profit" : "Team profit"}</th><th>Margin</th><th><span className="sr-only">Open details</span></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.name}>
          <td><button className="intel-city-link" onClick={() => setSelectedName(row.name)}>{row.name}</button></td>
          <td>{row.participated}{row.sharedParticipations > 0 && <small className="intel-simple-secondary">{row.sharedParticipations} shared</small>}</td>
          <td className={row.profit < 0 && row.measured ? "intel-negative intel-profit-number" : "intel-profit-number"}>{row.measured ? money(row.profit) : "No data"}{row.missing > 0 && <small className="intel-simple-secondary">Some financial amounts are missing</small>}</td>
          <td>{percent(row.margin)}</td><td><button className="intel-button" aria-label={`Details for ${row.name}`} onClick={() => setSelectedName(row.name)}>Details <ChevronRight size={15} /></button></td>
        </tr>)}</tbody>
        <tfoot><tr><th>VISIBLE TOTAL</th><td>{total.participated}<small className="intel-simple-secondary">unique jobs</small></td><td className="intel-profit-number">{total.measured ? money(total.profit) : "No data"}</td><td>{percent(total.margin)}</td><td /></tr></tfoot>
      </table></div>
      {!rows.length && <p className="intel-empty">No dispatchers match this search in either period.</p>}
      <p className="intel-footnote">{mode === "individual" ? "A shared job appears under everyone involved. The company total counts it once, and its profit is divided between those people." : "Each job belongs to one team. Reversed name order does not create a different team."}</p>
      <p className="intel-footnote">Estimated profit = billed amount − parts − technician labor, using completed jobs with all three amounts recorded. It excludes overhead and is not cash collected.{total.missing > 0 && " Jobs with missing financial amounts are excluded; open Details to review them."}</p>
    </section>
    {selected && <DispatcherDetail row={selected} mode={mode} range={range} onClose={() => setSelectedName("")} onInspect={selection => { setSelectedName(""); onOpenJobs(selection); }} />}
  </div>;
}

function Summary({ label, value, note }) { return <section className="intel-kpi"><div><span>{label}</span></div><strong>{value}</strong><small>{note}</small></section>; }

function DispatcherDetail({ row, mode, range, onClose, onInspect }) {
  const [scope, setScope] = useState("all");
  const closeRef = useRef(null);
  useEffect(() => {
    const before = document.activeElement; closeRef.current?.focus();
    const onKey = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); before?.focus?.(); };
  }, [onClose]);
  function trapFocus(event) {
    if (event.key !== "Tab") return;
    const controls = event.currentTarget.querySelectorAll("button,select,summary,a[href]");
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const visible = row.jobs.filter(job => scope === "all"
    || scope === "losses" && fullDispatcherJobProfit(job) !== null && fullDispatcherJobProfit(job) < 0
    || scope === "cancelled" && coverageStatusBucket(job.status) === "cancelled"
    || scope === "missing" && coverageStatusBucket(job.status) === "completed" && !isMeasuredDispatcherJob(job));
  function exportJobs() {
    download([["View", "Dispatcher", "Original assignment", "Share %", "Job credit", "Date", "Invoice", "Customer", "Status", "Full billed USD", "Full parts USD", "Full technician labor USD", "Full job profit USD", "Attributed billed USD", "Attributed parts USD", "Attributed technician labor USD", "Attributed profit USD", "Included in profit"], ...visible.map(job => [mode, row.name, job.dispatcher || "UNASSIGNED", jobCredit(job) * 100, jobCredit(job), job.date, job.invoiceNumber, job.company, job.status, sourceAmount(job.raw.total_bill) ?? "No data", sourceAmount(job.raw.parts) ?? "No data", sourceAmount(job.raw.tech_labor) ?? "No data", fullDispatcherJobProfit(job) ?? "No data", dispatcherAmount(job, "total_bill") ?? "No data", dispatcherAmount(job, "parts") ?? "No data", dispatcherAmount(job, "tech_labor") ?? "No data", dispatcherJobProfit(job) ?? "No data", isMeasuredDispatcherJob(job) ? "Yes" : "No"])], `dispatcher-jobs-${mode}-${range.from}-${range.to}.csv`);
  }
  return <div className="intel-modal" onClick={onClose}><section className="intel-detail intel-person-detail" role="dialog" aria-modal="true" aria-labelledby="dispatcher-detail-title" onClick={event => event.stopPropagation()} onKeyDown={trapFocus}>
    <header><div><p className="intel-eyebrow">{mode === "individual" ? "INDIVIDUAL CONTRIBUTION" : "TEAM RESULTS"}</p><h2 id="dispatcher-detail-title">{row.name}</h2><p className="intel-muted">{range.from} — {range.to}</p></div><button ref={closeRef} className="intel-button" aria-label="Close dispatcher details" onClick={onClose}><X size={19} /></button></header>
    <div className="intel-person-totals"><Summary label={mode === "individual" ? "Their estimated profit" : "Team estimated profit"} value={row.measured ? money(row.profit) : "No data"} note="After parts and technician labor" /><Summary label="Profit margin" value={percent(row.margin)} note="Based on recorded complete amounts" /></div>
    <h3>Work and costs</h3>
    <dl className="intel-person-facts">{[["Jobs involved", row.participated], ["Shared jobs", row.sharedParticipations], ["Completed jobs involved", countStatus(row.jobs, "completed")], ["Cancelled jobs involved", countStatus(row.jobs, "cancelled")], ["Billed share", row.measured ? money(row.billed) : "No data"], ["Parts share", row.measured ? money(row.parts) : "No data"], ["Technician labor share", row.measured ? money(row.labor) : "No data"], ["Average profit per completed participation", money(row.profitPerParticipation)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="intel-footnote">{row.measuredParticipations} of {countStatus(row.jobs, "completed")} completed jobs have all financial amounts recorded.</p>
    <h3>Compared with the previous period</h3>
    <div className="intel-table-scroll"><table className="intel-person-comparison"><thead><tr><th>Measure</th><th>Current</th><th>Previous</th><th>Change</th></tr></thead><tbody>
      <tr><td>Jobs involved</td><td>{row.participated}</td><td>{row.previous.participated}</td><td>{row.participated - row.previous.participated > 0 ? "+" : ""}{row.participated - row.previous.participated}</td></tr>
      <tr><td>Estimated profit</td><td>{row.measured ? money(row.profit) : "No data"}</td><td>{row.previous.measured ? money(row.previous.profit) : "No data"}</td><td>{change(row.profitChange)}</td></tr>
      <tr><td>Margin</td><td>{percent(row.margin)}</td><td>{percent(row.previous.margin)}</td><td>{row.marginChange == null ? "No comparison" : `${row.marginChange > 0 ? "+" : ""}${row.marginChange.toFixed(1)} pp`}</td></tr>
    </tbody></table></div>
    <h3>Jobs behind this result</h3>
    <div className="intel-city-filters"><select aria-label="Dispatcher job scope" value={scope} onChange={event => setScope(event.target.value)}><option value="all">All jobs involved</option><option value="losses">Loss-making jobs</option><option value="cancelled">Cancelled jobs</option><option value="missing">Missing financial amounts</option></select><button className="intel-button" onClick={exportJobs}><Download size={15} />Export jobs</button></div>
    <div className="intel-person-jobs">{visible.map(job => <article key={job.id}>
      <div><strong>{job.invoiceNumber || job.referenceNumber || job.jobNumber}</strong><small>{dateLabel(job.date)} · {job.company || "Customer not recorded"} · {job.status || "No status"}</small></div>
      <div className="intel-person-job-values"><span>Full job profit <b>{money(fullDispatcherJobProfit(job))}</b></span><span>{mode === "individual" ? `Their share · ${percent(jobCredit(job) * 100)}` : "Team share · 100%"}<b>{money(dispatcherJobProfit(job))}</b></span></div>
      {mode === "individual" && <p className="intel-footnote">Recorded assignment: {job.dispatcher || "UNASSIGNED"}</p>}
    </article>)}</div>
    {!visible.length && <p className="intel-empty">No jobs match this selection.</p>}
    <button className="intel-button" disabled={!visible.length} onClick={() => onInspect({ title: `${row.name} · Original job records`, jobs: visible })}>Inspect original job records <ChevronRight size={15} /></button>
    <details className="intel-allocation-method"><summary>How shared results are calculated</summary><p>Names separated by /, &amp; or + are counted once each. Individual shares are equal: two names receive half each; three names receive one-third each. Financial shares conserve cents, with rounding remainders assigned in alphabetical name order. Counts and rates used for attribution are weighted by the same split. Participation counts show actual jobs involving the person. Original job records are preserved.</p></details>
  </section></div>;
}
