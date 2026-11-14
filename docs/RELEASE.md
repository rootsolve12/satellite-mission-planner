Executable classroom demo based on the CSA0923 capstone presentation.

Download and extract **satellite-mission-planner-demo.zip**, install Java 17+, and run `run.bat` (Windows) or `sh run.sh` (macOS/Linux). Open http://localhost:8080.

Includes:
- Spring Boot executable JAR with bundled React dashboard
- Orekit SGP4/SDP4 pass prediction using historical demonstration TLEs
- Priority-based antenna scheduling, maintenance and compatibility checks
- Orbital position replay, simulated telemetry and CSV export
- Setup instructions and a five-minute classroom presentation guide

Validation: five passing JUnit tests, including published SGP4 reference position; successful TypeScript/Vite build, API smoke checks and Chromium end-to-end flow. Default scenario produces 28 windows, 14 scheduled and 14 rejected.

This is a local teaching simulator with approximate visibility timing and synthetic telemetry. The README explains differences from the proposed production architecture.
