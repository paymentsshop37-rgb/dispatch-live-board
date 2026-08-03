import test from "node:test";
import assert from "node:assert/strict";
import {
  groupPaymentsByTechnician,
  isPendingPayment,
  normalizeTechnicianPayment,
  paymentPresetRange,
  summarizeTechnicianPayments,
} from "../src/modules/billing/technicianPaymentData.js";
import { canEditTechPayment, getPermissions, TECH_PAYMENT_EDITOR_ROLES } from "../src/modules/permissions.js";
import { safeTechPaymentError, techPaymentStatusOptions } from "../src/utils/techPaymentStatus.js";

const now = new Date("2026-07-31T12:00:00-06:00");

function payment(overrides = {}) {
  return normalizeTechnicianPayment({
    id: crypto.randomUUID(),
    job_date: "2026-07-25",
    tech: "Avery Tech",
    tech_labor: 250,
    tech_payment_status: "Pending",
    ...overrides,
  }, now);
}

test("pending Tech Labor contributes the exact owed amount", () => {
  const totals = summarizeTechnicianPayments([payment()]);
  assert.equal(totals.count, 1);
  assert.equal(totals.amount, 250);
});

test("only Pending is included; Paid and Cancelled are excluded", () => {
  const rows = [
    { tech_payment_status: "Pending" },
    { tech_payment_status: "Paid" },
    { tech_payment_status: "Cancelled" },
  ].filter(isPendingPayment);
  assert.equal(rows.length, 1);
});

test("zero and blank Tech Labor are counted at zero and flagged", () => {
  const zero = payment({ tech_labor: 0 });
  const blank = payment({ tech_labor: "" });
  const totals = summarizeTechnicianPayments([zero, blank]);
  assert.equal(totals.count, 2);
  assert.equal(totals.amount, 0);
  assert.equal(totals.missing, 2);
});

test("All Pending has no job-date restriction", () => {
  assert.equal(paymentPresetRange("All Pending", {}, now), null);
});

test("a job marked Paid immediately leaves the pending scope and total", () => {
  const raw = { id: crypto.randomUUID(), tech_payment_status: "Pending", tech_labor: 250 };
  assert.equal([raw].filter(isPendingPayment).length, 1);
  raw.tech_payment_status = "Paid";
  assert.equal([raw].filter(isPendingPayment).length, 0);
});

test("bulk and technician-group totals reconcile to the grand total", () => {
  const rows = [
    payment({ tech: "Avery Tech", tech_labor: 250 }),
    payment({ tech: "Avery Tech", tech_labor: 300 }),
    payment({ tech: "Morgan Tech", tech_labor: 125 }),
  ];
  const groups = groupPaymentsByTechnician(rows);
  const grand = summarizeTechnicianPayments(rows);
  assert.equal(grand.amount, 675);
  assert.equal(groups.reduce((sum, group) => sum + group.totalAmount, 0), grand.amount);
  assert.equal(groups.find((group) => group.technician === "Avery Tech").averageAmount, 275);
});

test("all four operational roles receive Tech Payment authority from the shared role rule", () => {
  assert.deepEqual(TECH_PAYMENT_EDITOR_ROLES, ["admin", "supervisor", "dispatcher", "technician_manager"]);
  for (const role of TECH_PAYMENT_EDITOR_ROLES) {
    assert.equal(canEditTechPayment(role), true, `${role} should edit Tech Payment`);
    assert.equal(getPermissions(role).canViewTechPayments, true, `${role} should view Tech Payments`);
    assert.equal(getPermissions(role).canMarkTechPaymentsPaid, true, `${role} should update Tech Payments`);
  }
  for (const role of ["technician", "customer", "readonly", ""]) assert.equal(canEditTechPayment(role), false);
});

test("dropdown values exactly match the production status constraint", () => {
  assert.deepEqual(techPaymentStatusOptions, ["Pending", "Paid", "Cancelled"]);
});

test("technical payment errors map to safe actionable messages", () => {
  assert.equal(safeTechPaymentError({ code: "42501" }), "Your active role is read-only for Tech Payment. Allowed roles: Admin, Supervisor, Dispatcher, or Technician Manager.");
  assert.equal(safeTechPaymentError({ code: "23514" }), "Invalid payment status.");
  assert.equal(safeTechPaymentError({ code: "42703" }), "Missing database payment configuration.");
  assert.equal(safeTechPaymentError({ code: "28000" }), "Session expired. Please sign in again.");
});
