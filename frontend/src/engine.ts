import * as orbit from "satellite.js";
export type Satellite = {
  name: string;
  line1: string;
  line2: string;
  priority: number;
  band: string;
};
export type Station = {
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  minElevation: number;
  antennas: number;
  band: string;
};
export type Config = {
  satellites: Satellite[];
  stations: Station[];
  maintenance: { station: string; start: string; end: string }[];
};
export type Pass = {
  satellite: string;
  station: string;
  aos: string;
  los: string;
  maxElevation: number;
  riseAzimuth: number;
  setAzimuth: number;
  priority: number;
  band: string;
  antenna: number;
  status: string;
  reason: string;
};
export const EPOCH = "2000-06-28T00:00";
const line1 =
  "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753";
const line2 =
  "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667";
export const initial: Config = {
  satellites: [
    { name: "Vanguard · Science", line1, line2, priority: 9, band: "UHF" },
    { name: "Vanguard · Survey", line1, line2, priority: 6, band: "UHF" },
    { name: "Vanguard · Relay", line1, line2, priority: 3, band: "UHF" },
  ],
  stations: [
    {
      name: "Chennai",
      latitude: 13.0827,
      longitude: 80.2707,
      altitude: 6,
      minElevation: 10,
      antennas: 1,
      band: "UHF",
    },
    {
      name: "Canberra",
      latitude: -35.398,
      longitude: 148.981,
      altitude: 550,
      minElevation: 10,
      antennas: 1,
      band: "UHF",
    },
    {
      name: "Madrid",
      latitude: 40.427,
      longitude: -4.251,
      altitude: 731,
      minElevation: 10,
      antennas: 1,
      band: "UHF",
    },
  ],
  maintenance: [],
};
export const copyInitial = () => structuredClone(initial);
export function position(s: Satellite, ms: number) {
  const r = orbit.propagate(
    orbit.twoline2satrec(s.line1, s.line2),
    new Date(ms),
  );
  if (!r || !r.position)
    throw Error(
      "Could not propagate TLE. Check the orbital elements and date.",
    );
  const g = orbit.eciToGeodetic(r.position, orbit.gstime(new Date(ms)));
  return {
    satellite: s.name,
    latitude: orbit.degreesLat(g.latitude),
    longitude: orbit.degreesLong(g.longitude),
    altitudeKm: g.height,
  };
}
export function path(s: Satellite, ms: number) {
  return Array.from({ length: 121 }, (_, i) =>
    position(s, ms + (i - 60) * 60000),
  );
}
export function validate(c: Config) {
  if (!c.satellites.length || !c.stations.length)
    throw Error("Add at least one mission and station.");
  for (const s of c.satellites) {
    if (
      !s.name.trim() ||
      s.priority < 1 ||
      s.priority > 10 ||
      !s.band ||
      !s.line1.startsWith("1 ") ||
      !s.line2.startsWith("2 ")
    )
      throw Error("Check mission name, band, priority and TLE.");
    position(s, Date.parse(EPOCH + "Z"));
  }
  for (const s of c.stations) {
    if (
      !s.name.trim() ||
      !Number.isFinite(s.latitude) ||
      Math.abs(s.latitude) > 90 ||
      !Number.isFinite(s.longitude) ||
      Math.abs(s.longitude) > 180 ||
      s.minElevation < 0 ||
      s.minElevation >= 90 ||
      s.antennas < 1 ||
      s.antennas > 10
    )
      throw Error(
        "Check station coordinates, antenna count and minimum elevation.",
      );
  }
  if (
    new Set(c.satellites.map((s) => s.name)).size !== c.satellites.length ||
    new Set(c.stations.map((s) => s.name)).size !== c.stations.length
  )
    throw Error("Mission and station names must be unique.");
  for (const m of c.maintenance)
    if (
      !c.stations.some((s) => s.name === m.station) ||
      !(Date.parse(m.end) > Date.parse(m.start))
    )
      throw Error("Maintenance needs a valid station and end after start.");
}
export const overlap = (a: Pass, b: Pass) =>
  Date.parse(a.aos) < Date.parse(b.los) &&
  Date.parse(b.aos) < Date.parse(a.los);
