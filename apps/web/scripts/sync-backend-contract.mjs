// Refreshes contracts/backend-openapi.json: the routes of the backend's
// OpenAPI document that this site reads, with the definitions they use.
//
//   node scripts/sync-backend-contract.mjs ../../../Crypto-Exchange/docs/swagger.json
//
// The contract test (src/lib/backend/contract.test.ts) checks our schemas
// against this snapshot, so a backend change that breaks a page shows up as
// a failing test here when the snapshot is refreshed.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATHS = [
  "/api/v1/market-data/assets",
  "/api/v1/market-data/assets/{slug}",
  "/api/v1/market-data/assets/{slug}/venues",
  "/api/v1/market-data/assets/{slug}/candles",
  "/api/v1/market-data/feed/assets",
  "/api/v1/public/currencies",
  "/api/v1/public/locales",
  "/api/v1/public/site",
  "/api/v1/public/status",
];

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/sync-backend-contract.mjs <path to swagger.json>");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(source, "utf8"));
const definitions = {};
const refs = (value) =>
  [...JSON.stringify(value).matchAll(/#\/definitions\/([^"]+)/g)].map((m) => m[1]);
const visit = (name) => {
  if (definitions[name]) return;
  const definition = spec.definitions[name];
  if (!definition) throw new Error(`missing definition ${name}`);
  definitions[name] = definition;
  refs(definition).forEach(visit);
};
const paths = {};
for (const path of PATHS) {
  const get = spec.paths[path]?.get;
  if (!get) throw new Error(`the backend has no GET ${path}`);
  paths[path] = { get: { parameters: get.parameters, responses: { 200: get.responses[200] } } };
  refs(paths[path]).forEach(visit);
}
const sorted = Object.fromEntries(
  Object.entries(definitions).sort(([a], [b]) => a.localeCompare(b)),
);
const out = fileURLToPath(new URL("../contracts/backend-openapi.json", import.meta.url));
writeFileSync(out, `${JSON.stringify({ paths, definitions: sorted }, null, 2)}\n`);
console.log(
  `wrote ${Object.keys(paths).length} paths and ${Object.keys(sorted).length} definitions`,
);
