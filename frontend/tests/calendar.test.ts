import { expect, it } from "vitest";
import { planCalendar } from "../src/calendar";
import type { Pass } from "../src/engine";

it("exports booked contacts as UTC events with escaped and folded text", () => {
  const pass: Pass = {
    satellite: "Mission; A, B",
    station: "東京".repeat(15),
    aos: "2000-06-28T23:59:40Z",
    los: "2000-06-29T00:05:20Z",
    maxElevation: 19.3,
    riseAzimuth: 217,
    setAzimuth: 50,
    priority: 9,
    band: "UHF",
    antenna: 2,
    status: "Scheduled",
    reason: "",
  };
  const date = new Date("2000-06-28T10:00:00Z");
  const calendar = planCalendar([pass, { ...pass, satellite: "Conflict", antenna: 0 }], date);
  const unfolded = calendar.replaceAll("\r\n ", "");
  expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(calendar.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(unfolded).toContain("DTSTAMP:20000628T100000Z\r\n");
  expect(unfolded).toContain("DTSTART:20000628T235940Z\r\nDTEND:20000629T000520Z");
  expect(unfolded).toContain(`SUMMARY:Mission\\; A\\, B · ${pass.station}\r\n`);
  expect(unfolded).toContain(`LOCATION:${pass.station} · Antenna 2\r\n`);
  expect(unfolded).toContain("DESCRIPTION:Band: UHF\\nPriority: 9\\nPeak elevation: 19.3°");
});
