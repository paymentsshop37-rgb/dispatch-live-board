# Reporting summaries

Every report integration supplies its final filtered rows to the shared calculator. The calculator does not fetch database records. Existing estimated profit remains Total Bill minus Parts minus Tech Labor; rounding happens only for display. Zero bill yields a zero percentage margin.

## Shared implementation

- `src/modules/reporting/reportSummary.js`: financial totals, statuses with percentages, dispatcher/technician/company groups, currency formatting, transaction scope, and group-to-job flattening.
- `src/modules/reporting/summaryRenderers.js`: HTML, CSV, and typed Excel summary sections.
- `src/modules/reporting/summaryPdf.js`: paginated PDF appendix.
- `src/modules/reporting/ReportSummary.jsx`: onscreen summary using the same calculations.

Company summaries show the top ten plus Other companies, preserving all totals. Operational-only reports suppress financial sections. Non-job reports count technicians, parts, operations, or transactions rather than inventing job counts. Unknown and blank statuses remain visible. Excel summary values are numeric with number formats, and detail autofilters exclude the summary.

## Changed report files

- Live job detail/print: `src/DispatchLiveUpdatesPage.jsx`.
- General reports: `src/modules/reporting/excelReport.js`, `pdfReport.js`, `reportData.js`.
- Accounting: `src/modules/accounting/AccountingCenter.jsx`, `AccountingExportCenter.jsx`, `accountingPdf.js`, `accountingWorkbook.js`, `dispatcherProfitPdf.js`, `outstandingInvoiceExports.js`.
- Billing: `src/modules/billing/BillingDashboard.jsx`, `TechnicianPaymentsReport.jsx`.
- Executive: `src/modules/executive/ExecutiveDashboard.jsx`, `StatusJobsReport.jsx`, `InternalControlQueue.jsx`, `internalControlQueuePdf.js`.
- Coverage: `src/modules/coverage/GeographicCoverageAnalysis.jsx`, `ServiceAreaReport.jsx`, `serviceAreaReportData.js`, `CitiesWithoutJobsPanel.jsx`.
- Other reports: `src/modules/technicians/TechnicianCenter.jsx`, `src/modules/parts/PartsIntelligence.jsx`, `src/modules/flat-rate/FlatRateGuide.jsx`.
- Tests: `tests/reportSummary.test.js`, `tests/internalControlQueuePdf.test.js`.

Accounting workbook worksheets summarize their own detail subsets, including pending payments and open invoices. Payment-history exports restrict transactions to the selected jobs; their date scope follows the selected jobs' dates. The onscreen paginated transaction-history summary describes the currently displayed transaction rows. Aggregated geographic/dispatcher reports summarize underlying jobs, not group counts or a screen page. General financial Excel details now include all filtered jobs instead of stopping at twenty.

## UI verification

1. Open Live Jobs, choose All Time, then Export Reports. Open PDF and Excel; scroll to SUMMARY & STATISTICS. Compare Total Jobs and financial totals with the exported detail records. Check individual Excel sheets, whose subsets can differ.
2. In Accounting, open Customer Invoices or a KPI detail report. Set a custom date range, dispatcher, technician, company, invoice status, or payment status. Compare the bottom summary with those rows, then export through the report controls or Accounting Exports using the same filters.
3. In Executive Dashboard, open Completed, Dry Run, or Cancelled jobs. Change dispatcher and technician. Export Excel and Print/PDF; summaries should match the filtered detail rows.
4. In Billing, verify Invoice List and Pending Technician Payments exports. In Coverage, verify the Service Area report, area CSV/print, and coverage activity report. Operational reports must not expose financial totals.
5. Check Technician directory print, Parts catalog CSV, Flat Rate estimate print, and the single-job detail Print action for an appropriate record summary.
6. Repeat with an empty filter and a one-job filter. Empty reports show zero totals safely; a zero-bill job has a zero margin. Currency displays exactly two decimal places. Cancelled and missing-value records remain represented.

## Validation performed

- All 104 automated tests pass, including All Time, custom dates, dispatcher, technician, empty, single, zero-bill, cancelled, null values, permissions, unknown statuses, and per-worksheet scope.
- Production build passes. Existing bundle-size and mixed-import warnings remain nonblocking.
- Browser test of the actual StatusJobsReport component passes filter changes and print/PDF consistency with synthetic data.
- Representative accounting, executive, dispatcher and empty PDFs, and Excel summary regions were generated and visually inspected. No production job records were modified for testing.
