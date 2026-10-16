import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { guardianFromBody, pragueDayOf } from "../guardian";
import { syncFromBody } from "../sync";

/** The `guardian` object as the EA v4.20 writes it (GuardianJson). */
const GUARDIAN = JSON.parse(
  readFileSync(
    new URL("./fixtures/sync_guardian.json", import.meta.url),
    "utf8"
  )
);

describe("FTMO Risk Guardian payload", () => {
  it("reads the state, the limits and the events of the EA v4.20", () => {
    const g = guardianFromBody(GUARDIAN);
    assert.ok(g);
    assert.equal(g.status.state, 2);
    assert.equal(g.status.mode, "protect");
    assert.equal(g.status.dailyLimit, 5000);
    assert.equal(g.status.dailyUsePct, 80);
    assert.equal(g.status.maxKind, "static");
    assert.equal(g.status.scope, "account");
    assert.equal(g.status.pragueDay, "2026-10-16");
    assert.equal(g.events.length, 1, "events without id are dropped");
    assert.equal(g.events[0]?.eid, "1792015200-1-123");
    assert.equal(g.events[0]?.kind, "ESTADO_BLOQUEADO");
  });

  it("is absent for the EA v4.10 and tolerates junk", () => {
    assert.equal(guardianFromBody(undefined), null);
    assert.equal(guardianFromBody("x"), null);
    assert.equal(guardianFromBody([1]), null);
    const g = guardianFromBody({ state: 9, scope: "?", max_kind: "?" });
    assert.equal(g?.status.state, 3);
    assert.equal(g?.status.scope, "account");
    assert.equal(g?.status.maxKind, "static");
    assert.equal(g?.status.pragueDay, "");
  });

  it("keeps the sync of the EA v4.10 unchanged", () => {
    const p = syncFromBody({ account: "1", info: {}, limits: {} });
    assert.equal(p?.guardian, null);
    const q = syncFromBody({ account: "1", guardian: GUARDIAN });
    assert.equal(q?.guardian?.status.dailyLimit, 5000);
  });

  it("formats the FTMO day", () => {
    assert.equal(pragueDayOf(20_260_101), "2026-01-01");
    assert.equal(pragueDayOf(0), "");
  });
});
