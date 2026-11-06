import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_DESKTOP_START, ADMIN_DESKTOP_END, isAdminDesktopTrialActive, installTemporaryDesktopViewport } from "../src/lib/temporaryDesktopViewport.js";

test("desktop trial lasts exactly one week and only includes authenticated administrators", () => {
  assert.equal(ADMIN_DESKTOP_END - ADMIN_DESKTOP_START, 7 * 24 * 60 * 60 * 1000);
  const context = { authenticated: true, role: "admin", now: ADMIN_DESKTOP_START };
  assert.equal(isAdminDesktopTrialActive(context), true);
  for (const role of ["dispatcher", "supervisor", "technician_manager", ""]) {
    assert.equal(isAdminDesktopTrialActive({ ...context, role }), false);
  }
  assert.equal(isAdminDesktopTrialActive({ ...context, authenticated: false }), false);
  assert.equal(isAdminDesktopTrialActive({ ...context, now: ADMIN_DESKTOP_START - 1 }), false);
  assert.equal(isAdminDesktopTrialActive({ ...context, now: ADMIN_DESKTOP_END }), false);
});

test("viewport restores at expiry, after waking, and on logout", () => {
  let timestamp = ADMIN_DESKTOP_START;
  let content = "width=device-width, initial-scale=1.0";
  const original = content;
  const listeners = new Map();
  let pending;
  const viewport = { getAttribute: () => content, setAttribute: (_, value) => { content = value; } };
  const events = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: (name) => listeners.delete(name) };
  const document = { ...events, querySelector: () => viewport };
  const window = { ...events, setTimeout: (handler, delay) => { pending = handler; assert.equal(delay, ADMIN_DESKTOP_END - timestamp); return 1; }, clearTimeout: () => { pending = undefined; } };
  const install = () => installTemporaryDesktopViewport({ authenticated: true, role: "admin", document, window, now: () => timestamp });
  let cleanup = install();
  assert.equal(content, "width=1440");
  timestamp = ADMIN_DESKTOP_END;
  pending();
  assert.equal(content, original);
  cleanup();
  timestamp = ADMIN_DESKTOP_START;
  cleanup = install();
  timestamp = ADMIN_DESKTOP_END + 1000;
  listeners.get("visibilitychange")();
  assert.equal(content, original);
  cleanup();
  timestamp = ADMIN_DESKTOP_START;
  cleanup = install();
  cleanup();
  assert.equal(content, original);
  assert.equal(pending, undefined);
  assert.equal(listeners.size, 0);
});
