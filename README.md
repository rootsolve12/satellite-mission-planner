# Satellite Mission Planning & Ground Station Management

**Predict → Schedule → Monitor.** An interactive orbital operations dashboard with an executable Java backend and a standalone browser demo.

## Demo

[Open the interactive demo](https://orbit-operations-mission-demo.exuberantkangaroo.chatgpt.site)


The interface includes a global ground-track map, antenna allocation timeline, editable missions and ground stations, maintenance windows, conflict reasons, schedule CSV export, and telemetry replay.

1. Open the Overview: a 24-hour sample schedule is generated automatically.
2. Use Mission planning → Edit mission to change a priority. Save and recalculate to compare allocation winners.
3. Use Ground stations to change antenna capacity, frequency bands or minimum elevation; add maintenance to block a station.
4. Use Pass schedule to filter conflicts or scheduled passes and select a contact.
5. In Monitoring, play or scrub the orbital replay and inspect the selected session.
6. Reset demo restores the sample configuration.

The sample uses three mission identities on the historical Vanguard reference orbit to make resource competition visible. Stations are Chennai, Canberra and Madrid. Start at **28 June 2000** to match the supplied orbital elements. These are demonstration missions, not live satellite operations.

## Run the executable

Install Java 17+, download and extract the ZIP from Releases, and open `run.bat` on Windows or execute `sh run.sh` on macOS/Linux. Visit http://localhost:8080. No Node, Maven or external database is required to run the JAR.

Configuration persists in the local `data/` directory. Use Reset demo to restore the sample network. Keep the terminal open; Ctrl+C stops the service.

## Architecture

| Capability | Java application | Hosted browser demo |
| --- | --- | --- |
| Frontend | React + TypeScript, served by Spring Boot | Same React interface, static hosting |
| Orbit engine | Orekit TLE propagation | satellite.js SGP4/SDP4 |
| Scheduling | Java priority-first scheduler | Equivalent browser scheduler |
| Configuration | Durable embedded H2 database | Browser localStorage |
| Ground tracks | satellite.js in the interface | satellite.js in the interface |
| Telemetry | Synthetic replay in interface | Synthetic replay in interface |

The browser demo works independently of the Java server. It is an interactive implementation, not prerecorded screenshots. Local browser changes stay in that browser. Java changes are saved through the REST API.

## Scheduling rules

Sort communication windows by descending mission priority, then AOS and mission name. Allocate the first compatible available antenna for the entire pass. Reject frequency incompatibility, station maintenance, antenna overlaps and simultaneous station use by the same mission. Intervals are half-open, allowing back-to-back bookings. Rejections expose the reason behind each decision. This is a deterministic greedy heuristic, not a globally optimal solver.

## Build

Prerequisites: Java 17+, Maven 3.9+, Node 20.19+ or 22.12+.

```sh
sh build.sh
java -jar target/satellite-mission-planner-2.0.0.jar
```

For the standalone browser edition:

```sh
cd frontend
npm ci
VITE_DEMO_MODE=true npm run build
```

Serve `frontend/dist/` using a static host. For Java, build without `VITE_DEMO_MODE` and copy frontend output into `src/main/resources/static/` (handled by build.sh).

## API

- `GET /api/config` — missions, stations and maintenance.
- `PUT /api/config` — validated configuration replacement.
- `GET /api/plan?start=2000-06-28T00:00:00Z&hours=24` — predicted windows and allocation decisions.
- `GET /api/monitor?time=2000-06-28T01:00:00Z` — propagated positions and synthetic telemetry.

## Model boundaries

Visibility uses 20-second sampling. AOS, LOS and peak elevation are approximate; windows at the horizon boundary are clipped. The Java frame uses simplified Earth-orientation handling. Browser and Java predictions can differ slightly due to frame and numerical implementations. Updating the TLE requires choosing a matching date. No orbital accuracy certification is claimed.

Battery, temperature and signal are simulated. Signal appears only during a scheduled replay contact. The application does not connect to spacecraft. Frequency bands are compatibility labels; RF link budgets, antenna slew, partial contacts, continuous tracking streams, authentication and long-term alert histories are outside this demo. Three sample missions share an orbit intentionally; real missions should have distinct orbital elements. Limits: 20 missions/stations in the Java API, 72-hour plans, 1–10 antennas per station.

## Validation and attribution

Java tests cover published Vallado epoch position, visibility generation, conflict-free reservations, priority, boundaries, maintenance, band compatibility and invalid input. Browser engine checks cover prediction, non-overlap, priority changes, maintenance, incompatible bands, ground-track generation and validation. TypeScript and production builds run during verification.

Orekit and Spring Boot: Apache-2.0. React, Vite and satellite.js: MIT. H2: MPL-2.0/EPL-1.0. Dependencies retain their original notices. World outline: Natural Earth public-domain country boundaries via datasets/geo-countries. Leap-second data: https://maia.usno.navy.mil/ser7/tai-utc.dat . Reference TLE: Vallado et al., https://celestrak.org/publications/AIAA/2006-6753/ .
