package io.orbit.planner;

import java.util.*;
import org.orekit.bodies.*;
import org.orekit.data.*;
import org.orekit.frames.*;
import org.orekit.propagation.analytical.tle.*;
import org.orekit.time.*;
import org.orekit.utils.*;
import org.springframework.stereotype.Service;

@Service
public class Planner {
  public record Satellite(String name, String line1, String line2, int priority, String band) {}

  public record Station(
      String name,
      double latitude,
      double longitude,
      double altitude,
      double minElevation,
      int antennas,
      String band) {}

  public record Maintenance(String station, String start, String end) {}

  public record Config(
      List<Satellite> satellites, List<Station> stations, List<Maintenance> maintenance) {}

  public record Pass(
      String satellite,
      String station,
      String aos,
      String los,
      double maxElevation,
      double riseAzimuth,
      double setAzimuth,
      int priority,
      String band,
      int antenna,
      String status,
      String reason) {}

  private final TimeScale utc;
  private final OneAxisEllipsoid earth;

  public Planner() {
    DataContext.getDefault()
        .getDataProvidersManager()
        .addProvider(new ClasspathCrawler("orekit/tai-utc.dat"));
    utc = TimeScalesFactory.getUTC();
    // TEME -> PEF rotation without EOP downloads: a simplified demonstration frame.
    earth =
        new OneAxisEllipsoid(
            Constants.WGS84_EARTH_EQUATORIAL_RADIUS,
            Constants.WGS84_EARTH_FLATTENING,
            FramesFactory.getGTOD(false));
  }

  AbsoluteDate date(String s) {
    return new AbsoluteDate(s, utc);
  }

  String iso(AbsoluteDate d) {
    return d.toString(utc) + "Z";
  }

  public void validate(Config c) {
    if (c == null || c.satellites() == null || c.stations() == null || c.maintenance() == null)
      throw new IllegalArgumentException("All configuration lists are required");
    if (c.satellites().isEmpty() || c.stations().isEmpty())
      throw new IllegalArgumentException("Keep at least one mission and station");
    if (c.satellites().size() > 20 || c.stations().size() > 20)
      throw new IllegalArgumentException("Demo limit: 20 satellites and stations");
    Set<String> names = new HashSet<>();
    for (var s : c.satellites()) {
      if (s == null) throw new IllegalArgumentException("Mission data is required");
      if (s == null
          || s.name() == null
          || s.name().isBlank()
          || !names.add(s.name().trim().toLowerCase(java.util.Locale.ROOT))
          || s.priority() < 1
          || s.priority() > 10
          || s.band() == null
          || s.band().isBlank())
        throw new IllegalArgumentException(
            "Unique satellite names, band and priority 1–10 required");
      if (s.line1() == null || s.line2() == null || !TLE.isFormatOK(s.line1(), s.line2()))
        throw new IllegalArgumentException("TLE format or checksum is invalid");
      new TLE(s.line1(), s.line2(), utc);
    }
    names.clear();
    for (var s : c.stations())
      if (s == null
          || s.name() == null
          || s.name().isBlank()
          || !names.add(s.name().trim().toLowerCase(java.util.Locale.ROOT))
          || !Double.isFinite(s.latitude())
          || Math.abs(s.latitude()) > 90
          || !Double.isFinite(s.longitude())
          || Math.abs(s.longitude()) > 180
          || !Double.isFinite(s.altitude())
          || s.altitude() < 0
          || !Double.isFinite(s.minElevation())
          || s.minElevation() < 0
          || s.minElevation() >= 90
          || s.antennas() < 1
          || s.antennas() > 10
          || s.band() == null
          || s.band().isBlank())
        throw new IllegalArgumentException(
            "Invalid station coordinates, elevation, band or antenna count");
    for (var m : c.maintenance())
      if (m == null
          || !c.stations().stream().anyMatch(st -> st.name().equals(m.station()))
          || date(m.end()).compareTo(date(m.start())) <= 0)
        throw new IllegalArgumentException("Maintenance needs a known station and end after start");
  }

