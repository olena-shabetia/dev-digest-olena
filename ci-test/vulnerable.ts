// Intentionally insecure sample, used only to check that the DevDigest CI
// review flags CRITICAL findings. Delete this file and branch after the test.
import { createConnection } from 'node:net';

const DB_PASSWORD = 'SuperSecret123!'; // hardcoded credential

export function findUser(db: { query(sql: string): unknown }, id: string) {
  // SQL built by string concatenation with raw user input
  return db.query(`SELECT * FROM users WHERE id = '${id}' AND pw = '${DB_PASSWORD}'`);
}

export function runUserExpression(expr: string) {
  // arbitrary code execution from user input
  return eval(expr);
}

export function connect(host: string) {
  return createConnection({ host, port: 5432 });
}
