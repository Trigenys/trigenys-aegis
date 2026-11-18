import { generateOperatorToken } from "../domain/operator.js";

// Prints a new operator token once. Store the token in a password manager and
// put only the hash in AEGIS_OPERATOR_TOKEN_SHA256 (comma-separated for several operators).
const { token, sha256 } = generateOperatorToken();
process.stdout.write(`token (keep secret, shown once): ${token}\nAEGIS_OPERATOR_TOKEN_SHA256=${sha256}\n`);
