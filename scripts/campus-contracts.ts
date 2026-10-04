import fs from "node:fs";
import path from "node:path";
import { openApi } from "../src/campus/http/openapi";

/** Writes the generated OpenAPI document to /contracts (CI checks it is up to date). */
const out = path.join(process.cwd(), "contracts", "campus", "v1", "openapi.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(openApi(), null, 2) + "\n");
console.log(`wrote ${out}`);
