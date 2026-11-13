# NTTR Intelligence

Dedicated analytics application at `/intelligence`. Administrators can open it from the desktop sidebar or mobile More menu. It uses the existing Supabase login and row-level security. The direct URL requires login and a verified administrator profile. The Dispatch Board stays at `/dispatch-board`.

## Data and behavior

- Reads all pages of jobs, coverage cities, service areas, aliases, and limited technician fields through the existing authenticated client. No migrations, new database writes, or external AI service are required.
- Reconciles live changes and refreshes every two minutes while the page is visible. This version does not run background analysis when closed.
- Uses exact normalized city AND state. Active configured cities, active service-area primary cities and aliases, and historical job cities through the end date form the city universe. It is not a list of every US city. Radius assignment is intentionally not used to label an exact city as having jobs.
- Counts all registered job statuses, including cancelled and dry runs, as recorded requests. Completion and cancellation counts are shown separately. Jobs with invalid dates are excluded from period totals and counted in data quality.
- Compares inclusive, equally sized adjacent periods. A zero previous baseline displays "Sin base" rather than a fabricated growth percentage.
- Last-recorded and last-completed dates use all loaded history up to the selected end date. Missing history means no record in the loaded database, not proof that a city never had service.
- Local technician counts require approved/active, nondeleted, active profiles with matching city/state. They do not measure availability or coverage by nearby technicians. Failed technician reads show unavailable, not zero.
- Estimated margin only includes completed jobs with all three numeric source values present: total bill minus parts minus technician labor. Zero is a valid explicit amount. Missing amounts are reported, not replaced with zero in margin calculations. Margin excludes overhead and is not collected cash.
- All returned raw job fields receive a presence audit. Optional fields may appropriately be empty; presence does not imply validity.

## Signals

- No jobs: zero registered jobs in the selected period.
- Decline: at least three prior-period jobs and a decrease of 30% or more.
- High cancellation: at least four current jobs and at least 25% cancelled.
- Negative margin: completed jobs with full financial inputs produce a negative combined margin.
- No local technician: current jobs exist and no eligible profile is registered in that exact city; this does not prove lack of service coverage.

Signals suggest investigation and show their evidence. They do not infer marketing performance, quote conversion, cancellation reasons, response times, or demand that was never recorded. Those require additional source data.

## Validation

`npm test` includes boundary dates, equal-period comparisons, exact city/state grouping, historical recency, absent financial sources, cancellation counts, technician failures, inactive configuration, customer retention, state filtering, and CSV formula escaping. `npm run build` builds the board and intelligence app together. A local synthetic-data browser harness was used to inspect navigation and city drilldown and is removed before publication. Authenticated production data access must be verified in the owner's normal session.
