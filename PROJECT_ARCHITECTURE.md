# NTTR Command Center

## Complete Fleet Operations Platform

## Vision

NTTR Command Center is the official master platform for National Truck Trailer Repair operations. The goal is to build a complete fleet operations system for roadside assistance, technician management, customer communication, billing, live dispatching, executive reporting, and future AI-assisted dispatch decisions.

The platform must remain modular, secure, scalable, and compatible with the existing Dispatch Board while new capabilities are added over time.

## Platform Modules

1. Dispatch Center
2. Technician Center
3. Customer Portal
4. Billing & Payments
5. Executive Dashboard
6. Live Technician Map
7. AI Dispatch Engine
8. Administration
9. Reports & Analytics

## User Roles

### Admin

Admins manage the full platform, including technician approval, compliance, invitations, reports, billing, platform settings, and sensitive operational data.

### Dispatcher

Dispatchers manage live jobs, update the Dispatch Board, search approved technicians, assign technicians when assignment fields are available, and monitor operational status.

### Technician

Technicians do not log in and do not use a portal. Dispatchers contact technicians by phone or WhatsApp and manually manage technician availability, assignment status, and job updates inside the Dispatch Center.

### Customer

Customers will request service, track job status, provide job information, communicate with NTTR, and access billing or payment workflows through the Customer Portal.

## Current Completed Features

- Existing Dispatch Board with live job management.
- Supabase-powered job persistence.
- Technician Center module under `src/modules/technicians`.
- Public Technician Registration Portal at `/technician-registration`.
- Technician invitation workflow using `technician_invitations`.
- Technician CRM 360 profile modal.
- Technician compliance scoring.
- Technician document checklist.
- Technician approval workflow.
- Technician status management.
- Technician invitation tracking table.
- Safe Phase 1 Dispatch Board assignment panel.
- Approved technician loading from Technician Center into Dispatch Board.
- City, state, and service filters for assignment panel.
- Safe assignment warning when `jobs.technician_id` does not exist.
- Supabase migration scripts under `supabase/migrations`.

## Supabase Tables

### Existing / Planned Core Tables

- `jobs`
- `change_logs`
- `technicians`
- `technician_invitations`
- `technician_documents`
- `technician_services`
- `technician_coverage`
- `technician_ratings`
- `technician_payments`
- `activity_log`

### Table Responsibilities

`jobs` stores Dispatch Board job records and assignment fields when available.

`change_logs` stores Dispatch Board audit history.

`technicians` stores technician identity, contact information, company information, services, status, compliance fields, performance fields, and availability fields.

`technician_invitations` stores invitation codes, contact info, invite status, open/completion timestamps, and links completed invitations to technicians.

`technician_documents` stores uploaded compliance document records.

`technician_services` stores normalized technician service capabilities when services need to move beyond the `technicians.services` array.

`technician_coverage` stores technician coverage areas by city, state, ZIP code, and radius.

`technician_ratings` stores job-specific technician performance ratings.

`technician_payments` stores technician payment records by job.

`activity_log` stores platform activity for timelines, auditing, and operational history.

## Coding Rules

- Never assume database columns.
- Always inspect the Supabase schema before writing queries, filters, inserts, updates, or ordering logic.
- Always run `npm run build` after code changes.
- Keep modules inside `src/modules`.
- Keep technician-specific code inside `src/modules/technicians`.
- Do not rewrite the Dispatch Board unless explicitly requested.
- Never modify Dispatch Board behavior without preserving existing job creation, editing, filtering, reporting, and live update compatibility.
- Keep changes minimal and isolated when working on integration phases.
- Do not apply Supabase migrations automatically unless explicitly requested.

## Security Rules

- Never expose `.env`.
- Never expose private keys.
- Never expose Supabase service role keys in browser code.
- Never commit secrets, API keys, passwords, or private credentials.
- Use Vite environment variables only for client-safe public values.
- Keep sensitive technician data restricted by role.
- Dispatchers must not see sensitive tax, W9, insurance, or private payment details unless explicitly authorized.

## Development Workflow

- Develop in `enterprise-v1`.
- Run `npm run build` before approval or merge.
- Review Supabase migrations before applying them.
- Test Dispatch Board compatibility after any shared data or Supabase change.
- Merge to `main` only after testing and approval.

## Version Roadmap

### v1.0

Dispatch Board + Technician Center + Registration + Invitations

### v1.5

Dispatcher-controlled assignment workflow

### v2.0

Customer Portal + Billing

### v2.5

Live Map + GPS

### v3.0

AI Dispatch + Executive Reports
