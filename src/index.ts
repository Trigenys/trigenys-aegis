import { loadHealthRules } from "./adapters/config/health-rules-file.js";
import { seedDemo } from "./cli/demo-seed.js";
import { createCockpit, openPersistence } from "./composition.js";
import { HashedOperatorAuthenticator } from "./domain/operator.js";
import { createServiceServer } from "./server.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";

// AEGIS_DATABASE_URL selects durable PostgreSQL storage; without it data is volatile.
const persistence = await openPersistence(process.env.AEGIS_DATABASE_URL);
const operators = HashedOperatorAuthenticator.fromList(process.env.AEGIS_OPERATOR_TOKEN_SHA256);
const healthRules = loadHealthRules(process.env.AEGIS_HEALTH_RULES_PATH);
const cockpit = createCockpit({ ...persistence, operators, healthRules });

// Local demonstration only: volatile storage, fictional data, explicit opt-in.
if (process.env.AEGIS_DEMO_SEED === "1") {
  if (persistence.kind !== "memory") {
    throw new Error("AEGIS_DEMO_SEED=1 is only allowed with in-memory storage");
  }
  await seedDemo(cockpit.stores, cockpit.clock.now(), process.env);
}

const server = createServiceServer({
  name: "trigenys-aegis",
  version: "0.1.0"
}, cockpit);

server.listen(port, host, () => {
  console.log(JSON.stringify({
    level: "info",
    event: "service.started",
    service: "trigenys-aegis",
    host,
    port,
    persistence: persistence.kind,
    operatorApi: operators.enabled ? "enabled" : "disabled",
    healthRules: healthRules.version
  }));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void persistence.close().finally(() => process.exit(0));
    });
  });
}
