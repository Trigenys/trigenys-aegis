import { createCockpit } from "./composition.js";
import { createServiceServer } from "./server.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";

// Persistence is in-memory until a durable store adapter is selected.
const server = createServiceServer({
  name: "trigenys-aegis",
  version: "0.1.0"
}, createCockpit());

server.listen(port, host, () => {
  console.log(JSON.stringify({
    level: "info",
    event: "service.started",
    service: "trigenys-aegis",
    host,
    port,
    persistence: "memory"
  }));
});
