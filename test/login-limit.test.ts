import test from "node:test";
import assert from "node:assert/strict";
import { LoginLimiter } from "../src/lib/login-limit";

test("bloqueia após o máximo de falhas e libera após a janela", () => {
  let t = 0;
  const l = new LoginLimiter(3, 1000, () => t);
  for (let i = 0; i < 3; i++) { assert.equal(l.isBlocked("a"), false); l.recordFailure("a"); }
  assert.equal(l.isBlocked("a"), true);
  assert.equal(l.isBlocked("b"), false);
  t = 1500;
  assert.equal(l.isBlocked("a"), false);
});
test("reset limpa falhas", () => {
  const l = new LoginLimiter(1);
  l.recordFailure("a"); l.reset("a");
  assert.equal(l.isBlocked("a"), false);
});