export function schedule(c: Config, passes: Pass[]) {
  const results: Pass[] = [];
  for (const p of [...passes].sort(
    (a, b) =>
      b.priority - a.priority ||
      a.aos.localeCompare(b.aos) ||
      a.satellite.localeCompare(b.satellite),
  )) {
    const st = c.stations.find((s) => s.name === p.station)!;
    let antenna = 0,
      reason = "All compatible antennas occupied";
    if (st.band.toUpperCase() !== p.band.toUpperCase())
      reason = "Incompatible frequency band";
    else if (
      c.maintenance.some(
        (m) =>
          m.station === p.station &&
          Date.parse(m.start) < Date.parse(p.los) &&
          Date.parse(p.aos) < Date.parse(m.end),
      )
    )
      reason = "Station maintenance";
    else if (
      results.some(
        (q) => q.antenna && q.satellite === p.satellite && overlap(p, q),
      )
    )
      reason = "Mission already assigned to another station";
    else
      for (let a = 1; a <= st.antennas; a++)
        if (
          !results.some(
            (q) => q.antenna === a && q.station === p.station && overlap(p, q),
          )
        ) {
          antenna = a;
          reason = "Priority-first allocation";
          break;
        }
    results.push({
      ...p,
      antenna,
      reason,
      status: antenna ? "SCHEDULED" : "REJECTED",
    });
  }
  return results.sort((a, b) => a.aos.localeCompare(b.aos));
}
export function predict(c: Config, start: string, hours: number) {
  validate(c);
  if (hours < 1 || hours > 72)
    throw Error("Planning horizon must be 1–72 hours.");
  const begin = Date.parse(start),
    end = begin + hours * 3600000;
  if (!Number.isFinite(begin)) throw Error("Choose a valid planning date.");
  const out: Pass[] = [];
  for (const s of c.satellites) {
    const rec = orbit.twoline2satrec(s.line1, s.line2);
    for (const st of c.stations) {
      const observer = {
        latitude: (st.latitude * Math.PI) / 180,
        longitude: (st.longitude * Math.PI) / 180,
        height: st.altitude / 1000,
      };
      let aos: number | null = null,
        peak = 0,
        rise = 0,
        last = 0;
      const add = (los: number) =>
        out.push({
          satellite: s.name,
          station: st.name,
          aos: new Date(aos!).toISOString(),
          los: new Date(los).toISOString(),
          maxElevation: peak,
          riseAzimuth: rise,
          setAzimuth: last,
          priority: s.priority,
          band: s.band,
          antenna: 0,
          status: "CANDIDATE",
          reason: "",
        });
      for (let t = begin; t <= end; t += 20000) {
        const d = new Date(t),
          v = orbit.propagate(rec, d);
        if (!v || !v.position) throw Error("Orbit propagation failed");
        const look = orbit.ecfToLookAngles(
          observer,
          orbit.eciToEcf(v.position, orbit.gstime(d)),
        );
        const el = (look.elevation * 180) / Math.PI,
          az = (look.azimuth * 180) / Math.PI;
        if (el >= st.minElevation) {
          if (aos === null) {
            aos = t;
            peak = el;
            rise = az;
          }
          peak = Math.max(peak, el);
          last = az;
        } else if (aos !== null) {
          add(t);
          aos = null;
        }
      }
      if (aos !== null) add(end);
    }
  }
  return schedule(c, out);
}
export const browserDemo = import.meta.env.VITE_DEMO_MODE === "true";
export async function generate(c: Config, start: string, hours: number) {
  if (browserDemo) return predict(c, start, hours);
  const r = await fetch(
    "/api/plan?start=" + encodeURIComponent(start) + "&hours=" + hours,
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error || d.message || "Prediction failed");
  return d.passes as Pass[];
}
export async function loadConfig(): Promise<Config> {
  if (browserDemo) {
    try {
      return (
        JSON.parse(localStorage.getItem("orbit-config-v2") || "null") ||
        copyInitial()
      );
    } catch {
      return copyInitial();
    }
  }
  const r = await fetch("/api/config");
  if (!r.ok) throw Error("Could not load station configuration");
  return r.json();
}
export async function saveConfig(c: Config) {
  validate(c);
  if (browserDemo) {
    localStorage.setItem("orbit-config-v2", JSON.stringify(c));
    return;
  }
  const r = await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(c),
  });
  if (!r.ok) {
    const d = await r.json();
    throw Error(d.error || d.message || "Configuration save failed");
  }
}
