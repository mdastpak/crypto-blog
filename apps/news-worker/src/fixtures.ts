import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** A recorded feed; tests never use the network. */
export const fixture = (name: string) => readFileSync(path.join(dir, name), "utf8");
