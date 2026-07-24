import React, { useMemo, useState } from "react";
import { buildCitiesWithoutJobs } from "./coverageCityService";

const sortOptions = {
  "City name": (a, b) => a.normalizedCity.localeCompare(b.normalizedCity),
  State: (a, b) => a.state.localeCompare(b.state) || a.normalizedCity.localeCompare(b.normalizedCity),
  "Days since last job": (a, b) => (b.daysSinceLastJob ?? Number.MAX_SAFE_INTEGER) - (a.daysSinceLastJob ?? Number.MAX_SAFE_INTEGER),
  "Active technicians": (a, b) => b.activeTechnicians - a.activeTechnicians || a.normalizedCity.localeCompare(b.normalizedCity),
};

export default function CitiesWithoutJobsPanel({
  coverageCities,
  jobs,
  technicians,
  range,
  rangeLabel,
  isAdmin,
  onClose,
  onOpenTechnicians,
  onPreviousJobs,
  onToggleCity,
}) {
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [includeDryRuns, setIncludeDryRuns] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [coverageFilter, setCoverageFilter] = useState("All");
  const [recencyFilter, setRecencyFilter] = useState("All");
  const [sortBy, setSortBy] = useState("City name");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const result = useMemo(
    () => buildCitiesWithoutJobs({ coverageCities, jobs, technicians, range, includeCancelled, includeDryRuns }),
    [coverageCities, includeCancelled, includeDryRuns, jobs, range, technicians]
  );
  const states = useMemo(() => ["All", ...new Set(result.rows.map((row) => row.state).filter(Boolean))].sort(), [result.rows]);
  const inactiveCities = useMemo(() => coverageCities.filter((city) => city.is_active === false), [coverageCities]);
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return result.rows
      .filter((row) => !needle || `${row.normalizedCity} ${row.state}`.toLowerCase().includes(needle))
      .filter((row) => stateFilter === "All" || row.state === stateFilter)
      .filter((row) => coverageFilter === "All" || (coverageFilter === "Has active technician" ? row.activeTechnicians > 0 : row.activeTechnicians === 0))
      .filter((row) => {
        if (recencyFilter === "Never had a job") return !row.lastJobDate;
        if (recencyFilter === "No jobs in 7 days") return row.daysSinceLastJob === null || row.daysSinceLastJob >= 7;
        if (recencyFilter === "No jobs in 30 days") return row.daysSinceLastJob === null || row.daysSinceLastJob >= 30;
        return true;
      })
      .sort(sortOptions[sortBy]);
  }, [coverageFilter, recencyFilter, result.rows, search, sortBy, stateFilter]);

  function exportCsv() {
    const rows = [["City", "State", "Jobs", "Active Techs", "Last Job", "Days Since Last Job", "Coverage Status", "Suggested Action"], ...visibleRows.map((row) => [
      row.normalizedCity, row.state, 0, row.activeTechnicians, row.lastJobDate || "Never", row.daysSinceLastJob ?? "Never", row.coverageStatus, row.suggestedAction,
    ])];
    downloadBlob(rows.map((row) => row.map(csvValue).join(",")).join("\n"), "cities-without-jobs.csv", "text/csv;charset=utf-8");
  }

  function exportPdf() {
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(`<html><head><title>Cities Without Jobs</title><style>body{font-family:Arial;padding:24px;color:#172033}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccd4df;padding:7px;text-align:left}th{background:#edf2f7}h1{margin-bottom:4px}.sub{color:#64748b;margin-bottom:18px}</style></head><body><h1>Cities Without Jobs</h1><div class="sub">${escapeHtml(rangeLabel)} · ${visibleRows.length} cities</div><table><thead><tr><th>City</th><th>State</th><th>Jobs</th><th>Active Techs</th><th>Last Job</th><th>Days</th><th>Coverage</th><th>Suggested Action</th></tr></thead><tbody>${visibleRows.map((row) => `<tr><td>${escapeHtml(row.normalizedCity)}</td><td>${escapeHtml(row.state)}</td><td>0</td><td>${row.activeTechnicians}</td><td>${escapeHtml(formatDate(row.lastJobDate))}</td><td>${row.daysSinceLastJob ?? "Never"}</td><td>${escapeHtml(row.coverageStatus)}</td><td>${escapeHtml(row.suggestedAction)}</td></tr>`).join("")}</tbody></table><script>window.print()</script></body></html>`);
    popup.document.close();
  }

  const filterControls = (
    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search city or state" className="min-h-11 rounded-xl border border-white/10 bg-[#111f33] px-3 text-white outline-none" />
      <FilterSelect label="State" value={stateFilter} onChange={setStateFilter} options={states} />
      <FilterSelect label="Coverage" value={coverageFilter} onChange={setCoverageFilter} options={["All", "Has active technician", "No technician"]} />
      <FilterSelect label="Recency" value={recencyFilter} onChange={setRecencyFilter} options={["All", "Never had a job", "No jobs in 7 days", "No jobs in 30 days"]} />
      <FilterSelect label="Sort" value={sortBy} onChange={setSortBy} options={Object.keys(sortOptions)} />
      <div className="grid grid-cols-2 gap-2"><Toggle label="Cancelled" checked={includeCancelled} onChange={setIncludeCancelled} /><Toggle label="Dry Runs" checked={includeDryRuns} onChange={setIncludeDryRuns} /></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 p-0 md:p-4" onClick={onClose}>
      <section className="flex h-full w-full flex-col overflow-hidden bg-[#081524] text-white md:mx-auto md:max-h-[95vh] md:max-w-[1500px] md:rounded-3xl md:border md:border-white/10" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-4 md:p-5">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">{rangeLabel}</p><h2 className="mt-1 text-2xl font-black">Cities Without Jobs</h2><p className="mt-1 text-sm text-slate-400">Active NTTR coverage cities with zero qualifying jobs.</p></div>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold">Close</button>
        </header>
        <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4">
          <Summary label="Coverage Cities" value={result.summary.total} />
          <Summary label="Cities With Jobs" value={result.summary.withJobs} />
          <Summary label="Cities Without Jobs" value={result.summary.withoutJobs} danger />
          <Summary label="Coverage Percentage" value={`${result.summary.coveragePercentage}%`} />
        </div>
        <div className="hidden px-4 pb-4 lg:block">{filterControls}</div>
        <div className="flex gap-2 px-4 pb-3 lg:hidden"><button type="button" onClick={() => setMobileFiltersOpen(true)} className="min-h-11 flex-1 rounded-xl bg-blue-600 px-3 font-bold">Filters & Sort</button><button type="button" onClick={exportCsv} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold">CSV</button><button type="button" onClick={exportPdf} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold">PDF</button></div>
        <div className="hidden flex-wrap gap-2 px-4 pb-3 lg:flex"><button type="button" onClick={onOpenTechnicians} className="min-h-11 rounded-xl bg-blue-600 px-4 font-bold">Open Technician Directory</button><button type="button" onClick={exportCsv} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold">Export CSV</button><button type="button" onClick={exportPdf} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold">Export PDF</button></div>
        <div className="flex-1 overflow-y-auto px-4 pb-5">
          <div className="grid gap-3 lg:hidden">{visibleRows.map((row) => <CityCard key={row.id || `${row.normalizedCity}-${row.state}`} row={row} onOpenTechnicians={onOpenTechnicians} onPreviousJobs={onPreviousJobs} />)}</div>
          <div className="hidden overflow-auto rounded-2xl border border-white/10 lg:block"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="sticky top-0 bg-[#0e2035] text-xs uppercase text-slate-300"><tr><Th>City</Th><Th>State</Th><Th>Jobs</Th><Th>Active Techs</Th><Th>Last Job</Th><Th>Days</Th><Th>Coverage</Th><Th>Suggested Action</Th><Th>Actions</Th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id || `${row.normalizedCity}-${row.state}`} className="border-t border-white/10 odd:bg-white/[0.025]"><Td>{row.normalizedCity}</Td><Td>{row.state}</Td><Td>0</Td><Td>{row.activeTechnicians}</Td><Td>{formatDate(row.lastJobDate)}</Td><Td>{row.daysSinceLastJob ?? "Never"}</Td><Td>{row.coverageStatus}</Td><Td>{row.suggestedAction}</Td><Td><div className="flex flex-wrap gap-1"><SmallButton onClick={() => onOpenTechnicians(row)}>View Technicians</SmallButton><SmallButton onClick={() => onPreviousJobs(row)}>Previous Jobs</SmallButton>{isAdmin && <SmallButton danger onClick={() => onToggleCity(row, false)}>Deactivate</SmallButton>}</div></Td></tr>)}</tbody></table></div>
          {!visibleRows.length && <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center font-bold text-slate-400">No cities match the current filters.</div>}
          {isAdmin && inactiveCities.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
              <h3 className="font-black text-amber-100">Inactive Coverage Cities</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {inactiveCities.map((city) => (
                  <button key={city.id} type="button" onClick={() => onToggleCity(city, true)} className="min-h-11 rounded-xl bg-amber-400 px-3 text-sm font-black text-slate-950">
                    Activate {city.city}, {city.state}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      {mobileFiltersOpen && <div className="fixed inset-0 z-[110] flex items-end bg-black/60 lg:hidden" onClick={() => setMobileFiltersOpen(false)}><div className="w-full rounded-t-3xl bg-[#0e2035] p-5" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">Filters & Sort</h3><button type="button" onClick={() => setMobileFiltersOpen(false)} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold">Done</button></div>{filterControls}</div></div>}
    </div>
  );
}

function CityCard({ row, onOpenTechnicians, onPreviousJobs }) { return <article className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex justify-between gap-3"><div><h3 className="text-lg font-black">{row.normalizedCity}, {row.state}</h3><p className="mt-1 text-sm text-slate-400">{row.coverageStatus}</p></div><span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-black text-red-200">0 jobs</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Data label="Active Techs" value={row.activeTechnicians} /><Data label="Last Job" value={formatDate(row.lastJobDate)} /><Data label="Days Since" value={row.daysSinceLastJob ?? "Never"} /><Data label="Action" value={row.suggestedAction} /></div><div className="mt-4 grid grid-cols-2 gap-2"><SmallButton onClick={() => onOpenTechnicians(row)}>View Technicians</SmallButton><SmallButton onClick={() => onPreviousJobs(row)}>Previous Jobs</SmallButton></div></article>; }
function Summary({ label, value, danger }) { return <div className={`rounded-2xl border p-3 ${danger ? "border-red-400/30 bg-red-500/10" : "border-white/10 bg-white/5"}`}><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>; }
function FilterSelect({ label, value, onChange, options }) { return <label className="grid gap-1 text-[10px] font-black uppercase text-slate-400">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-[#111f33] px-3 text-sm font-bold text-white">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function Toggle({ label, checked, onChange }) { return <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#111f33] px-2 text-xs font-bold"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
function Data({ label, value }) { return <div><p className="text-[10px] font-black uppercase text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }
function SmallButton({ children, onClick, danger }) { return <button type="button" onClick={onClick} className={`min-h-10 rounded-lg px-2 text-xs font-bold ${danger ? "bg-red-500/15 text-red-200" : "bg-blue-500/15 text-blue-200"}`}>{children}</button>; }
function Th({ children }) { return <th className="px-3 py-3">{children}</th>; }
function Td({ children }) { return <td className="px-3 py-3 align-middle">{children}</td>; }
function formatDate(value) { if (!value) return "Never"; return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }); }
function csvValue(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function downloadBlob(content, filename, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }
