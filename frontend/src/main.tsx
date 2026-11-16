import { useState, useEffect, useMemo, useRef } from "react";
import {
  Config,
  Pass,
  Satellite,
  Station,
  EPOCH,
  position,
  path,
  copyInitial,
  generate,
  loadConfig,
  saveConfig,
  browserDemo,
  planCSV,
  planningTime,
} from "./engine";
import "./style.css";
import {
  History,
  emptyHistory,
  report,
  telemetry,
  readHistory,
  storeHistory,
} from "./history";
const colors = ["#80f5c4", "#bba6ff", "#ffca83"];
const clock = (s: string) => new Date(s).toISOString().slice(11, 19);
const short = (s: string) => s.replace("Vanguard · ", "");
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    schedule: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4m10-4v4M3 11h18m-13 4h3m3 0h3" />
      </>
    ),
    stations: (
      <>
        <path d="M5 4a11 11 0 0 0 15 15L5 4zm7 9 7-7m-2-3 4 4M7 17l-3 5m9-3 3 3" />
      </>
    ),
    missions: (
      <>
        <path d="m9 8 7 7-4 4-7-7 4-4ZM4 3l5 5-4 4-5-5 4-4Zm12 12 5 5-4 4-5-5m2-14 5-2 2 2-2 5m-4-2 2 2" />
      </>
    ),
    monitor: (
      <>
        <path d="M2 12h4l3-8 6 16 3-8h4" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      width="19"
      height="19"
    >
      {paths[name] || paths.overview}
    </svg>
  );
}
export function App() {
  const operation = useRef(false);
  const [tab, setTab] = useState("Overview"),
    [config, setConfig] = useState<Config>(copyInitial()),
    [passes, setPasses] = useState<Pass[]>([]),
    [history, setHistory] = useState<History>(emptyHistory()),
    [draftStart, setStart] = useState(EPOCH),
    [draftHours, setHours] = useState(24),
    [plan, setPlan] = useState({ start: EPOCH, hours: 24 }),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [selected, setSelected] = useState<Pass | null>(null),
    [filter, setFilter] = useState("All passes"),
    [stationFilter, setStationFilter] = useState("All stations"),
    [minute, setMinute] = useState(100),
    [playing, setPlaying] = useState(false),
    [world, setWorld] = useState<any>(null),
    [editing, setEditing] = useState<{
      kind: "station" | "mission";
      index: number;
    } | null>(null),
    [draft, setDraft] = useState<any>({}),
    [maintenanceStation, setMaintenanceStation] = useState("Chennai"),
    [maintStart, setMaintStart] = useState(EPOCH),
    [maintEnd, setMaintEnd] = useState("2000-06-28T06:00");
  const { start, hours } = plan;
  const base = Date.parse(start + "Z");
  const current = base + minute * 60000;
  const pendingWindow = draftStart !== start || draftHours !== hours;
  async function run(c: Config = config, s = draftStart, h = draftHours) {
    if (operation.current) return null;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      planningTime(s + "Z", h);
      const p = await generate(c, new Date(s + "Z").toISOString(), h);
      await saveConfig(c);
      try {
        const old = await readHistory();
        setHistory(
          await storeHistory({
            ...old,
            plans: [
              report(c, p, new Date(s + "Z").toISOString(), h),
              ...old.plans,
            ],
          }),
        );
      } catch {
        notify("Schedule generated, but report history could not be saved.");
      }
      setPasses(p);
      setConfig(c);
      setPlan({ start: s, hours: h });
      setSelected(null);
      setPlaying(false);
      setMinute((m) => Math.max(0, Math.min(m, h * 60 - 1 / 3)));
      setStationFilter((f) =>
        c.stations.some((st) => st.name === f) ? f : "All stations",
      );
      setMaintenanceStation((st) =>
        c.stations.some((s) => s.name === st) ? st : c.stations[0].name,
      );
      return p;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    loadConfig()
      .then((c) => run(c))
      .catch((e) => {
        setError(String(e));
        setBusy(false);
      });
    fetch("/world.json")
      .then((r) => r.json())
      .then(setWorld)
      .catch(() =>
        setToast(
          "Map outline unavailable. Orbit tracks and scheduling still work.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setMinute((m) => (m + 1 / 3) % (hours * 60)),
      700,
    );
    return () => clearInterval(timer);
  }, [playing, hours]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (!editing) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const fields = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,textarea,select",
        ) || [],
      );
    fields()
      .find((e) => e.tagName === "INPUT")
      ?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setEditing(null);
        setError("");
      }
      if (e.key === "Tab") {
        const a = fields();
        if (!a.length) return;
        const first = a[0],
          last = a[a.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editing, busy]);
  const accepted = passes.filter((p) => p.antenna > 0),
    rejected = passes.filter((p) => !p.antenna),
    duration = accepted.reduce(
      (n, p) => n + (Date.parse(p.los) - Date.parse(p.aos)) / 60000,
      0,
    );
  const utilization =
    (duration /
      (hours * 60 * config.stations.reduce((n, s) => n + s.antennas, 0))) *
    100;
  const filtered = passes.filter(
    (p) =>
      (filter === "All passes" ||
        (filter === "Scheduled" ? p.antenna > 0 : p.antenna === 0)) &&
      (stationFilter === "All stations" || p.station === stationFilter),
  );
  const tracking = useMemo(() => {
    try {
      return {
        tracks: config.satellites.map((s) => ({
          ...position(s, current),
          points: path(s, current),
        })),
        error: "",
      };
    } catch (e) {
      return { tracks: [], error: String(e) };
    }
  }, [config, current]);
  const tracks = tracking.tracks;
  const upcoming = accepted.filter((p) => Date.parse(p.los) > current);
  const currentTelemetry = telemetry(current, passes);
  async function captureTelemetry() {
    try {
      const old = await readHistory();
      setHistory(
        await storeHistory({
          ...old,
          telemetry: [currentTelemetry, ...old.telemetry],
        }),
      );
      notify("Simulated telemetry snapshot recorded.");
    } catch (e) {
      setError(String(e));
    }
  }
  const active = accepted.filter(
    (p) => Date.parse(p.aos) <= current && Date.parse(p.los) > current,
  );
  function inspect(p: Pass) {
    setSelected(p);
    setPlaying(false);
    setMinute(
      Math.max(
        0,
        Math.min(
          hours * 60 - 1 / 3,
          ((Date.parse(p.aos) + Date.parse(p.los)) / 2 - base) / 60000,
        ),
      ),
    );
    setTab("Monitoring");
  }
  function notify(s: string) {
    setToast(s);
  }
  function edit(kind: "mission" | "station", index: number) {
    setError("");
    setEditing({ kind, index });
    setDraft({
      ...(kind === "mission" ? config.satellites : config.stations)[index],
    });
  }
  async function persist(next: Config) {
    const p = await run(next, start, hours);
    if (p !== null) {
      notify("Configuration saved. Schedule recalculated.");
      setEditing(null);
    }
  }
  function exportCSV() {
    const csv = planCSV(filtered);
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = "mission-schedule.csv";
    a.click();
    URL.revokeObjectURL(u);
    notify(`${filtered.length} communication windows exported`);
  }
  function worldPath(g: any) {
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    return polys
      .map((p: any) =>
        p
          .map(
            (r: number[][]) =>
              r
                .map(
                  ([lon, lat], i) =>
                    (i ? "L" : "M") +
                    ((lon + 180) * 2).toFixed(1) +
                    "," +
                    ((90 - lat) * 2).toFixed(1),
                )
                .join(" ") + "Z",
          )
          .join(" "),
      )
      .join(" ");
  }
  const MapView = ({ large = false }: { large?: boolean }) => (
    <div className={"map " + (large ? "large" : "")}>
      <svg
        viewBox="0 0 720 360"
        role="img"
        aria-label="World map with satellite ground tracks and ground stations"
      >
        <defs>
          <radialGradient id="ocean">
            <stop stopColor="#183e47" />
            <stop offset="1" stopColor="#0d1b23" />
          </radialGradient>
          <pattern
            id="grid"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M60 0H0V60"
              fill="none"
              stroke="#b8d7d4"
              strokeOpacity=".06"
            />
          </pattern>
        </defs>
        <rect width="720" height="360" fill="url(#ocean)" />
        <rect width="720" height="360" fill="url(#grid)" />
        {world?.features.map((f: any, i: number) => (
          <path
            key={i}
            d={worldPath(f.geometry)}
            fill="#28454c"
            stroke="#45636a"
            strokeWidth=".35"
          />
        ))}
        {tracks.map((t, i) => (
          <g key={t.satellite}>
            {t.points.slice(1).map((p, j) => {
              const prev = t.points[j];
              return Math.abs(p.longitude - prev.longitude) < 180 ? (
                <line
                  key={j}
                  x1={(prev.longitude + 180) * 2}
                  y1={(90 - prev.latitude) * 2}
                  x2={(p.longitude + 180) * 2}
                  y2={(90 - p.latitude) * 2}
                  stroke={colors[i % 3]}
                  opacity={0.65 - (i % 3) * 0.1}
                  strokeWidth={1.4}
                  strokeDasharray={i ? "4 4" : undefined}
                />
              ) : null;
            })}
            <circle
              cx={(t.longitude + 180) * 2}
              cy={(90 - t.latitude) * 2}
              r={5 + i * 3}
              stroke={colors[i % 3]}
              fill={i ? "none" : colors[i % 3]}
              strokeWidth="1.5"
            />
          </g>
        ))}
        {config.stations.map((st) => (
          <g
            key={st.name}
            transform={`translate(${(st.longitude + 180) * 2},${(90 - st.latitude) * 2})`}
          >
            <circle r="20" fill="#8deac0" opacity=".07" />
            <circle r="4" fill="#d6eee7" stroke="#071a1b" strokeWidth="1.5" />
            <text
              y="-11"
              textAnchor="middle"
              fill="#d9e8e6"
              fontSize="9"
              fontFamily="system-ui"
            >
              {st.name}
            </text>
          </g>
        ))}
      </svg>
      <div className="map-top">
        <span className="live-dot" /> ORBITAL REPLAY{" "}
        <span className="map-time">
          {new Date(current).toISOString().slice(11, 19)} UTC
        </span>
      </div>
      <div className="map-bottom">
        <span>○ Ground station</span>
        <span>— SGP4 ground track · ±60 min</span>
        <span>WGS84</span>
      </div>
    </div>
  );
  const Timeline = () => (
    <div className="timeline">
      <div className="time-axis">
        <span className="axis-label">RESOURCE</span>
        <div className="axis-track">
          {Array.from({ length: 5 }, (_, i) => i / 4).map((f) => (
            <span key={f} style={{ left: f * 100 + "%" }}>
              {new Date(base + f * hours * 3600000).toISOString().slice(11, 16)}
              <small>
                {new Date(base + f * hours * 3600000)
                  .toISOString()
                  .slice(5, 10)}
              </small>
            </span>
          ))}
        </div>
      </div>
      {config.stations.map((st) =>
        Array.from({ length: st.antennas }, (_, i) => (
          <div className="timeline-row" key={st.name + i}>
            <div className="lane-label">
              <span className="live-dot" />
              {st.name}
              <small>
                ANTENNA {String(i + 1).padStart(2, "0")} · {st.band}
              </small>
            </div>
            <div className="lane">
              {accepted
                .filter((p) => p.station === st.name && p.antenna === i + 1)
                .map((p, j) => (
                  <button
                    key={j}
                    title={`${p.satellite} · ${clock(p.aos)}–${clock(p.los)}`}
                    aria-label={`Inspect ${p.satellite} at ${st.name} ${clock(p.aos)}`}
                    className="pass-bar"
                    style={{
                      left:
                        ((Date.parse(p.aos) - base) / (hours * 3600000)) * 100 +
                        "%",
                      width:
                        Math.max(
                          0.5,
                          ((Date.parse(p.los) - Date.parse(p.aos)) /
                            (hours * 3600000)) *
                            100,
                        ) + "%",
                      background:
                        colors[
                          config.satellites.findIndex(
                            (s) => s.name === p.satellite,
                          ) % 3
                        ],
                    }}
                    onClick={() => inspect(p)}
                  />
                ))}
              <div
                className="time-cursor"
                style={{ left: (minute / (hours * 60)) * 100 + "%" }}
              />
            </div>
          </div>
        )),
      )}
    </div>
  );
  const PassTable = ({ limit }: { limit?: number }) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>MISSION / SATELLITE</th>
            <th>GROUND STATION</th>
            <th>AOS → LOS · UTC</th>
            <th>MAX ELEV.</th>
            <th>ASSIGNMENT</th>
            <th>STATUS</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, limit).map((p, i) => (
            <tr key={p.satellite + p.station + p.aos + i}>
              <td>
                <span
                  className="color-dot"
                  style={{
                    background:
                      colors[
                        config.satellites.findIndex(
                          (s) => s.name === p.satellite,
                        ) % 3
                      ],
                  }}
                />
                {p.satellite}
                <small>
                  Priority {p.priority} · {p.band}
                </small>
              </td>
              <td>{p.station}</td>
              <td className="mono">
                <small>{p.aos.slice(0, 10)}</small>
                {clock(p.aos).slice(0, 5)} <span className="muted">→</span>{" "}
                {clock(p.los).slice(0, 5)}
                <small>
                  {((Date.parse(p.los) - Date.parse(p.aos)) / 60000).toFixed(1)}{" "}
                  min contact
                </small>
              </td>
              <td>{p.maxElevation.toFixed(1)}°</td>
              <td>
                {p.antenna
                  ? "Antenna " + String(p.antenna).padStart(2, "0")
                  : "—"}
              </td>
              <td>
                <span className={"pill " + (p.antenna ? "green" : "amber")}>
                  {p.antenna ? "Scheduled" : "Conflict"}
                </span>
                <small>{p.antenna ? "Resource reserved" : p.reason}</small>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"View pass " + i}
                  onClick={() => inspect(p)}
                >
                  ↗
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!filtered.length && (
        <div className="empty">No passes match these filters.</div>
      )}
    </div>
  );
  return (
    <div className={"app screen-" + tab.toLowerCase()}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Overview");
          }}
        >
          <span className="brand-icon">◎</span>
          <span>
            ORBIT<span className="brand-sub">MISSION CONTROL</span>
          </span>
        </a>
        <div className="workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <nav>
          {[
            ["Overview", "overview"],
            ["Mission planning", "missions"],
            ["Pass schedule", "schedule"],
            ["Ground stations", "stations"],
            ["Monitoring", "monitor"],
            ["Reports", "schedule"],
          ].map(([label, icon]) => (
            <button
              key={label}
              className={
                tab ===
                (label === "Mission planning"
                  ? "Missions"
                  : label === "Pass schedule"
                    ? "Schedule"
                    : label === "Ground stations"
                      ? "Stations"
                      : label)
                  ? "active"
                  : ""
              }
              onClick={() =>
                setTab(
                  label === "Mission planning"
                    ? "Missions"
                    : label === "Pass schedule"
                      ? "Schedule"
                      : label === "Ground stations"
                        ? "Stations"
                        : label,
                )
              }
            >
              <Icon name={icon} />
              {label}
              {label === "Pass schedule" && (
                <span className="nav-count">{accepted.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="simulation-mark">
            <span className="live-dot" /> DEMO ENVIRONMENT
          </div>
          <p>
            Historical orbit replay
            <br />
            28 June 2000 · UTC
          </p>
          <button
            className="reset"
            disabled={busy}
            onClick={async () => {
              const result = await run(copyInitial(), EPOCH, 24);
              if (result !== null) {
                setStart(EPOCH);
                setHours(24);
                setFilter("All passes");
                setStationFilter("All stations");
                setMinute(100);
                setMaintStart(EPOCH);
                setMaintEnd("2000-06-28T06:00");
                notify("Sample mission restored");
              }
            }}
          >
            ↺ Reset demo
          </button>
          <div className="side-version">ORBIT OPERATIONS / 02</div>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            WORKSPACE <span>/</span>{" "}
            <b>{tab === "Overview" ? "Operations overview" : tab}</b>
          </div>
          <div className="header-right">
            <span className="live-dot" />
            <span>Planning engine ready</span>
            <span className="header-divider" />
            <span className="mono">
              {new Date(current).toISOString().slice(0, 10)}
            </span>
            <span className="avatar">◎</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                SATELLITE MISSION PLANNING & GROUND STATION MANAGEMENT
              </div>
              <h1>
                {
                  (
                    {
                      Overview: "Mission overview",
                      Missions: "Mission planning",
                      Schedule: "Pass schedule",
                      Stations: "Ground station network",
                      Monitoring: "Mission monitoring",
                      Reports: "Reports & activity history",
                    } as Record<string, string>
                  )[tab]
                }
              </h1>
              <p>
                {
                  (
                    {
                      Overview:
                        "Every orbit. Every connection. One clear picture.",
                      Missions:
                        "Define mission priorities and orbital elements. Turn visibility into a plan.",
                      Schedule:
                        "Allocate antenna resources and understand every scheduling decision.",
                      Stations:
                        "Manage your ground network, antennas, and maintenance windows.",
                      Monitoring:
                        "Replay orbital positions and follow scheduled communication sessions.",
                      Reports:
                        "Review generated plans, allocation outcomes, and saved simulated telemetry.",
                    } as Record<string, string>
                  )[tab]
                }
              </p>
            </div>
            <div className="heading-actions">
              {(tab === "Missions" || tab === "Stations") && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => {
                    const kind = tab === "Missions" ? "mission" : "station";
                    setError("");
                    setEditing({ kind, index: -1 });
                    setDraft(
                      kind === "mission"
                        ? {
                            ...copyInitial().satellites[0],
                            name: "Mission " + (config.satellites.length + 1),
                            priority: 5,
                          }
                        : {
                            name: "Station " + (config.stations.length + 1),
                            latitude: 0,
                            longitude: 0,
                            altitude: 0,
                            minElevation: 10,
                            antennas: 1,
                            band: "UHF",
                          },
                    );
                  }}
                >
                  +{" "}
                  {tab === "Missions" ? "Register mission" : "Register station"}
                </button>
              )}
              <button
                className="button secondary"
                onClick={exportCSV}
                disabled={busy || !filtered.length}
              >
                ↓ Export schedule
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => run()}
              >
                {busy ? "Calculating…" : "↻ Generate schedule"}
              </button>
            </div>
          </div>
          {error && !editing && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {toast && (
            <div role="status" className="toast">
              ✓ {toast}
            </div>
          )}
          {(tab === "Overview" || tab === "Schedule") && (
            <>
              <div className="planning-strip">
                <span className="strip-title">
                  <Icon name="schedule" /> Planning window
                </span>
                <label>
                  Start · UTC
                  <input
                    aria-label="Planning start"
                    type="datetime-local"
                    value={draftStart}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Horizon
                  <select
                    aria-label="Planning horizon"
                    value={draftHours}
                    onChange={(e) => setHours(+e.target.value)}
                  >
                    {[6, 12, 24, 48, 72].map((h) => (
                      <option key={h} value={h}>
                        {h} hours
                      </option>
                    ))}
                  </select>
                </label>
                <div className="strip-note">
                  SGP4 / SDP4<span>20-second visibility sampling</span>
                </div>
              </div>
              {pendingWindow && (
                <div className="pending-window" role="status">
                  Planning window changed. Select Generate schedule to apply it;
                  the displayed plan and replay still use{" "}
                  {start.replace("T", " ")} UTC for {hours} hours.
                </div>
              )}
              <div className="stats">
                {[
                  {
                    label: "REGISTERED MISSIONS",
                    value: config.satellites.length,
                    detail: "Priority-based allocation",
                    icon: "missions",
                  },
                  {
                    label: "GROUND STATIONS",
                    value: config.stations.length,
                    detail:
                      config.stations.reduce((n, s) => n + s.antennas, 0) +
                      " antennas in network",
                    icon: "stations",
                  },
                  {
                    label: "SCHEDULED CONTACTS",
                    value: accepted.length,
                    detail: Math.round(duration) + " minutes allocated",
                    icon: "schedule",
                  },
                  {
                    label: "NETWORK UTILIZATION",
                    value: utilization.toFixed(1) + "%",
                    detail: rejected.length + " conflicts resolved",
                    icon: "monitor",
                  },
                ].map((s, i) => (
                  <div key={s.label} className="stat">
                    <div className="stat-label">
                      {s.label}
                      <Icon name={s.icon} />
                    </div>
                    <div className="stat-value">
                      {s.value}
                      <span
                        className={i === 3 ? "tiny-badge" : "tiny-badge subtle"}
                      >
                        {i === 3
                          ? "ALLOCATED"
                          : i === 2
                            ? "CONFIRMED"
                            : "CONFIGURED"}
                      </span>
                    </div>
                    <p>{s.detail}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "Overview" && (
            <>
              <div className="overview-grid">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <h2>
                      Orbital view <span className="pill">SGP4 REPLAY</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setTab("Monitoring")}
                    >
                      Open monitoring ↗
                    </button>
                  </div>
                  <MapView />
                  <div className="map-controls">
                    <button
                      className="play-button"
                      aria-label={playing ? "Pause replay" : "Play replay"}
                      onClick={() => setPlaying(!playing)}
                    >
                      {playing ? "Ⅱ" : "▶"}
                    </button>
                    <input
                      aria-label="Replay time"
                      type="range"
                      min="0"
                      max={hours * 60 - 1 / 3}
                      step={1 / 3}
                      value={minute}
                      onChange={(e) => setMinute(+e.target.value)}
                    />
                    <span className="mono">
                      {new Date(current).toISOString().slice(11, 19)}
                    </span>
                  </div>
                </section>
                <section className="panel station-summary">
                  <div className="panel-heading">
                    <h2>Ground network</h2>
                    <span className="pill green">
                      {config.stations.length} STATIONS
                    </span>
                  </div>
                  {config.stations.map((st) => {
                    const n = accepted.filter(
                      (p) => p.station === st.name,
                    ).length;
                    const mins = accepted
                      .filter((p) => p.station === st.name)
                      .reduce(
                        (n, p) =>
                          n + (Date.parse(p.los) - Date.parse(p.aos)) / 60000,
                        0,
                      );
                    return (
                      <div className="station-brief" key={st.name}>
                        <div className="station-brief-top">
                          <span className="station-symbol">
                            <Icon name="stations" />
                          </span>
                          <div>
                            <b>{st.name}</b>
                            <small>
                              {Math.abs(st.latitude).toFixed(2)}°
                              {st.latitude >= 0 ? "N" : "S"} ·{" "}
                              {Math.abs(st.longitude).toFixed(2)}°
                              {st.longitude >= 0 ? "E" : "W"}
                            </small>
                          </div>
                          <span className="station-status">
                            {config.maintenance.some(
                              (m) =>
                                m.station === st.name &&
                                Date.parse(m.start) <= current &&
                                Date.parse(m.end) > current,
                            )
                              ? "Maintenance"
                              : "Available"}
                          </span>
                        </div>
                        <div className="station-metrics">
                          <span>{n} contacts</span>
                          <span>
                            {st.antennas} antenna · {st.band}
                          </span>
                        </div>
                        <div className="progress">
                          <i
                            style={{
                              width:
                                Math.min(
                                  100,
                                  (mins / (hours * 60 * st.antennas)) * 100,
                                ) + "%",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <button
                    className="network-button"
                    onClick={() => setTab("Stations")}
                  >
                    Manage ground stations <span>→</span>
                  </button>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Resource timeline</h2>
                    <p>A conflict-free plan across the ground network</p>
                  </div>
                  <div className="legend">
                    {config.satellites.map((s, i) => (
                      <span key={s.name}>
                        <i style={{ background: colors[i % 3] }} />
                        {short(s.name)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="timeline-scroll">
                  <Timeline />
                </div>
              </section>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      Upcoming contacts{" "}
                      <span className="count">{upcoming.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => {
                        setFilter("Scheduled");
                        setTab("Schedule");
                      }}
                    >
                      View schedule →
                    </button>
                  </div>
                  <div className="contact-list">
                    {!upcoming.length && (
                      <div className="empty">
                        No remaining contacts in this replay window.
                      </div>
                    )}
                    {upcoming.slice(0, 4).map((p, i) => (
                      <button
                        key={i}
                        onClick={() => inspect(p)}
                        className="contact-item"
                      >
                        <span className="contact-time mono">
                          {clock(p.aos).slice(0, 5)}
                        </span>
                        <span
                          className="contact-line"
                          style={{
                            background:
                              colors[
                                config.satellites.findIndex(
                                  (s) => s.name === p.satellite,
                                ) % 3
                              ],
                          }}
                        />
                        <span>
                          <b>{p.satellite}</b>
                          <small>
                            {p.station} · Antenna {p.antenna} ·{" "}
                            {p.maxElevation.toFixed(0)}° max elevation
                          </small>
                        </span>
                        <span className="contact-duration">
                          {(
                            (Date.parse(p.los) - Date.parse(p.aos)) /
                            60000
                          ).toFixed(0)}{" "}
                          min <span>↗</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Scheduling decisions</h2>
                    <span className="pill amber">
                      {rejected.length} RESOLVED
                    </span>
                  </div>
                  <div className="decision-list">
                    {rejected.slice(0, 3).map((p, i) => (
                      <div key={i} className="decision">
                        <span className="decision-icon">!</span>
                        <div>
                          <b>{p.reason}</b>
                          <p>
                            {p.satellite} · {p.station}
                          </p>
                          <small>
                            {clock(p.aos).slice(0, 5)} UTC · Priority{" "}
                            {p.priority}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
          {tab === "Schedule" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Antenna allocation</h2>
                  <span className="pill green">Conflict-free reservations</span>
                </div>
                <div className="timeline-scroll">
                  <Timeline />
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    Communication windows{" "}
                    <span className="count">{filtered.length}</span>
                  </h2>
                  <div className="table-filters">
                    <select
                      aria-label="Pass status"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {["All passes", "Scheduled", "Conflicts"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Ground station filter"
                      value={stationFilter}
                      onChange={(e) => setStationFilter(e.target.value)}
                    >
                      {[
                        "All stations",
                        ...config.stations.map((s) => s.name),
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <PassTable />
              </section>
            </>
          )}
          {tab === "Missions" && (
            <>
              <div className="info-banner">
                <span>◎</span>
                <div>
                  <b>Orbit model with transparent scheduling</b>
                  <p>
                    Each mission uses TLE orbital elements, a frequency band,
                    and a priority from 1–10. Higher priorities reserve
                    resources first.
                  </p>
                </div>
              </div>
              <div className="mission-grid">
                {config.satellites.map((s, i) => (
                  <section className="panel mission-card" key={s.name}>
                    <div
                      className="mission-orbit"
                      style={{ color: colors[i % 3] }}
                    >
                      <Icon name="missions" />
                      <span className="orbit-ring" />
                      <span className="orbit-ring second" />
                    </div>
                    <div className="mission-card-body">
                      <div className="mission-meta">
                        <span className="pill">{s.band} BAND</span>
                        <span className="priority">P{s.priority}</span>
                      </div>
                      <h2>{s.name}</h2>
                      <p>Two-line orbital elements · SGP4 propagation</p>
                      <span className="pill mission-status">
                        {active.some((p) => p.satellite === s.name)
                          ? "IN CONTACT · REPLAY"
                          : upcoming.some((p) => p.satellite === s.name)
                            ? "AWAITING CONTACT"
                            : accepted.some((p) => p.satellite === s.name)
                              ? "CONTACTS COMPLETED · REPLAY"
                              : "UNSCHEDULED"}
                      </span>
                      <dl>
                        <div>
                          <dt>Scheduled contacts</dt>
                          <dd>
                            {
                              accepted.filter((p) => p.satellite === s.name)
                                .length
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>Allocation priority</dt>
                          <dd>{s.priority}/10</dd>
                        </div>
                        <div>
                          <dt>Propagation</dt>
                          <dd>SGP4 / SDP4</dd>
                        </div>
                      </dl>
                      <button
                        className="button secondary full"
                        onClick={() => edit("mission", i)}
                      >
                        Edit mission & TLE ↗
                      </button>
                      <button
                        className="text-button remove-record"
                        disabled={busy || config.satellites.length === 1}
                        onClick={() =>
                          persist({
                            ...config,
                            satellites: config.satellites.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        Remove mission
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              <section className="panel explanatory">
                <h2>How the planner works</h2>
                <div className="pipeline">
                  {[
                    [
                      "01",
                      "Predict visibility",
                      "Propagate TLEs and calculate station elevation, AOS, LOS and peak elevation.",
                    ],
                    [
                      "02",
                      "Allocate resources",
                      "Check frequency bands, maintenance, antenna capacity and mission priority.",
                    ],
                    [
                      "03",
                      "Monitor & replay",
                      "Inspect the approved contacts on a ground track and replay simulated telemetry.",
                    ],
                  ].map(([n, t, d]) => (
                    <div key={n}>
                      <span>{n}</span>
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          {tab === "Stations" && (
            <>
              <div className="station-grid">
                {config.stations.map((s, i) => (
                  <section className="panel station-card" key={s.name}>
                    <div className="panel-heading">
                      <span className="station-symbol">
                        <Icon name="stations" />
                      </span>
                      <span className="pill green">GROUND STATION</span>
                    </div>
                    <h2>{s.name}</h2>
                    <p>
                      {s.latitude.toFixed(4)}°, {s.longitude.toFixed(4)}°
                    </p>
                    <dl>
                      <div>
                        <dt>Antenna capacity</dt>
                        <dd>{s.antennas}</dd>
                      </div>
                      <div>
                        <dt>Frequency band</dt>
                        <dd>{s.band}</dd>
                      </div>
                      <div>
                        <dt>Minimum elevation</dt>
                        <dd>{s.minElevation}°</dd>
                      </div>
                      <div>
                        <dt>Scheduled contacts</dt>
                        <dd>
                          {accepted.filter((p) => p.station === s.name).length}
                        </dd>
                      </div>
                    </dl>
                    <button
                      className="button secondary full"
                      onClick={() => edit("station", i)}
                    >
                      Configure station ↗
                    </button>
                    <button
                      className="text-button remove-record"
                      disabled={busy || config.stations.length === 1}
                      onClick={() =>
                        persist({
                          ...config,
                          stations: config.stations.filter((_, j) => j !== i),
                          maintenance: config.maintenance.filter(
                            (m) => m.station !== s.name,
                          ),
                        })
                      }
                    >
                      Remove station
                    </button>
                  </section>
                ))}
              </div>
              <section className="panel maintenance">
                <div className="panel-heading">
                  <h2>Station maintenance</h2>
                  <span className="pill">UNAVAILABILITY WINDOWS</span>
                </div>
                <p>
                  Reserve downtime. Overlapping communication opportunities are
                  rejected automatically.
                </p>
                <div className="maintenance-form">
                  <label>
                    Ground station
                    <select
                      value={maintenanceStation}
                      onChange={(e) => setMaintenanceStation(e.target.value)}
                    >
                      {config.stations.map((s) => (
                        <option key={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Start · UTC
                    <input
                      aria-label="Maintenance start"
                      type="datetime-local"
                      value={maintStart}
                      onChange={(e) => setMaintStart(e.target.value)}
                    />
                  </label>
                  <label>
                    End · UTC
                    <input
                      aria-label="Maintenance end"
                      type="datetime-local"
                      value={maintEnd}
                      onChange={(e) => setMaintEnd(e.target.value)}
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => {
                      try {
                        persist({
                          ...config,
                          maintenance: [
                            ...config.maintenance,
                            {
                              station: maintenanceStation,
                              start: new Date(maintStart + "Z").toISOString(),
                              end: new Date(maintEnd + "Z").toISOString(),
                            },
                          ],
                        });
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    + Add maintenance
                  </button>
                </div>
                {config.maintenance.map((m, i) => (
                  <div className="maintenance-row" key={i}>
                    <span className="pill amber">MAINTENANCE</span>
                    <b>{m.station}</b>
                    <span>
                      {m.start.slice(0, 16).replace("T", " ")} →{" "}
                      {m.end.slice(0, 16).replace("T", " ")} UTC
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        persist({
                          ...config,
                          maintenance: config.maintenance.filter(
                            (_, j) => i !== j,
                          ),
                        })
                      }
                    >
                      Remove ×
                    </button>
                  </div>
                ))}
                {!config.maintenance.length && (
                  <div className="empty">
                    No maintenance windows. All stations are available for
                    scheduling.
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "Monitoring" && (
            <>
              <div className="monitor-header">
                <div>
                  <span className="pill green">ORBITAL REPLAY</span>
                  <b className="mono">
                    {new Date(current)
                      .toISOString()
                      .replace("T", " ")
                      .slice(0, 19)}{" "}
                    UTC
                  </b>
                </div>
                <span>
                  {active.length} scheduled contact
                  {active.length !== 1 ? "s" : ""} active at replay time
                </span>
              </div>
              <div className="monitor-grid">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <h2>Satellite ground tracks</h2>
                    <span className="pill">±60 MIN TRAIL</span>
                  </div>
                  {tracking.error && (
                    <div role="alert" className="error">
                      {tracking.error}
                    </div>
                  )}
                  <MapView large />
                  <div className="map-controls">
                    <button
                      className="play-button"
                      aria-label={playing ? "Pause replay" : "Play replay"}
                      onClick={() => setPlaying(!playing)}
                    >
                      {playing ? "Ⅱ" : "▶"}
                    </button>
                    <input
                      aria-label="Replay time"
                      type="range"
                      min="0"
                      max={hours * 60 - 1 / 3}
                      step={1 / 3}
                      value={minute}
                      onChange={(e) => setMinute(+e.target.value)}
                    />
                    <span className="mono">
                      {new Date(current).toISOString().slice(11, 19)}
                    </span>
                  </div>
                  <div className="tracking-positions">
                    {tracks.map((t, i) => (
                      <div key={t.satellite}>
                        <span
                          className="color-dot"
                          style={{ background: colors[i % 3] }}
                        />
                        <b>{short(t.satellite)}</b>
                        <span className="mono">
                          {t.latitude.toFixed(2)}°, {t.longitude.toFixed(2)}°
                        </span>
                        <small>{t.altitudeKm.toFixed(0)} km altitude</small>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel telemetry">
                  <div className="panel-heading">
                    <h2>Telemetry</h2>
                    <button className="text-button" onClick={captureTelemetry}>
                      Record snapshot
                    </button>
                    <span className="pill amber">SIMULATED</span>
                  </div>
                  {[
                    [
                      "Battery level",
                      currentTelemetry.battery.toFixed(1),
                      "%",
                      "#80f5c4",
                    ],
                    [
                      "Temperature",
                      currentTelemetry.temperature.toFixed(1),
                      "°C",
                      "#bba6ff",
                    ],
                    [
                      "Signal strength",
                      active.length
                        ? currentTelemetry.signal?.toFixed(1) || "—"
                        : "—",
                      "dBm",
                      "#ffca83",
                    ],
                  ].map(([label, value, unit, color], i) => (
                    <div className="telemetry-item" key={label}>
                      <small>{label}</small>
                      <strong>
                        {value}
                        <span>{unit}</span>
                      </strong>
                      <svg viewBox="0 0 240 38">
                        <path
                          d={Array.from(
                            { length: 40 },
                            (_, j) =>
                              (j ? "L" : "M") +
                              j * 6.1 +
                              "," +
                              (19 +
                                Math.sin(j * 0.4 + current / 200000 + i) * 10 +
                                Math.cos(j * 1.2) * 3),
                          ).join(" ")}
                          fill="none"
                          stroke={color}
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>
                  ))}
                </section>
              </div>
              {selected && (
                <section className="panel selected-pass">
                  <div>
                    <span className="eyebrow">
                      SELECTED COMMUNICATION WINDOW
                    </span>
                    <h2>
                      {selected.satellite} → {selected.station}
                    </h2>
                  </div>
                  <div>
                    <small>AOS / LOS · UTC</small>
                    <b className="mono">
                      {selected.aos.slice(0, 10)} · {clock(selected.aos)} →{" "}
                      {selected.los.slice(0, 10) !== selected.aos.slice(0, 10)
                        ? selected.los.slice(0, 10) + " · "
                        : ""}
                      {clock(selected.los)}
                    </b>
                  </div>
                  <div>
                    <small>Peak elevation</small>
                    <b>{selected.maxElevation.toFixed(1)}°</b>
                  </div>
                  <div>
                    <small>Rise / set azimuth</small>
                    <b>
                      {selected.riseAzimuth.toFixed(1)}° /{" "}
                      {selected.setAzimuth.toFixed(1)}°
                    </b>
                  </div>
                  <span
                    className={"pill " + (selected.antenna ? "green" : "amber")}
                  >
                    {selected.status}
                  </span>
                </section>
              )}
              <section className="panel">
                <div className="panel-heading">
                  <h2>Contacts at replay time</h2>
                </div>
                {active.length ? (
                  active.map((p, i) => (
                    <div className="maintenance-row" key={i}>
                      <span className="live-dot" />
                      <b>{p.satellite}</b>
                      <span>
                        {p.station} · Antenna {p.antenna}
                      </span>
                      <span className="pill green">ACTIVE IN REPLAY</span>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    No scheduled contact at this time. Select a pass from the
                    schedule or move the replay slider.
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "Reports" && (
            <>
              <div className="info-banner">
                <Icon name="schedule" />
                <div>
                  <b>Planning outcomes, with an audit trail</b>
                  <p>
                    Last 25 generated plans and 100 manually recorded telemetry
                    snapshots. Allocation rate describes scheduling outcomes; it
                    is not a measured mission success rate.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    const u = URL.createObjectURL(
                      new Blob([JSON.stringify(history, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const a = document.createElement("a");
                    a.href = u;
                    a.download = "mission-history.json";
                    a.click();
                    URL.revokeObjectURL(u);
                    notify("Activity history exported");
                  }}
                >
                  ↓ Export history
                </button>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Generated plan history</h2>
                  <span className="pill">
                    {history.plans.length} SAVED PLANS
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>GENERATED · UTC</th>
                        <th>PLANNING START · UTC</th>
                        <th>HORIZON</th>
                        <th>ALLOCATED / CANDIDATES</th>
                        <th>ALLOCATION RATE</th>
                        <th>UTILIZATION</th>
                        <th>CONFLICTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.plans.map((r) => (
                        <tr key={r.id}>
                          <td>
                            {r.generatedAt.replace("T", " ").slice(0, 19)}
                          </td>
                          <td>{r.start.replace("T", " ").slice(0, 16)}</td>
                          <td>{r.hours} h</td>
                          <td>
                            {r.scheduled} / {r.candidates}
                          </td>
                          <td>
                            {r.candidates
                              ? ((100 * r.scheduled) / r.candidates).toFixed(1)
                              : "0.0"}
                            %
                          </td>
                          <td>{r.utilization.toFixed(1)}%</td>
                          <td>{r.conflicts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {history.plans[0] && (
                <div className="bottom-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Latest station utilization</h2>
                    </div>
                    {history.plans[0].stations.map((s) => (
                      <div key={s.name} className="maintenance-row">
                        <b>{s.name}</b>
                        <span>{s.scheduled} scheduled contacts</span>
                        <span className="mono">
                          {s.utilization.toFixed(1)}% utilization
                        </span>
                      </div>
                    ))}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Latest mission outcomes</h2>
                    </div>
                    {history.plans[0].missions.map((m) => (
                      <div key={m.name} className="maintenance-row">
                        <b>{m.name}</b>
                        <span>
                          {m.scheduled} allocated · {m.rejected} rejected
                        </span>
                      </div>
                    ))}
                  </section>
                </div>
              )}
              <section className="panel">
                <div className="panel-heading">
                  <h2>Telemetry log</h2>
                  <span className="pill amber">
                    SIMULATED · {history.telemetry.length} SNAPSHOTS
                  </span>
                </div>
                {!history.telemetry.length ? (
                  <div className="empty">
                    Use Record snapshot in Monitoring to save replay telemetry.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>REPLAY TIME · UTC</th>
                          <th>BATTERY</th>
                          <th>TEMPERATURE</th>
                          <th>SIGNAL</th>
                          <th>TRACKING SESSIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.telemetry.map((t, i) => (
                          <tr key={t.recordedAt + i}>
                            <td>{t.time.replace("T", " ").slice(0, 19)}</td>
                            <td>{t.battery.toFixed(1)}%</td>
                            <td>{t.temperature.toFixed(1)}°C</td>
                            <td>
                              {t.signal === null
                                ? "No active contact"
                                : t.signal.toFixed(1) + " dBm"}
                            </td>
                            <td>
                              {t.contacts.length
                                ? t.contacts
                                    .map(
                                      (c) =>
                                        c.satellite +
                                        " → " +
                                        c.station +
                                        " / Antenna " +
                                        c.antenna,
                                    )
                                    .join("; ")
                                : "No scheduled session at replay time"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
          <footer>
            <span>
              <span className="live-dot" />{" "}
              {browserDemo
                ? "Browser demo · local configuration"
                : "Java mission planning service"}
            </span>
            <span>
              Historical TLE fixture · Simulated telemetry · Priority-based
              scheduling
            </span>
          </footer>
        </main>
      </div>
      {editing && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!busy) {
              setEditing(null);
              setError("");
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={
              editing.index === -1
                ? editing.kind === "mission"
                  ? "Register mission"
                  : "Register station"
                : editing.kind === "mission"
                  ? "Edit mission"
                  : "Configure station"
            }
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <h2>
                {editing.index === -1
                  ? editing.kind === "mission"
                    ? "Register mission"
                    : "Register station"
                  : editing.kind === "mission"
                    ? "Edit mission"
                    : "Configure station"}
              </h2>
              <button
                className="icon-button"
                aria-label="Close dialog"
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-fields">
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <label>
                Name
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              {editing.kind === "mission" ? (
                <>
                  <div className="field-pair">
                    <label>
                      Mission priority
                      <input
                        aria-label="Mission priority"
                        type="number"
                        min="1"
                        max="10"
                        value={draft.priority}
                        onChange={(e) =>
                          setDraft({ ...draft, priority: +e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Frequency band
                      <select
                        value={draft.band}
                        onChange={(e) =>
                          setDraft({ ...draft, band: e.target.value })
                        }
                      >
                        {["UHF", "VHF", "S", "X"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    TLE · Line 1
                    <textarea
                      rows={2}
                      value={draft.line1}
                      onChange={(e) =>
                        setDraft({ ...draft, line1: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    TLE · Line 2
                    <textarea
                      rows={2}
                      value={draft.line2}
                      onChange={(e) =>
                        setDraft({ ...draft, line2: e.target.value })
                      }
                    />
                  </label>
                  <p className="form-help">
                    The sample missions share a historical reference orbit to
                    make resource competition visible.
                  </p>
                </>
              ) : (
                <>
                  <div className="field-pair">
                    {[
                      ["Latitude", "latitude"],
                      ["Longitude", "longitude"],
                      ["Altitude · metres", "altitude"],
                      ["Minimum elevation · degrees", "minElevation"],
                      ["Antennas", "antennas"],
                    ].map(([label, key]) => (
                      <label key={key}>
                        {label}
                        <input
                          aria-label={label}
                          type="number"
                          value={draft[key]}
                          onChange={(e) =>
                            setDraft({ ...draft, [key]: +e.target.value })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Frequency band
                      <select
                        value={draft.band}
                        onChange={(e) =>
                          setDraft({ ...draft, band: e.target.value })
                        }
                      >
                        {["UHF", "VHF", "S", "X"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => {
                  const c = structuredClone(config);
                  if (editing.kind === "mission") {
                    if (editing.index === -1)
                      c.satellites.push(draft as Satellite);
                    else c.satellites[editing.index] = draft as Satellite;
                  } else {
                    if (editing.index === -1) c.stations.push(draft as Station);
                    else {
                      const old = c.stations[editing.index].name;
                      c.stations[editing.index] = draft as Station;
                      c.maintenance = c.maintenance.map((m) =>
                        m.station === old ? { ...m, station: draft.name } : m,
                      );
                    }
                  }
                  persist(c);
                }}
              >
                {busy ? "Recalculating…" : "Save & recalculate"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
