import { describe, it, expect } from "vitest";
import {
  copyInitial,
  EPOCH,
  predict,
  overlap,
  schedule,
  validate,
  position,
  path,
  planCSV,
  planningTime,
  saveConfig,
  loadConfig,
  generate,
} from "../src/engine";
import {
  report,
  telemetry,
  storeHistory,
  readHistory,
  emptyHistory,
} from "../src/history";
const start = EPOCH + "Z";
describe("visibility and resource allocation", () => {
  it("generates valid windows, geometry and conflict-free reservations", () => {
    const c = copyInitial(),
      p = predict(c, start, 24);
    expect(p.length).toBe(54);
    const good = p.filter((p) => p.antenna);
    expect(good.length).toBe(18);
    for (const a of p) {
      expect(Date.parse(a.los)).toBeGreaterThan(Date.parse(a.aos));
      expect(a.maxElevation).toBeGreaterThanOrEqual(10);
      expect(a.maxElevation).toBeLessThanOrEqual(90);
      expect(a.riseAzimuth).toBeGreaterThanOrEqual(0);
      expect(a.setAzimuth).toBeLessThanOrEqual(360);
    }
    for (let i = 0; i < good.length; i++)
      for (let j = i + 1; j < good.length; j++)
        if (
          good[i].satellite === good[j].satellite ||
          (good[i].station === good[j].station &&
            good[i].antenna === good[j].antenna)
        )
          expect(overlap(good[i], good[j])).toBe(false);
  });
  it("changes the winner with priority and increases capacity with antennas", () => {
    const c = copyInitial();
    const first = predict(c, start, 24).filter((p) => p.antenna).length;
    c.stations.forEach((s) => (s.antennas = 3));
    expect(
      predict(c, start, 24).filter((p) => p.antenna).length,
    ).toBeGreaterThan(first);
    c.satellites[2].priority = 10;
    expect(
      predict(c, start, 24).some(
        (p) => p.satellite === c.satellites[2].name && p.antenna,
      ),
    ).toBe(true);
  });
  it("blocks maintenance, incompatible bands, and supports back-to-back boundaries", () => {
    const c = copyInitial();
    c.maintenance = [
      { station: "Chennai", start, end: "2000-06-29T00:00:00Z" },
    ];
    c.stations[1].band = "X";
    const p = predict(c, start, 24);
    expect(
      p
        .filter((p) => p.station === "Chennai")
        .every((p) => p.reason === "Station maintenance"),
    ).toBe(true);
    expect(
      p
        .filter((p) => p.station === "Canberra")
        .every((p) => p.reason === "Incompatible frequency band"),
    ).toBe(true);
    const template = p[0];
    const a = {
      ...template,
      station: "Madrid",
      satellite: "A",
      aos: start,
      los: "2000-06-28T01:00:00Z",
    };
    const b = { ...a, satellite: "B", aos: a.los, los: "2000-06-28T02:00:00Z" };
    expect(schedule(c, [a, b]).every((p) => p.antenna > 0)).toBe(true);
  });
  it("predicts changing tracks and returns no zero-length horizon contacts", () => {
    const s = copyInitial().satellites[0],
      ms = Date.parse(start);
    expect(path(s, ms)).toHaveLength(121);
    expect(position(s, ms).longitude).not.toBe(
      position(s, ms + 60000).longitude,
    );
    expect(
      predict(copyInitial(), start, 6).every(
        (p) => Date.parse(p.los) > Date.parse(p.aos),
      ),
    ).toBe(true);
  });
});
describe("validation, persistence, and reporting", () => {
  it.each([NaN, 0, 1.5, 73])("rejects invalid planning horizon %s", (h) =>
    expect(() => planningTime(start, h)).toThrow(),
  );
  it("rejects malformed date, mismatched or corrupted TLEs, duplicate names and invalid station numbers", () => {
    expect(() => planningTime("2000-02-31T00:00:00Z", 24)).toThrow();
    for (const [key, value] of [
      ["latitude", 100],
      ["longitude", NaN],
      ["altitude", -1],
      ["minElevation", NaN],
      ["antennas", 1.5],
      ["band", ""],
    ] as const) {
      const c = copyInitial();
      (c.stations[0] as any)[key] = value;
      expect(() => validate(c)).toThrow();
    }
    let c = copyInitial();
    c.satellites[0].line1 = c.satellites[0].line1.slice(0, 68) + "0";
    expect(() => validate(c)).toThrow();
    c = copyInitial();
    c.satellites[0].priority = 2.5;
    expect(() => validate(c)).toThrow();
    c = copyInitial();
    c.stations[1].name = " chennai ";
    expect(() => validate(c)).toThrow();
  });
  it("persists configuration, recovers corrupted storage, and exports complete pass data", async () => {
    const c = copyInitial();
    c.satellites[0].priority = 8;
    await saveConfig(c);
    expect((await loadConfig()).satellites[0].priority).toBe(8);
    localStorage.setItem("orbit-config-v2", '{"satellites":[]}');
    expect(await loadConfig()).toEqual(copyInitial());
    const p = await generate(c, start, 6),
      csv = planCSV(p);
    expect(csv).toContain("riseAzimuth,setAzimuth,priority");
    expect(csv.split("\r\n")).toHaveLength(p.length + 1);
  });
  it("derives truthful utilization, replay telemetry and bounded durable history", async () => {
    const c = copyInitial(),
      p = predict(c, start, 24),
      r = report(c, p, start, 24);
    expect(r.scheduled).toBe(18);
    expect(r.conflicts).toBe(36);
    expect(r.utilization).toBeGreaterThan(0);
    const contact = p.find((p) => p.antenna)!;
    const snapshot = telemetry(
      (Date.parse(contact.aos) + Date.parse(contact.los)) / 2,
      p,
    );
    expect(snapshot.contacts.length).toBeGreaterThan(0);
    expect(snapshot.signal).not.toBeNull();
    expect(telemetry(Date.parse(start), p).signal).toBeNull();
    const h = emptyHistory();
    h.plans = Array.from({ length: 30 }, () => r);
    h.telemetry = Array.from({ length: 120 }, () => snapshot);
    await storeHistory(h);
    const saved = await readHistory();
    expect(saved.plans).toHaveLength(25);
    expect(saved.telemetry).toHaveLength(100);
  });
});
it("recovers malformed report records without crashing report screens", async () => {
  localStorage.setItem(
    "orbit-history-v1",
    JSON.stringify({ plans: [{}], telemetry: [{ time: "bad" }] }),
  );
  expect(await readHistory()).toEqual(emptyHistory());
});
