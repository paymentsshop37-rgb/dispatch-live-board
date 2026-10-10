import assert from "node:assert/strict";
import test from "node:test";
import { subscribeDataSync } from "../src/lib/dataSync.js";

function fixture(t, refresh, onError = () => {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const host = new EventTarget();
  const doc = new EventTarget();
  doc.visibilityState = "visible";
  const handlers = new Map();
  let status;
  let removed = 0;
  const channel = {
    on(event, filter, callback) { assert.equal(event, "postgres_changes"); assert.equal(filter.event, "*"); handlers.set(filter.table, callback); return channel; },
    subscribe(callback) { status = callback; return channel; },
  };
  const client = { channel: () => channel, removeChannel: value => { assert.equal(value, channel); removed += 1; } };
  const stop = subscribeDataSync(client, ["jobs", "invoice_payments"], refresh, { host, doc, onError });
  t.after(stop);
  return { host, doc, handlers, status: value => status(value), stop, removed: () => removed };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("bursts of job and payment events produce one refresh", async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls += 1; });
  f.handlers.get("jobs")(); f.handlers.get("jobs")(); f.handlers.get("invoice_payments")();
  t.mock.timers.tick(299); assert.equal(calls, 0);
  t.mock.timers.tick(1); await settle(); assert.equal(calls, 1);
});

test("connection recovery, periodic fallback and returning to a hidden tab reconcile data", async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls += 1; });
  f.status("SUBSCRIBED"); t.mock.timers.tick(300); await settle(); assert.equal(calls, 1);
  t.mock.timers.tick(30000); t.mock.timers.tick(300); await settle(); assert.equal(calls, 2);
  f.doc.visibilityState = "hidden";
  f.handlers.get("jobs")(); t.mock.timers.tick(60000); await settle(); assert.equal(calls, 2);
  f.doc.visibilityState = "visible"; f.doc.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(300); await settle(); assert.equal(calls, 3);
  f.host.dispatchEvent(new Event("online")); t.mock.timers.tick(300); await settle(); assert.equal(calls, 4);
});

test("events during a refresh queue one further read without overlapping reads", async t => {
  let calls = 0;
  let finish;
  const f = fixture(t, () => { calls += 1; return calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(); });
  f.handlers.get("jobs")(); t.mock.timers.tick(300); assert.equal(calls, 1);
  f.handlers.get("jobs")(); f.handlers.get("invoice_payments")(); t.mock.timers.tick(1000); assert.equal(calls, 1);
  finish(); await settle(); t.mock.timers.tick(300); await settle(); assert.equal(calls, 2);
});

test("failed reads retry and unmount removes listeners, channel and queued refreshes", async t => {
  let calls = 0; let errors = 0;
  const f = fixture(t, async () => { calls += 1; if (calls === 1) throw new Error("offline"); }, () => { errors += 1; });
  f.handlers.get("jobs")(); t.mock.timers.tick(300); await settle(); assert.equal(errors, 1);
  f.host.dispatchEvent(new Event("focus")); t.mock.timers.tick(300); await settle(); assert.equal(calls, 2);
  f.handlers.get("jobs")(); f.stop();
  f.host.dispatchEvent(new Event("online")); t.mock.timers.tick(60000); await settle(); assert.equal(calls, 2);
  assert.equal(f.removed(), 1);
});
