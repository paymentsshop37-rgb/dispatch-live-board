import { coverageStatusBucket } from './serviceAreaAssignment.js';
import { normalizeCoverageCity, normalizeState } from './coverageNormalization.js';

export const reportStatuses = [['completed','Completed'],['cancelled','Cancelled'],['dryRuns','Dry runs'],['active','Active'],['pending','Pending'],['inProgress','In progress'],['other','Other']];
const clean = value => String(value ?? '').trim();
const counts = jobs => jobs.reduce((out,job) => { out[coverageStatusBucket(job.status)]++; return out; },Object.fromEntries(reportStatuses.map(([key])=>[key,0])));

// Aggregate the actual jobs in the selected scope, never the configured aliases.
// Keep the report operational so restricted financial fields cannot enter exports.
export function buildServiceAreaReport(rows, unassignedJobs = [], { periodLabel = '', scopeLabel = '', generatedAt = new Date() } = {}) {
  const seen = new Set();
  const jobs = [];
  const areas = [];
  const add = (records, area) => {
    const added=[];
    for (const record of records || []) {
      if (record.id != null && seen.has(String(record.id))) continue;
      if (record.id != null) seen.add(String(record.id));
      const job = {
        id: clean(record.id), number: clean(record.invoiceNumber || record.reference || record.id) || 'Not recorded',
        date: clean(record.date), area: area?.area_name || 'Outside coverage / Unassigned',
        areaId: area ? String(area.id) : null,
        city: clean(record.city) || 'Not recorded', state: clean(record.state),
        company: clean(record.company) || 'Not recorded',
        technician: clean(record.technician || record.tech) || 'Unassigned',
        status: clean(record.status) || 'Not recorded',
      };
      jobs.push(job); added.push(job);
    }
    return added;
  };
  for (const row of rows) {
    const areaJobs=add(row.jobs,row);
    areas.push({id:String(row.id),name:row.area_name,state:row.state,total:areaJobs.length,...counts(areaJobs),lastJob:areaJobs.map(j=>j.date).filter(Boolean).sort().at(-1)||'—'});
  }
  const outside=add(unassignedJobs,null);
  const cityMap=new Map();
  for(const job of jobs) {
    const key=JSON.stringify([job.areaId,normalizeCoverageCity(job.city),normalizeState(job.state)]);
    if(!cityMap.has(key)) cityMap.set(key,{city:job.city,state:job.state,area:job.area,total:0,completed:0});
    const city=cityMap.get(key); city.total++; if(coverageStatusBucket(job.status)==='completed') city.completed++;
  }
  areas.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  const cities=[...cityMap.values()].sort((a,b)=>b.total-a.total||a.city.localeCompare(b.city));
  jobs.sort((a,b)=>b.date.localeCompare(a.date)||a.number.localeCompare(b.number));
  const status=counts(jobs);
  return {periodLabel,scopeLabel,generatedAt:new Date(generatedAt).toISOString(),areas,cities,jobs,
    total:jobs.length,assigned:jobs.length-outside.length,unassigned:outside.length,
    areasWithJobs:areas.filter(a=>a.total>0).length,
    citiesWithJobs:new Set(jobs.filter(j=>j.city!=='Not recorded').map(j=>JSON.stringify([normalizeCoverageCity(j.city),normalizeState(j.state)]))).size,
    completionRate:jobs.length?100*status.completed/jobs.length:0,status,
  };
}
