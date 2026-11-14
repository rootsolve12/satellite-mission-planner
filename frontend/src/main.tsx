import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type Pass = {
  satellite: string;
  station: string;
  aos: string;
  los: string;
  maxElevation: number;
  priority: number;
  antenna: number;
  status: string;
  reason: string;
};
function App() {
  const [start, setStart] = useState("2000-06-28T00:00");
  const [hours, setHours] = useState(24);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [config, setConfig] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [monitor, setMonitor] = useState<any>(null);
  const [time, setTime] = useState("2000-06-28T00:00");
  const [tab, setTab] = useState("Operations");
  async function api(path: string, options?: RequestInit) {
    const r = await fetch("/api/" + path, options);
    const d = await r.json();
    if (!r.ok) throw Error(d.error || d.message || "Request failed");
    return d;
  }
  async function action(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function plan() {
    action(async () => {
      const d = await api(
        "plan?start=" +
          encodeURIComponent(new Date(start + "Z").toISOString()) +
          "&hours=" +
          hours,
      );
      setPasses(d.passes);
    });
  }
  const good = passes.filter((p) => p.antenna > 0);
  return (
    <>
      <header>
        <div className="logo">◉</div>
        <div>
          <small>SIMATS · CSA0923</small>
          <h1>Orbit Operations</h1>
        </div>
        <span className="badge">CLASSROOM SIMULATOR</span>
      </header>
      <nav>
        {["Operations", "Configuration", "Monitoring"].map((t) => (
          <button
            className={tab === t ? "selected" : ""}
            onClick={() => {
              setTab(t);
              if (t === "Configuration")
                action(async () =>
                  setConfig(JSON.stringify(await api("config"), null, 2)),
                );
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      <main>
        <div className="intro">
          <small>MISSION PLANNING & GROUND STATION MANAGEMENT</small>
          <h2>Predict. Schedule. Monitor.</h2>
          <p>SGP4 pass prediction meets priority-based antenna allocation.</p>
        </div>
        {error && <aside role="alert">{error}</aside>}
        {tab === "Operations" && (
          <>
            <section className="controls">
              <label>
                Planning start · UTC
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Horizon · hours
                <input
                  type="number"
                  min="1"
                  max="72"
                  value={hours}
                  onChange={(e) => setHours(+e.target.value)}
                />
              </label>
              <button disabled={busy} onClick={plan}>
                {busy ? "Propagating…" : "Generate schedule ↗"}
              </button>
            </section>
            <div className="cards">
              {[
                ["Visibility windows", passes.length],
                ["Scheduled passes", good.length],
                ["Conflict decisions", passes.length - good.length],
              ].map(([k, v]) => (
                <section>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </section>
              ))}
            </div>
            <section>
              <h3>Communication schedule</h3>
              <p>
                Higher priority missions reserve compatible antennas first.
                Select a scheduled pass to inspect its midpoint.
              </p>
              <div className="table">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Satellite / Mission",
                        "Station",
                        "AOS · UTC",
                        "LOS · UTC",
                        "Peak",
                        "Resource",
                        "Decision",
                      ].map((x) => (
                        <th>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {passes.map((p) => (
                      <tr>
                        <td>
                          {p.satellite}
                          <small>Priority {p.priority}</small>
                        </td>
                        <td>{p.station}</td>
                        <td>{p.aos.slice(11, 19)}</td>
                        <td>{p.los.slice(11, 19)}</td>
                        <td>{p.maxElevation.toFixed(1)}°</td>
                        <td>{p.antenna ? "Antenna " + p.antenna : "—"}</td>
                        <td>
                          <span className={p.antenna ? "ok" : "warn"}>
                            {p.status}
                          </span>
                          <small>{p.reason}</small>
                          {p.antenna > 0 && (
                            <button
                              onClick={() => {
                                const t = new Date(
                                  (Date.parse(p.aos) + Date.parse(p.los)) / 2,
                                ).toISOString();
                                setTime(t.slice(0, 16));
                                setTab("Monitoring");
                                action(async () =>
                                  setMonitor(
                                    await api(
                                      "monitor?time=" + encodeURIComponent(t),
                                    ),
                                  ),
                                );
                              }}
                            >
                              Inspect pass
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!passes.length && (
                  <p className="empty">
                    Generate a schedule to view visibility windows and conflict
                    decisions.
                  </p>
                )}
              </div>
              <button
                disabled={!passes.length}
                onClick={() => {
                  const csv = [
                    "satellite,station,aos,los,maxElevation,antenna,status,reason",
                    ...passes.map((p) =>
                      [
                        p.satellite,
                        p.station,
                        p.aos,
                        p.los,
                        p.maxElevation,
                        p.antenna,
                        p.status,
                        p.reason,
                      ]
                        .map((x) => '"' + String(x).replaceAll('"', '""') + '"')
                        .join(","),
                    ),
                  ].join("\n");
                  const url = URL.createObjectURL(
                    new Blob([csv], { type: "text/csv" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "schedule.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </button>
            </section>
          </>
        )}
        {tab === "Configuration" && (
          <section>
            <h3>Mission & resource registry</h3>
            <p>
              Edit satellite TLEs, priorities (1–10), station antennas,
              frequency bands and maintenance intervals. Save before generating
              a new schedule. Configuration is stored locally in H2.
            </p>
            <textarea
              aria-label="Configuration JSON"
              rows={25}
              value={config}
              onChange={(e) => setConfig(e.target.value)}
            />
            <button
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api("config", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(JSON.parse(config)),
                  });
                  setPasses([]);
                  alert("Configuration saved");
                })
              }
            >
              Save configuration
            </button>
          </section>
        )}
        {tab === "Monitoring" && (
          <section>
            <h3>Replay & simulated telemetry</h3>
            <p>
              Choose a UTC time or inspect a scheduled pass. Positions use SGP4;
              battery and temperature are synthetic teaching data.
            </p>
            <div className="controls">
              <input
                type="datetime-local"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              <button
                disabled={busy}
                onClick={() =>
                  action(async () =>
                    setMonitor(
                      await api(
                        "monitor?time=" +
                          encodeURIComponent(
                            new Date(time + "Z").toISOString(),
                          ),
                      ),
                    ),
                  )
                }
              >
                Update replay
              </button>
            </div>
            {monitor && (
              <>
                <div className="cards">
                  <section>
                    <small>Simulated battery</small>
                    <strong>{monitor.batteryPercent.toFixed(1)}%</strong>
                  </section>
                  <section>
                    <small>Simulated temperature</small>
                    <strong>{monitor.temperatureC.toFixed(1)}°C</strong>
                  </section>
                </div>
                <svg
                  viewBox="0 0 720 360"
                  aria-label="Satellite positions in latitude longitude grid"
                >
                  <rect width="720" height="360" fill="#0d2234" />
                  {Array.from({ length: 13 }, (_, i) => (
                    <line
                      x1={i * 60}
                      x2={i * 60}
                      y1="0"
                      y2="360"
                      stroke="#234055"
                    />
                  ))}
                  {Array.from({ length: 7 }, (_, i) => (
                    <line
                      x1="0"
                      x2="720"
                      y1={i * 60}
                      y2={i * 60}
                      stroke="#234055"
                    />
                  ))}
                  {monitor.tracks.map((t: any, i: number) => (
                    <g>
                      <circle
                        cx={(t.longitude + 180) * 2}
                        cy={(90 - t.latitude) * 2}
                        r={7 + i * 3}
                        fill="none"
                        stroke="#6bf2c3"
                      />
                      <text x="12" y={24 + i * 22} fill="white">
                        {t.satellite}: {t.latitude.toFixed(2)}°,{" "}
                        {t.longitude.toFixed(2)}° · {t.altitudeKm.toFixed(0)} km
                      </text>
                    </g>
                  ))}
                  <text x="12" y="345" fill="#92a9bc">
                    Longitude −180° → +180° / Latitude +90° → −90°
                  </text>
                </svg>
              </>
            )}
          </section>
        )}
        <footer>
          Historical fixture epoch: June 2000 · 20-second visibility sampling ·
          No operational spacecraft control
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
