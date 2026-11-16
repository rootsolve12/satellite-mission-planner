import { browserDemo, Config, Pass } from "./engine";
export type PlanReport = {
  id: string;
  generatedAt: string;
  start: string;
  hours: number;
  candidates: number;
  scheduled: number;
  conflicts: number;
  contactMinutes: number;
  utilization: number;
  missions: { name: string; scheduled: number; rejected: number }[];
  stations: { name: string; scheduled: number; utilization: number }[];
  reasons: Record<string, number>;
};
export type TelemetryLog = {
  time: string;
  recordedAt: string;
  battery: number;
  temperature: number;
  signal: number | null;
  contacts: { satellite: string; station: string; antenna: number }[];
};
export type History = { plans: PlanReport[]; telemetry: TelemetryLog[] };
export const emptyHistory = (): History => ({ plans: [], telemetry: [] });
export function report(
  c: Config,
  passes: Pass[],
  start: string,
  hours: number,
): PlanReport {
  const good = passes.filter((p) => p.antenna > 0);
  const minutes = (p: Pass) => (Date.parse(p.los) - Date.parse(p.aos)) / 60000;
  const total = good.reduce((n, p) => n + minutes(p), 0);
  return {
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    start,
    hours,
    candidates: passes.length,
    scheduled: good.length,
    conflicts: passes.length - good.length,
    contactMinutes: total,
    utilization:
      (total / (hours * 60 * c.stations.reduce((n, s) => n + s.antennas, 0))) *
      100,
    missions: c.satellites.map((s) => ({
      name: s.name,
      scheduled: good.filter((p) => p.satellite === s.name).length,
      rejected: passes.filter((p) => p.satellite === s.name && !p.antenna)
        .length,
    })),
    stations: c.stations.map((s) => ({
      name: s.name,
      scheduled: good.filter((p) => p.station === s.name).length,
      utilization:
        (good
          .filter((p) => p.station === s.name)
          .reduce((n, p) => n + minutes(p), 0) /
          (hours * 60 * s.antennas)) *
        100,
    })),
    reasons: passes
      .filter((p) => !p.antenna)
      .reduce(
        (n, p) => {
          n[p.reason] = (n[p.reason] || 0) + 1;
          return n;
        },
        {} as Record<string, number>,
      ),
  };
}
export function telemetry(time: number, passes: Pass[]): TelemetryLog {
  const contacts = passes.filter(
    (p) =>
      p.antenna > 0 && Date.parse(p.aos) <= time && Date.parse(p.los) > time,
  );
  return {
    time: new Date(time).toISOString(),
    recordedAt: new Date().toISOString(),
    battery: 75 + 10 * Math.sin(time / 300000),
    temperature: 22 + 4 * Math.cos(time / 200000),
    signal: contacts.length ? -70 + 5 * Math.sin(time / 100000) : null,
    contacts: contacts.map((p) => ({
      satellite: p.satellite,
      station: p.station,
      antenna: p.antenna,
    })),
  };
}
export function cleanHistory(value: unknown): History {
  const h = value as Partial<History> | null;
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  return {
    plans: (Array.isArray(h?.plans) ? h.plans : [])
      .filter(
        (r) =>
          r &&
          typeof r.id === "string" &&
          Number.isFinite(Date.parse(r.generatedAt)) &&
          Number.isFinite(Date.parse(r.start)) &&
          [
            r.hours,
            r.candidates,
            r.scheduled,
            r.conflicts,
            r.contactMinutes,
            r.utilization,
          ].every(finite) &&
          Array.isArray(r.stations) &&
          r.stations.every(
            (s) =>
              s &&
              typeof s.name === "string" &&
              finite(s.scheduled) &&
              finite(s.utilization),
          ) &&
          Array.isArray(r.missions) &&
          r.missions.every(
            (m) =>
              m &&
              typeof m.name === "string" &&
              finite(m.scheduled) &&
              finite(m.rejected),
          ),
      )
      .slice(0, 25),
    telemetry: (Array.isArray(h?.telemetry) ? h.telemetry : [])
      .filter(
        (t) =>
          t &&
          Number.isFinite(Date.parse(t.time)) &&
          Number.isFinite(Date.parse(t.recordedAt)) &&
          finite(t.battery) &&
          finite(t.temperature) &&
          (t.signal === null || finite(t.signal)) &&
          Array.isArray(t.contacts) &&
          t.contacts.every(
            (c) =>
              c &&
              typeof c.satellite === "string" &&
              typeof c.station === "string" &&
              finite(c.antenna),
          ),
      )
      .slice(0, 100),
  };
}
export async function readHistory(): Promise<History> {
  if (browserDemo) {
    try {
      return cleanHistory(
        JSON.parse(localStorage.getItem("orbit-history-v1") || "null"),
      );
    } catch {
      return emptyHistory();
    }
  }
  const r = await fetch("/api/history");
  if (!r.ok) throw Error("Could not read saved reports");
  return cleanHistory(await r.json());
}
export async function storeHistory(h: History) {
  const limited = {
    plans: h.plans.slice(0, 25),
    telemetry: h.telemetry.slice(0, 100),
  };
  if (browserDemo) {
    localStorage.setItem("orbit-history-v1", JSON.stringify(limited));
    return limited;
  }
  const r = await fetch("/api/history", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(limited),
  });
  if (!r.ok) throw Error("History could not be saved");
  return limited;
}
