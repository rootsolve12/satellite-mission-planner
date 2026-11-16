import { it, expect, vi } from "vitest";
import {
  render,
  screen,
  within,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/main";
import { copyInitial, predict, EPOCH } from "../src/engine";
async function ready() {
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: /Generate schedule/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  return user;
}
const saved = () => JSON.parse(localStorage.getItem("orbit-config-v2")!);
async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Save & recalculate" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
it("navigates all screens, filters contacts and exports only visible records", async () => {
  const user = await ready();
  for (const [nav, title] of [
    ["Mission planning", "Mission planning"],
    ["Ground stations", "Ground station network"],
    ["Monitoring", "Mission monitoring"],
    ["Reports", "Reports & activity history"],
    ["Overview", "Mission overview"],
  ]) {
    await user.click(screen.getByRole("button", { name: nav, exact: true }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
  }
  await user.click(screen.getByRole("button", { name: /Pass schedule/ }));
  await user.selectOptions(screen.getByLabelText("Pass status"), "Conflicts");
  await user.selectOptions(
    screen.getByLabelText("Ground station filter"),
    "Chennai",
  );
  const rows = screen.getAllByRole("row").slice(1);
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every(
      (r) =>
        r.textContent!.includes("Chennai") &&
        r.textContent!.includes("Conflict"),
    ),
  ).toBe(true);
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: /Export schedule/ }));
  expect(click).toHaveBeenCalled();
  expect(URL.createObjectURL).toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("exported");
});
it("keeps draft planning windows separate, rejects an empty date, applies horizon and resets", async () => {
  const user = await ready();
  const original = screen.getByLabelText("Replay time").getAttribute("max");
  await user.selectOptions(screen.getByLabelText("Planning horizon"), "6");
  expect(screen.getByRole("status").textContent).toContain(
    "displayed plan and replay still use",
  );
  expect(screen.getByLabelText("Replay time").getAttribute("max")).toBe(
    original,
  );
  fireEvent.change(screen.getByLabelText("Planning start"), {
    target: { value: "" },
  });
  await user.click(screen.getByRole("button", { name: /Generate schedule/ }));
  expect((await screen.findByRole("alert")).textContent).toContain("valid UTC");
  expect(screen.getByLabelText("Replay time").getAttribute("max")).toBe(
    original,
  );
  fireEvent.change(screen.getByLabelText("Planning start"), {
    target: { value: EPOCH },
  });
  await user.click(screen.getByRole("button", { name: /Generate schedule/ }));
  await waitFor(() =>
    expect(
      Number(screen.getByLabelText("Replay time").getAttribute("max")),
    ).toBeLessThan(360),
  );
  await user.click(screen.getByRole("button", { name: /Reset demo/ }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Planning horizon") as HTMLSelectElement).value,
    ).toBe("24"),
  );
});
it("registers and removes missions, persists priority changes, and exposes validation in the dialog", async () => {
  const user = await ready();
  await user.click(
    screen.getByRole("button", { name: "Mission planning", exact: true }),
  );
  await user.click(
    screen.getAllByRole("button", { name: /Edit mission & TLE/ })[2],
  );
  await user.clear(screen.getByLabelText("Mission priority"));
  await user.type(screen.getByLabelText("Mission priority"), "10");
  await save(user);
  expect(saved().satellites[2].priority).toBe(10);
  expect(
    predict(saved(), EPOCH + "Z", 24).some(
      (p) => p.satellite.includes("Relay") && p.antenna,
    ),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: /Register mission/ }));
  await save(user);
  expect(saved().satellites).toHaveLength(4);
  const card = screen
    .getByRole("heading", { name: "Mission 4" })
    .closest("section")!;
  await user.click(
    within(card).getByRole("button", { name: "Remove mission" }),
  );
  await waitFor(() => expect(saved().satellites).toHaveLength(3));
  await user.click(
    screen.getAllByRole("button", { name: /Edit mission & TLE/ })[0],
  );
  await user.clear(screen.getByLabelText("TLE · Line 1"));
  await user.type(screen.getByLabelText("TLE · Line 1"), "invalid");
  await user.click(screen.getByRole("button", { name: "Save & recalculate" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("alert").textContent,
  ).toContain("TLE");
  expect(saved().satellites[0].line1).toBe(copyInitial().satellites[0].line1);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("adds maintenance, preserves it on station rename, and cleans it up on removal", async () => {
  const user = await ready();
  await user.click(
    screen.getByRole("button", { name: "Ground stations", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Maintenance end"), {
    target: { value: "2000-06-29T00:00" },
  });
  await user.click(screen.getByRole("button", { name: /Add maintenance/ }));
  await waitFor(() => expect(saved().maintenance).toHaveLength(1));
  expect(
    predict(saved(), EPOCH + "Z", 24)
      .filter((p) => p.station === "Chennai")
      .every((p) => !p.antenna),
  ).toBe(true);
  await user.click(
    screen.getAllByRole("button", { name: /Configure station/ })[0],
  );
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Chennai East");
  await save(user);
  expect(saved().maintenance[0].station).toBe("Chennai East");
  await user.click(
    screen.getAllByRole("button", { name: "Remove station" })[0],
  );
  await waitFor(() => expect(saved().stations).toHaveLength(2));
  expect(saved().maintenance).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: /Register station/ }));
  await save(user);
  expect(saved().stations).toHaveLength(3);
});
it("rejects fractional antenna counts without mutating saved configuration", async () => {
  const user = await ready();
  await user.click(
    screen.getByRole("button", { name: "Ground stations", exact: true }),
  );
  await user.click(
    screen.getAllByRole("button", { name: /Configure station/ })[0],
  );
  fireEvent.change(screen.getByLabelText("Antennas"), {
    target: { value: "1.5" },
  });
  await user.click(screen.getByRole("button", { name: "Save & recalculate" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("alert").textContent,
  ).toContain("whole antennas");
  expect(saved().stations[0].antennas).toBe(1);
});
it("inspects active pass geometry, replays, records telemetry and clears stale selection on recalculation", async () => {
  const user = await ready();
  await user.click(screen.getByRole("button", { name: /Pass schedule/ }));
  await user.selectOptions(screen.getByLabelText("Pass status"), "Scheduled");
  await user.click(screen.getByRole("button", { name: "View pass 0" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Mission monitoring",
  );
  expect(screen.getByText("Rise / set azimuth")).toBeTruthy();
  expect(screen.getAllByText("ACTIVE IN REPLAY").length).toBeGreaterThan(0);
  const before = Number(
    (screen.getByLabelText("Replay time") as HTMLInputElement).value,
  );
  await user.click(screen.getByRole("button", { name: "Play replay" }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 800));
  });
  expect(
    Number((screen.getByLabelText("Replay time") as HTMLInputElement).value),
  ).toBeGreaterThan(before);
  await user.click(screen.getByRole("button", { name: "Pause replay" }));
  await user.click(screen.getByRole("button", { name: "Record snapshot" }));
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem("orbit-history-v1")!).telemetry,
    ).toHaveLength(1),
  );
  await user.click(
    screen.getByRole("button", { name: "Reports", exact: true }),
  );
  expect(screen.getByRole("heading", { name: "Telemetry log" })).toBeTruthy();
  expect(
    screen.queryByText(
      "Use Record snapshot in Monitoring to save replay telemetry.",
    ),
  ).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Monitoring", exact: true }),
  );
  await user.click(screen.getByRole("button", { name: /Generate schedule/ }));
  await waitFor(() =>
    expect(screen.queryByText("SELECTED COMMUNICATION WINDOW")).toBeNull(),
  );
});
it("restores saved configuration across a new session and retains reports", async () => {
  const c = copyInitial();
  c.stations[0].antennas = 2;
  localStorage.setItem("orbit-config-v2", JSON.stringify(c));
  await ready();
  expect(saved().stations[0].antennas).toBe(2);
  expect(
    JSON.parse(localStorage.getItem("orbit-history-v1")!).plans.length,
  ).toBe(1);
});
it("saves an empty-result plan and renders a useful empty state", async () => {
  const c = copyInitial();
  c.stations.forEach((s) => (s.minElevation = 89.99));
  localStorage.setItem("orbit-config-v2", JSON.stringify(c));
  const user = await ready();
  await user.click(screen.getByRole("button", { name: /Pass schedule/ }));
  expect(screen.getByText("No passes match these filters.")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: /Export schedule/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.click(
    screen.getByRole("button", { name: "Reports", exact: true }),
  );
  expect(
    screen.getByRole("heading", { name: "Generated plan history" }),
  ).toBeTruthy();
  expect(
    JSON.parse(localStorage.getItem("orbit-history-v1")!).plans[0].candidates,
  ).toBe(0);
});
it("handles invalid maintenance without saving it, then removes a valid window", async () => {
  const user = await ready();
  await user.click(
    screen.getByRole("button", { name: "Ground stations", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Maintenance end"), {
    target: { value: "2000-06-27T00:00" },
  });
  await user.click(screen.getByRole("button", { name: /Add maintenance/ }));
  expect((await screen.findByRole("alert")).textContent).toContain("end after");
  expect(saved().maintenance).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Maintenance end"), {
    target: { value: "2000-06-28T06:00" },
  });
  await user.click(screen.getByRole("button", { name: /Add maintenance/ }));
  await waitFor(() => expect(saved().maintenance).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Remove ×" }));
  await waitFor(() => expect(saved().maintenance).toHaveLength(0));
});
