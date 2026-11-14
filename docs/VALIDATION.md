# Validation

Validated using Java 17 compiler, Java 21 runtime, Maven 3.9.9, Node 24 and Chromium.

- Five JUnit tests: passed, zero failures/errors.
- Frontend TypeScript check and Vite production build: passed.
- Executable JAR: starts successfully and serves the dashboard at localhost:8080.
- Default 24-hour plan: 28 visibility windows, 14 accepted, 14 rejected.
- REST: configuration read/write, schedule generation, replay telemetry: passed.
- Invalid 100-hour horizon: HTTP 400.
- Headless Chromium: generated schedule, opened pass replay and configuration; no browser page errors.
- SGP4 epoch position checked against the public Vanguard 1 Vallado reference with 20-metre tolerance. This does not validate the station visibility approximation or operational prediction accuracy.

The screenshot in this directory comes from the packaged application, not a mockup.
