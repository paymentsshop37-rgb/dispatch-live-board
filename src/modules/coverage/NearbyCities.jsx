import React, { useState } from "react";
import { Trash2 } from "lucide-react";

export default function NearbyCities({ aliases, isAdmin, busy, onRemove, loading = false, incomplete = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase().replace(/\s+/g, " ");
  const matches = aliases.filter(alias => `${alias.city}, ${alias.state}`.toLowerCase().includes(query)).sort((a, b) => a.city.localeCompare(b.city) || a.state.localeCompare(b.state));
  return <div className="mt-4"><div className="flex items-center justify-between gap-2"><strong>Nearby Cities ({aliases.length}{loading || incomplete ? "+" : ""}){loading ? " · Loading…" : incomplete ? " · Incomplete" : ""}</strong><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 rounded-xl bg-slate-100 px-3 font-bold">{open ? "Hide Cities" : "View Cities"}</button></div>
    {open && <><input aria-label="Search nearby cities" placeholder="Search city or state" value={search} onChange={event => setSearch(event.target.value)} className="my-2 min-h-11 w-full rounded-xl border px-3" /><div className="max-h-64 overflow-y-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-white"><tr><th className="p-2">City</th><th>State</th>{isAdmin && <th><span className="sr-only">Actions</span></th>}</tr></thead><tbody>{matches.map(alias => <tr key={alias.id} className="border-t"><td className="p-2">{alias.city}</td><td>{alias.state}</td>{isAdmin && <td><button type="button" disabled={busy || alias.assignment_type === "primary"} onClick={() => onRemove(alias.id)} aria-label={`Remove ${alias.city}, ${alias.state}`} className="min-h-11 px-3 text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></td>}</tr>)}</tbody></table>{!matches.length && <p className="p-3 text-sm text-slate-500">No cities found.</p>}</div></>}
  </div>;
}
