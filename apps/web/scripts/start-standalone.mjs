// Starts the standalone server the way the container image does: the static
// assets and public files are copied next to it, as `next build` leaves them out.
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const standalone = `${app}.next/standalone/apps/web`;
if (!existsSync(`${standalone}/server.js`)) {
  console.error("No standalone build: run `pnpm build` first.");
  process.exit(1);
}
cpSync(`${app}.next/static`, `${standalone}/.next/static`, { recursive: true });
cpSync(`${app}public`, `${standalone}/public`, { recursive: true });

const server = spawn(process.execPath, [`${standalone}/server.js`], {
  stdio: "inherit",
  env: { NEXT_MANUAL_SIG_HANDLE: "true", ...process.env },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
