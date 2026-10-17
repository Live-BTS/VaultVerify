// Generates the LOCAL dev encryption key into .env (gitignored). The key is
// NEVER printed to stdout — it exists only in the .env file.
import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";

const ENV = ".env";
const NAME = "REFERENCE_TOKEN_ENCRYPTION_KEY";
let content = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
if (new RegExp(`^${NAME}=`, "m").test(content)) {
  console.log("already present in .env — not regenerated");
} else {
  const key = randomBytes(32).toString("base64");
  content = content.endsWith("\n") || content === "" ? content : content + "\n";
  content += `${NAME}=${key}\n`;
  writeFileSync(ENV, content);
  console.log("REFERENCE_TOKEN_ENCRYPTION_KEY written to .env (value hidden)");
}
