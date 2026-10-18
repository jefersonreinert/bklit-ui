import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendRows,
  decodeArchive,
  encodeArchive,
  mergeIntervals,
  missingRanges,
  replaceRows,
  splitByPeriod,
  upsertRows,
} from "../ohlc-archive";

describe("coverage", () => {
  it("merges overlapping and touching ranges", () => {
    assert.deepEqual(
      mergeIntervals([
        [10, 20],
        [1, 5],
        [6, 8],
        [15, 30],
        [40, 39],
      ]),
      [
        [1, 8],
        [10, 30],
      ]
    );
  });

  it("finds the stretches still missing", () => {
    const covered: [number, number][] = [
      [10, 20],
      [30, 40],
    ];
    assert.deepEqual(missingRanges(covered, 0, 50), [
      [0, 9],
      [21, 29],
      [41, 50],
    ]);
    assert.deepEqual(missingRanges(covered, 12, 18), []);
    assert.deepEqual(missingRanges([], 5, 6), [[5, 6]]);
  });
});

describe("period files", () => {
  it("splits a block across months, covering empty months too", () => {
    const sep30 = Date.UTC(2026, 8, 30, 23, 59);
    const oct1 = Date.UTC(2026, 9, 1);
    const nov2 = Date.UTC(2026, 10, 2);
    const parts = splitByPeriod(
      "bars",
      [
        [sep30, 1],
        [oct1, 2],
      ],
      sep30,
      nov2
    );
    assert.deepEqual(
      [...parts.entries()].map(([p, part]) => [
        new Date(p).toISOString().slice(0, 7),
        part.rows.length,
        part.from,
        part.to,
      ]),
      [
        ["2026-09", 1, sep30, oct1 - 1],
        ["2026-10", 1, oct1, Date.UTC(2026, 10, 1) - 1],
        ["2026-11", 0, Date.UTC(2026, 10, 1), nov2],
      ]
    );
  });

  it("upserts candles and replaces tick ranges without duplicates", () => {
    assert.deepEqual(
      upsertRows(
        [
          [1, 10],
          [2, 20],
        ],
        [
          [2, 21],
          [3, 30],
        ]
      ),
      [
        [1, 10],
        [2, 21],
        [3, 30],
      ]
    );
    assert.deepEqual(replaceRows([[1], [5], [5], [9]], [[4], [5], [6]], 3, 7), [
      [1],
      [4],
      [5],
      [6],
      [9],
    ]);
  });

  it("drops only the exact overlap of a re-sent tick POST", () => {
    assert.deepEqual(
      appendRows(
        [
          [1, 1],
          [2, 2],
        ],
        [
          [2, 2],
          [3, 3],
        ]
      ),
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ]
    );
  });

  it("round-trips the gzip file", () => {
    const rows = [
      [1_791_968_400_000, 1.160_01, 1.1601, 1.159_95, 1.16, 42, 0, 7],
    ];
    assert.deepEqual(decodeArchive(encodeArchive(rows)), rows);
  });
});
