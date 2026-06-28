# NTTR Command Center Database Audit

This audit documents what the current application expects from Supabase. It does not apply migrations, modify tables, or assume columns beyond the app code paths.

## jobs

Purpose: Live Dispatch Board jobs, billing source data, assignment workflow, and executive reporting.

Important columns: `id`, `job_date`, `job_time`, `invoice_number`, `dispatch`, `company`, `tech`, `location`, `status`, `row_flag`, `invoice_status`, `payment_method`, `received`, `updates`, `total_bill`, `parts`, `tech_labor`, `photo_url`.

Known safe-mode dependencies: assignment fields are probed before use; tech payment fields are probed before use.

Missing columns the app checks for: `technician_id`, `assigned_at`, `assigned_by`, `previous_technician`, `reassigned_count`, `tech_payment_status`, `technician_payment_status`, `tech_paid_status`, `tech_payment_method`, `technician_payment_method`, `tech_paid_date`, `technician_paid_date`, `tech_payment_paid_at`, `tech_payment_notes`, `technician_payment_notes`.

RLS considerations: authenticated app users need select/insert/update/delete permissions appropriate to role. Public users should not access this table.

Future cleanup notes: standardize duplicate invoice/reference naming and add assignment/payment fields through reviewed migrations.

## technicians

Purpose: Technician CRM, public registration submissions, compliance, dispatch matching, and technician availability.

Important columns: `id`, `created_at`, `full_name`, `phone`, `email`, `company_name`, `city`, `state`, `zip_code`, `services`, `status`, `notes`, `payment_method`, `agreement_accepted`, `digital_signature`, `rating`, `completed_jobs`, `approved_at`, `approved_by`.

Known safe-mode dependencies: app detects known columns from returned rows and only writes columns it knows exist. `services` is written as a text array.

Missing columns the app checks for: `availability`, `availability_status`, `current_job_id`, `profile_photo_url`, `coverage`, `acceptance_rate`, `average_eta`, `dot_certificate_url`, `bank_zelle_info`, `signed_agreement_url`, `w9_url`, `insurance_url`, `driver_license_url`.

RLS considerations: public registration must be allowed to insert pending technicians if using anonymous access. Dispatchers should only read approved, non-private technician data. Admins need full CRM management permissions.

Future cleanup notes: standardize status values and private document/payment fields.

## technician_invitations

Purpose: Tracks invitation links, opened/completed state, and invitation lifecycle for technician registration.

Important columns: `id`, `invite_code`, `invited_by`, `technician_id`, `technician_name`, `phone`, `email`, `status`, `expires_at`, `opened_at`, `completed_at`, `created_at`, `notes`.

Known safe-mode dependencies: delete flow updates `status = Deleted` and attempts `deleted_at` only if available.

Missing columns the app checks for: `deleted_at`.

RLS considerations: admins need full access; public registration needs read/update for a valid invite code if invite tracking is enabled.

Future cleanup notes: add expiration enforcement and a dedicated deleted timestamp if not present.

## technician_documents

Purpose: Planned normalized document tracking for licenses, insurance, W9, and expiring documents.

Important columns: `id`, `technician_id`, `document_type`, `file_url`, `expiration_date`, `status`, `uploaded_at`.

Known safe-mode dependencies: current UI primarily reads document URLs from `technicians`; normalized document table is not required for current screens.

Missing columns the app checks for: none directly in current UI.

RLS considerations: private documents must be admin-only; dispatchers should not see W9, insurance, tax, or payment records.

Future cleanup notes: migrate document URL fields from `technicians` into this table when ready.

## technician_services

Purpose: Planned normalized services per technician.

Important columns: `id`, `technician_id`, `service_name`.

Known safe-mode dependencies: current app uses `technicians.services` text array.

Missing columns the app checks for: none directly.

RLS considerations: safe for admin/dispatcher read after technician approval. Writes should be admin-only.

Future cleanup notes: decide whether `technicians.services` remains canonical or becomes denormalized cache.

## technician_coverage

Purpose: Planned normalized coverage markets and service radius.

Important columns: `id`, `technician_id`, `city`, `state`, `zip_code`, `service_radius_miles`.

Known safe-mode dependencies: current app uses `technicians.city`, `technicians.state`, `coverage`, and `serviceArea` aliases.

Missing columns the app checks for: none directly.

RLS considerations: dispatcher read is acceptable for approved technicians. Admin writes only.

Future cleanup notes: use for dispatch matching and distance ranking once populated.

## technician_payments

Purpose: Planned normalized technician payments per job.

Important columns: `id`, `technician_id`, `job_id`, `amount`, `payment_method`, `payment_status`, `paid_at`.

Known safe-mode dependencies: current Live Jobs tech payment tracking uses optional fields on `jobs`.

Missing columns the app checks for: none directly.

RLS considerations: admin-only; dispatchers should not see private payment details unless policy changes.

Future cleanup notes: migrate job-level tech payment status to this table for payment history.

## technician_ratings

Purpose: Planned job-level technician performance ratings.

Important columns: `id`, `technician_id`, `job_id`, `rating`, `communication_rating`, `arrival_rating`, `quality_rating`, `professionalism_rating`, `comments`, `created_at`.

Known safe-mode dependencies: current app falls back to aggregate `technicians.rating`.

Missing columns the app checks for: none directly.

RLS considerations: admins can manage; dispatchers can read summary for assignment decisions.

Future cleanup notes: calculate aggregate rating from this table.

## app_users

Purpose: Admin-managed user records for future production user management.

Important columns: `id`, `name`, `username`, `email`, `password`, `temporary_password`, `role`, `status`, `force_password_change`, `notes`, `last_login_at`, `created_at`, `updated_at`.

Known safe-mode dependencies: User Management shows safe mode if table is unavailable. Current login still uses existing access-code users.

Missing columns the app checks for: none dynamically; create/update payloads are aligned to the listed schema.

RLS considerations: admin-only. Never expose service-role keys in browser code.

Future cleanup notes: replace client-side access-code auth with server-backed user authentication.

## activity_log

Purpose: Shared audit trail for jobs, technicians, invitations, user management, login attempts, and system activity.

Important columns: `id`, `entity_type`, `entity_id`, `action`, `description`, `created_by`, `created_at`.

Known safe-mode dependencies: reusable logger attempts optional `metadata`; if missing, it retries without metadata and logs a console warning.

Missing columns the app checks for: `metadata`.

RLS considerations: admin read access for audit page. Inserts should be allowed for authenticated operational actions or handled server-side.

Future cleanup notes: add structured `metadata jsonb`, standardize action names, and consider immutable audit policies.
