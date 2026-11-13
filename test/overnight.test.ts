import test from "node:test";
import assert from "node:assert/strict";
import { parseDeadline } from "../src/overnight";

test("limite: --until usa a próxima ocorrência do horário; --hours/--minutes somam; padrão 8 h", () => {
  const now = new Date(2026, 10, 12, 23, 30, 0); // 12/11 23:30 local
  assert.equal(new Date(parseDeadline({ until: "07:00" }, now)).getTime(), new Date(2026, 10, 13, 7, 0, 0).getTime());
  assert.equal(new Date(parseDeadline({ until: "23:45" }, now)).getTime(), new Date(2026, 10, 12, 23, 45, 0).getTime());
  assert.equal(new Date(parseDeadline({ until: "23:30" }, now)).getTime(), new Date(2026, 10, 13, 23, 30, 0).getTime()); // já passou/igual: amanhã
  assert.equal(parseDeadline({ minutes: "90" }, now), now.getTime() + 90 * 60_000);
  assert.equal(parseDeadline({ hours: "2" }, now), now.getTime() + 2 * 3600_000);
  assert.equal(parseDeadline({}, now), now.getTime() + 8 * 3600_000);
  assert.throws(() => parseDeadline({ until: "7h" }, now), /HH:MM/);
  assert.throws(() => parseDeadline({ until: "25:00" }, now), /HH:MM/);
});