  public List<Pass> predict(Config c, String start, int hours) {
    validate(c);
    if (hours < 1 || hours > 72) throw new IllegalArgumentException("Hours must be 1–72");
    var begin = date(start);
    var end = begin.shiftedBy(hours * 3600.0);
    List<Pass> out = new ArrayList<>();
    for (var sat : c.satellites()) {
      var prop = TLEPropagator.selectExtrapolator(new TLE(sat.line1(), sat.line2(), utc));
      for (var station : c.stations()) {
        var frame =
            new TopocentricFrame(
                earth,
                new GeodeticPoint(
                    Math.toRadians(station.latitude()),
                    Math.toRadians(station.longitude()),
                    station.altitude()),
                station.name());
        AbsoluteDate aos = null;
        double max = 0, rise = 0, lastAz = 0;
        for (var t = begin; t.compareTo(end) <= 0; t = t.shiftedBy(20)) {
          var pos = prop.getPVCoordinates(t, earth.getBodyFrame()).getPosition();
          double el = Math.toDegrees(frame.getElevation(pos, earth.getBodyFrame(), t));
          double az = Math.toDegrees(frame.getAzimuth(pos, earth.getBodyFrame(), t));
          if (el >= station.minElevation()) {
            if (aos == null) {
              aos = t;
              rise = az;
              max = el;
            }
            max = Math.max(max, el);
            lastAz = az;
          } else if (aos != null && t.compareTo(aos) > 0) {
            out.add(
                new Pass(
                    sat.name(),
                    station.name(),
                    iso(aos),
                    iso(t),
                    max,
                    rise,
                    lastAz,
                    sat.priority(),
                    sat.band(),
                    0,
                    "CANDIDATE",
                    ""));
            aos = null;
          }
        }
        if (aos != null && end.compareTo(aos) > 0)
          out.add(
              new Pass(
                  sat.name(),
                  station.name(),
                  iso(aos),
                  iso(end),
                  max,
                  rise,
                  lastAz,
                  sat.priority(),
                  sat.band(),
                  0,
                  "CANDIDATE",
                  "Clipped at planning horizon"));
      }
    }
    return out;
  }

  static boolean overlaps(String a, String b, String c, String d) {
    return java.time.Instant.parse(a).isBefore(java.time.Instant.parse(d))
        && java.time.Instant.parse(c).isBefore(java.time.Instant.parse(b));
  }

  public List<Pass> schedule(Config c, List<Pass> candidates) {
    List<Pass> sorted = new ArrayList<>(candidates);
    sorted.sort(
        Comparator.comparingInt(Pass::priority)
            .reversed()
            .thenComparing(Pass::aos)
            .thenComparing(Pass::satellite));
    List<Pass> results = new ArrayList<>();
    for (var p : sorted) {
      var st =
          c.stations().stream().filter(s -> s.name().equals(p.station())).findFirst().orElseThrow();
      String reason = "All compatible antennas occupied";
      int antenna = 0;
      if (!st.band().trim().equalsIgnoreCase(p.band().trim()))
        reason = "Incompatible frequency band";
      else if (c.maintenance().stream()
          .anyMatch(
              m ->
                  m.station().equals(p.station())
                      && overlaps(p.aos(), p.los(), m.start(), m.end())))
        reason = "Station maintenance";
      else if (results.stream()
          .anyMatch(
              q ->
                  q.antenna() > 0
                      && q.satellite().equals(p.satellite())
                      && overlaps(p.aos(), p.los(), q.aos(), q.los())))
        reason = "Satellite already assigned to another station";
      else
        for (int a = 1; a <= st.antennas(); a++) {
          final int id = a;
          if (results.stream()
              .noneMatch(
                  q ->
                      q.antenna() == id
                          && q.station().equals(p.station())
                          && overlaps(p.aos(), p.los(), q.aos(), q.los()))) {
            antenna = a;
            reason = "Priority-first allocation";
            break;
          }
        }
      results.add(
          new Pass(
              p.satellite(),
              p.station(),
              p.aos(),
              p.los(),
              p.maxElevation(),
              p.riseAzimuth(),
              p.setAzimuth(),
              p.priority(),
              p.band(),
              antenna,
              antenna > 0 ? "SCHEDULED" : "REJECTED",
              reason));
    }
    results.sort(Comparator.comparing(Pass::aos));
    return results;
  }

  public Map<String, Object> track(Satellite s, String instant) {
    var t = date(instant);
    var prop = TLEPropagator.selectExtrapolator(new TLE(s.line1(), s.line2(), utc));
    var g =
        earth.transform(
            prop.getPVCoordinates(t, earth.getBodyFrame()).getPosition(), earth.getBodyFrame(), t);
    return Map.of(
        "satellite",
        s.name(),
        "latitude",
        Math.toDegrees(g.getLatitude()),
        "longitude",
        Math.toDegrees(g.getLongitude()),
        "altitudeKm",
        g.getAltitude() / 1000);
  }
}
