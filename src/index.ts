import { createCockpit, openPersistence } from "./composition.js";
import { HashedOperatorAuthenticator } from "./domain/operator.js";
import { createServiceServer } from "./server.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";

// AEGIS_DATABASE_PATH selects durable SQLite storage; without it data is volatile.
const persistence = openPersistence(process.env.AEGIS_DATABASE_PATH);
const operators = HashedOperatorAuthenticator.fromList(process.env.AEGIS_OPERATOR_TOKEN_SHA256);
const server = createServiceServer({
  name: "trigenys-aegis",
  version: "0.1.0"
}, createCockpit({ ...persistence, operators }));

server.listen(port, host, () => {
  console.log(JSON.stringify({
    level: "info",
    event: "service.started",
    service: "trigenys-aegis",
    host,
    port,
    persistence: persistence.kind,
    operatorApi: operators.enabled ? "enabled" : "disabled"
  }));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      persistence.close();
      process.exit(0);
    });
  });
}
