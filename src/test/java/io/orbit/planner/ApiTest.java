package io.orbit.planner;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"spring.datasource.url=jdbc:h2:mem:api-test;DB_CLOSE_DELAY=-1"})
class ApiTest {
  @Autowired TestRestTemplate http;

  @Test
  void previewsNewConfigurationWithoutMutation() {
    var c = http.getForObject("/api/config", Planner.Config.class);
    var changed = new ArrayList<>(c.satellites());
    var first = changed.get(0);
    changed.set(
        0, new Planner.Satellite(first.name(), first.line1(), first.line2(), 8, first.band()));
    var draft = new Planner.Config(changed, c.stations(), c.maintenance());
    var r =
        http.postForEntity(
            "/api/plan", new Api.PlanRequest(draft, "2000-06-28T00:00:00Z", 24), JsonNode.class);
    assertEquals(HttpStatus.OK, r.getStatusCode());
    assertTrue(r.getBody().path("passes").size() > 0);
    assertEquals(
        first.priority(),
        http.getForObject("/api/config", Planner.Config.class).satellites().get(0).priority());
    var invalid =
        http.postForEntity(
            "/api/plan", new Api.PlanRequest(draft, "2000-06-28T00:00:00Z", 100), JsonNode.class);
    assertEquals(HttpStatus.BAD_REQUEST, invalid.getStatusCode());
  }

  @Test
  void persistsBoundedHistoryAndRejectsInvalidShape() {
    var body =
        Map.of(
            "plans", List.of(Map.of("id", "sample-plan", "scheduled", 18)), "telemetry", List.of());
    var response =
        http.exchange("/api/history", HttpMethod.PUT, new HttpEntity<>(body), JsonNode.class);
    assertEquals(HttpStatus.OK, response.getStatusCode());
    assertEquals(
        "sample-plan",
        http.getForObject("/api/history", JsonNode.class).path("plans").get(0).path("id").asText());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        http.exchange(
                "/api/history",
                HttpMethod.PUT,
                new HttpEntity<>(Map.of("plans", "invalid")),
                JsonNode.class)
            .getStatusCode());
  }

  @Test
  void rejectsEmptyRegistriesAndInvalidStationConfiguration() {
    var c = http.getForObject("/api/config", Planner.Config.class);
    var bad = new Planner.Config(List.of(), c.stations(), List.of());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        http.exchange("/api/config", HttpMethod.PUT, new HttpEntity<>(bad), JsonNode.class)
            .getStatusCode());
  }
}
