# Verification

Run `npm test --prefix frontend` and `mvn test`.

## Automated coverage

**21 frontend tests** (9 interaction scenarios, 12 engine/data tests):

- All six screens and their navigation.
- Visibility windows, AOS/LOS, elevation, azimuth, positive duration and ground-track changes.
- Priority changes, antenna capacity, same-mission overlap prevention, maintenance, band compatibility and interval boundaries.
- Mission registration, priority editing, deletion, invalid TLE feedback and dialog dismissal.
- Station registration, renaming, deletion and maintenance-reference migration.
- Invalid antenna capacity and maintenance intervals; invalid edits leave saved data unchanged.
- Planning changes remain drafts until a successful generation. Empty planning dates are rejected without breaking the displayed plan.
- Replay play/pause, selected pass geometry, active-session telemetry and stale-selection cleanup.
- Filtered CSV export with azimuth, duration and priority.
- Configuration restoration and recovery from malformed local storage.
- Empty-result schedules, bounded history, plan reports and simulated telemetry snapshots.

**8 Java tests** (5 orbital/scheduling tests, 3 API integration tests):

- Published Vallado epoch position within 20 metres; this does not certify pass-prediction accuracy.
- Visibility and conflict-free allocations, priority winners, back-to-back boundaries, maintenance and band incompatibility.
- Input validation including empty registries and invalid planning horizons.
- POST planning computes candidate configuration without mutating saved configuration.
- GET/PUT history persistence and invalid-shape rejection.

Production TypeScript/Vite builds are checked in both Java-service and standalone-browser modes. GitHub Actions runs frontend and Java tests before packaging the executable.

## Visual verification boundary

The managed environment has no desktop JavaScript/browser-control tool in this session. Interaction tests use React Testing Library in jsdom; they do not establish real-browser layout, rendering or device compatibility. No screenshot-based visual approval is claimed. The SVG background parses as valid XML and is bundled locally for offline use.

## Model boundaries

Historical demonstration TLEs, approximate 20-second visibility sampling, simplified Earth-orientation handling and synthetic telemetry remain explicitly labelled. Reports show allocation rate and resource utilization, not measured mission success. Java and browser propagation may differ slightly. No operational spacecraft-control claims are made.
