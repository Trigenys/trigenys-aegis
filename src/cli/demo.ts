import { generateOperatorToken } from "../domain/operator.js";

// Local demonstration launcher: volatile in-memory storage seeded with three
// fictional SMEs, bound to the loopback interface. If no operator token hash is
// configured, a throwaway token is generated and printed once on this terminal.
delete process.env.AEGIS_DATABASE_URL;
process.env.AEGIS_DEMO_SEED = "1";
process.env.AEGIS_ALLOW_DEMO_SEED = "1";
process.env.HOST ||= "127.0.0.1";
process.env.PORT ||= "3000";

if (!process.env.AEGIS_OPERATOR_TOKEN_SHA256?.trim()) {
  const { token, sha256 } = generateOperatorToken();
  process.env.AEGIS_OPERATOR_TOKEN_SHA256 = sha256;
  process.stdout.write(`demo operator token (local, shown once): ${token}\n`);
}
process.stdout.write(`cockpit: http://${process.env.HOST}:${process.env.PORT}/cockpit/login\n`);

await import("../index.js");
