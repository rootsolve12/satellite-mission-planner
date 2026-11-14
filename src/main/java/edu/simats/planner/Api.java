package edu.simats.planner;
import java.util.*;
import java.time.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
@RestController @RequestMapping("/api")
public class Api {
 private final Planner planner;private final JdbcTemplate db;private final ObjectMapper json;
 public Api(Planner p,JdbcTemplate d,ObjectMapper j)throws Exception{planner=p;db=d;json=j;db.execute("CREATE TABLE IF NOT EXISTS configuration (id INT PRIMARY KEY, body CLOB)");if(db.queryForObject("SELECT COUNT(*) FROM configuration",Integer.class)==0){String demo=new String(getClass().getResourceAsStream("/demo.json").readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);db.update("INSERT INTO configuration VALUES (1, ?)",demo);}}
 @GetMapping("/config") public Planner.Config config()throws Exception{return json.readValue(db.queryForObject("SELECT body FROM configuration WHERE id=1",String.class),Planner.Config.class);}
 @PutMapping("/config") public Planner.Config save(@RequestBody Planner.Config c)throws Exception{planner.validate(c);db.update("UPDATE configuration SET body=? WHERE id=1",json.writeValueAsString(c));return c;}
 @GetMapping("/plan") public Map<String,Object> plan(@RequestParam(defaultValue="2000-06-28T00:00:00Z")String start,@RequestParam(defaultValue="24")int hours)throws Exception{var c=config();var passes=planner.schedule(c,planner.predict(c,start,hours));long accepted=passes.stream().filter(p->p.antenna()>0).count();return Map.of("passes",passes,"scheduled",accepted,"rejected",passes.size()-accepted,"start",start,"hours",hours,"note","20-second sampling; historical demonstration TLEs; simulated telemetry");}
 @GetMapping("/monitor")public Map<String,Object> monitor(@RequestParam String time)throws Exception{var c=config();var tracks=new ArrayList<Map<String,Object>>();for(var s:c.satellites())tracks.add(planner.track(s,time));long tick=Instant.parse(time).getEpochSecond();return Map.of("time",time,"tracks",tracks,"simulated",true,"batteryPercent",75+10*Math.sin(tick/300.0),"temperatureC",22+4*Math.cos(tick/200.0));}
 @ExceptionHandler({IllegalArgumentException.class,org.orekit.errors.OrekitException.class})public ResponseEntity<Map<String,String>> invalid(Exception e){return ResponseEntity.badRequest().body(Map.of("error",e.getMessage()==null?"Invalid input":e.getMessage()));}
}
