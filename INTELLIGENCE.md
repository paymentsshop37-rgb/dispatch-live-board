# NTTR Intelligence

Dedicated English analytics application at `/intelligence`, with a fluid full-width layout and larger data labels. It uses the existing Supabase login and one dedicated `cfo` account. Admin and other board accounts cannot enter Intelligence. The Dispatch Board stays at `/dispatch-board`.

## Exclusive CFO access

- `public.intelligence_cfo_account` binds exactly one Auth UUID and app profile. Neither anonymous users nor application administrators can read or change that binding through the Data API.
- `can_access_intelligence()` verifies the immutable binding, current active CFO profile, and completed first-login password change. Role or username alone does not grant access.
- Every Intelligence data page uses `get_intelligence_page()` and repeats the server authorization check. There is no fallback to direct table reads. Datasets and page sizes are explicitly bounded; technician rows exclude contact, tax, document, and other private details.
- The new CFO role is routed to Intelligence and does not receive board, payment editing, or user administration controls. Other users retain their existing board permissions.
- The protected CFO profile cannot be changed by other authenticated profiles. The `admin-users` function also rejects attempts to reset, sync, change or delete the dedicated account using its service credential.
- The CFO must change the random temporary password on first login. Credentials are not stored in source. Owner-level account recovery requires the existing Supabase administrative workflow.
- These controls protect the Intelligence application and its RPCs. They do not remove existing board users' legitimate access to underlying dispatch records.

## Data and behavior

- Reads all pages of jobs, coverage cities, service areas, aliases, and limited technician fields through the protected RPC. The CFO migration and dedicated account are provisioned separately from static site publication. No external AI service is required.
- Reconciles live changes and refreshes every two minutes while the page is visible. This version does not run background analysis when closed.
- Uses exact normalized city AND state. Active configured cities, active service-area primary cities and aliases, and historical job cities through the end date form the city universe. It is not a list of every US city. Radius assignment is intentionally not used to label an exact city as having jobs.
- Counts all registered job statuses, including cancelled and dry runs, as recorded requests. Completion and cancellation counts are shown separately. Jobs with invalid dates are excluded from period totals and counted in data quality.
- Compares inclusive, equally sized adjacent periods. A zero previous baseline displays "Sin base" rather than a fabricated growth percentage.
- Last-recorded and last-completed dates use all loaded history up to the selected end date. Missing history means no record in the loaded database, not proof that a city never had service.
- Local technician counts require approved/active, nondeleted, active profiles with matching city/state. They do not measure availability or coverage by nearby technicians. Failed technician reads show unavailable, not zero.
- Estimated margin only includes completed jobs with all three numeric source values present: total bill minus parts minus technician labor. Zero is a valid explicit amount. Missing amounts are reported, not replaced with zero in margin calculations. Margin excludes overhead and is not collected cash.
- All returned raw job fields receive a presence audit. Optional fields may appropriately be empty; presence does not imply validity.

## Dispatcher profits

The dedicated **Dispatcher profits** tab compares dispatcher assignments across the same date/state scope and equal adjacent periods. It shows billing, parts, technician labor, estimated profit, weighted margin, average profit per measured completed job, completion/cancellation rates, loss-making jobs, distinct customers/cities, financial-data coverage, and prior-period comparisons. Search, review filters, and sorting drive the displayed totals and CSV export. Details allow job-level review and filtered transaction export.

Names are case-insensitive and repeated whitespace is normalized. Shared assignment strings remain one group; they are not split into full individual credits. Missing dispatchers remain visible as UNASSIGNED. Financial figures use the same completed-job/complete-source rules as the CFO overview. Distinct customer/city totals count unique values across visible groups, so they need not equal the sum of per-dispatcher distinct counts. Ranking reflects recorded assignment contribution, not a causal assessment of an employee's work.

## Signals

- No jobs: zero registered jobs in the selected period.
- Decline: at least three prior-period jobs and a decrease of 30% or more.
- High cancellation: at least four current jobs and at least 25% cancelled.
- Negative margin: completed jobs with full financial inputs produce a negative combined margin.
- No local technician: current jobs exist and no eligible profile is registered in that exact city; this does not prove lack of service coverage.

Signals suggest investigation and show their evidence. They do not infer marketing performance, quote conversion, cancellation reasons, response times, or demand that was never recorded. Those require additional source data.

## Validation

`npm test` covers analytics, protected pagination, field labels, and protected-account configuration. `tests/intelligence-security.sql` checks actual database authorization with transactionally rolled-back profile changes: first-password gate, positive bound-CFO access, negative Admin access, mutation denial, pagination limits, dataset allowlist, and technician field privacy. `npm run build` builds the board and intelligence app together. A synthetic browser harness is removed before publication. The owner completes the real first-login password change personally.
