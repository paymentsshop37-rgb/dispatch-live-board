import test from "node:test";
import assert from "node:assert/strict";
import { loginDestination, postLoginDestination } from "../src/lib/loginDestination.js";

test("an unauthenticated Intelligence visit returns to Intelligence after login", () => {
  const login = loginDestination("/intelligence");
  assert.equal(login, "/login?next=%2Fintelligence");
  const url = new URL(login, "https://roadservicelive.com");
  assert.equal(postLoginDestination(url.search), "/intelligence");
  assert.equal(loginDestination(url.pathname, url.search), login);
});
test("a trailing slash and a repeated login keep the intended Intelligence destination", () => {
  assert.equal(loginDestination("/intelligence/"), "/login?next=%2Fintelligence");
  assert.equal(postLoginDestination("?next=/intelligence"), "/intelligence");
});
test("ordinary board login behavior is preserved", () => {
  for (const path of ["/", "/dispatch-board", "/dispatch/jobs/new", "/login"]) {
    assert.equal(loginDestination(path), "/login");
  }
  assert.equal(postLoginDestination(), "/dispatch-board");
});
test("arbitrary return destinations cannot cause an external or unauthorized redirect", () => {
  for (const value of ["https://example.com", "//example.com", "javascript:alert(1)", "/administration", "/intelligence?next=//example.com", "/dispatch/jobs/new"]) {
    assert.equal(postLoginDestination(`?next=${encodeURIComponent(value)}`), "/dispatch-board");
  }
  assert.equal(loginDestination("/dispatch-board", "?next=%2Fintelligence"), "/login");
});
