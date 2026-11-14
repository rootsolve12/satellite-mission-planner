package edu.simats.planner;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;

class PlannerTest {
  final Planner planner = new Planner();

  Planner.Config demo() throws Exception {
    return new ObjectMapper()
        .readValue(getClass().getResourceAsStream("/demo.json"), Planner.Config.class);
  }

  Planner.Pass pass(String name, int priority, String start, String end) {
    return new Planner.Pass(
        name, "Chennai", start, end, 45, 90, 270, priority, "UHF", 0, "CANDIDATE", "");
  }

  @Test
  void predictsFinitePassesAndNoAcceptedConflicts() throws Exception {
    var c = demo();
    var candidates = planner.predict(c, "2000-06-28T00:00:00Z", 24);
    assertFalse(candidates.isEmpty());
    var result = planner.schedule(c, candidates);
    assertTrue(result.stream().anyMatch(p -> p.antenna() == 0));
    var accepted = result.stream().filter(p -> p.antenna() > 0).toList();
    assertFalse(accepted.isEmpty());
    for (var a : accepted) {
      assertTrue(a.maxElevation() >= 10 && a.maxElevation() <= 90);
      for (var b : accepted)
        if (a != b
            && ((a.station().equals(b.station()) && a.antenna() == b.antenna())
                || a.satellite().equals(b.satellite())))
          assertFalse(Planner.overlaps(a.aos(), a.los(), b.aos(), b.los()));
    }
  }

  @Test
  void priorityAndHalfOpenBoundaries() throws Exception {
    var c = demo();
    var a = pass("low", 1, "2000-06-28T01:00:00Z", "2000-06-28T01:10:00Z");
    var b = pass("high", 9, a.aos(), a.los());
    var d = pass("next", 1, a.los(), "2000-06-28T01:20:00Z");
    var out = planner.schedule(c, List.of(a, b, d));
    assertEquals(
        0,
        out.stream().filter(p -> p.satellite().equals("low")).findFirst().orElseThrow().antenna());
    assertEquals(2, out.stream().filter(p -> p.antenna() > 0).count());
  }

  @Test
  void maintenanceAndBandReject() throws Exception {
    var c = demo();
    var a = pass("test", 5, "2000-06-28T01:00:00Z", "2000-06-28T01:10:00Z");
    var blocked =
        new Planner.Config(
            c.satellites(),
            c.stations(),
            List.of(new Planner.Maintenance("Chennai", a.aos(), a.los())));
    assertEquals("Station maintenance", planner.schedule(blocked, List.of(a)).get(0).reason());
    var st = c.stations().get(0);
    var mismatch =
        new Planner.Config(
            c.satellites(),
            List.of(new Planner.Station(st.name(), st.latitude(), st.longitude(), 0, 10, 1, "S")),
            List.of());
    assertEquals(
        "Incompatible frequency band", planner.schedule(mismatch, List.of(a)).get(0).reason());
  }

  @Test
  void rejectsInvalidHorizonAndCoordinates() throws Exception {
    var c = demo();
    assertThrows(
        IllegalArgumentException.class, () -> planner.predict(c, "2000-06-28T00:00:00Z", 100));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            planner.validate(
                new Planner.Config(
                    c.satellites(),
                    List.of(new Planner.Station("bad", 100, 0, 0, 10, 1, "UHF")),
                    List.of())));
  }

  @Test
  void matchesPublishedValladoEpochPosition() throws Exception {
    var s = demo().satellites().get(0);
    var tle = new org.orekit.propagation.analytical.tle.TLE(s.line1(), s.line2());
    var p =
        org.orekit.propagation.analytical.tle.TLEPropagator.selectExtrapolator(tle)
            .getPVCoordinates(tle.getDate(), org.orekit.frames.FramesFactory.getTEME())
            .getPosition();
    assertEquals(7022465.29266, p.getX(), 20);
    assertEquals(-1400082.96755, p.getY(), 20);
    assertEquals(39.95155, p.getZ(), 20);
  }
}
