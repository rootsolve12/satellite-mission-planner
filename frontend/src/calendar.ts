import type { Pass } from "./engine";

const encoder = new TextEncoder();
const utc = (value: string) =>
  new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, "");

function escapeText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function foldLine(line: string) {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let part = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      parts.push(part);
      part = " ";
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  return [...parts, part].join("\r\n");
}

export function planCalendar(passes: Pass[], exportedAt = new Date()) {
  const stamp = utc(exportedAt.toISOString());
  const events = passes.filter((p) => p.antenna > 0).flatMap((p) => {
    const start = utc(p.aos);
    const uid = [p.satellite, p.station, start]
      .map(encodeURIComponent)
      .join("/");
    return [
      "BEGIN:VEVENT",
      `UID:${uid}@satellite-mission-planner`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${utc(p.los)}`,
      `SUMMARY:${escapeText(`${p.satellite} · ${p.station}`)}`,
      `LOCATION:${escapeText(`${p.station} · Antenna ${p.antenna}`)}`,
      `DESCRIPTION:${escapeText(
        `Band: ${p.band}\nPriority: ${p.priority}\nPeak elevation: ${p.maxElevation.toFixed(1)}°`,
      )}`,
      "END:VEVENT",
    ];
  });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Satellite Mission Planner//Pass Schedule//EN",
    ...events,
    "END:VCALENDAR",
    "",
  ].map(foldLine).join("\r\n");
}
