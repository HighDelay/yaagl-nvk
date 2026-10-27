#!/usr/bin/env node
// Export the same public Wine INF prerequisite used by YAAGL's existing installer.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");

if (process.argv.length !== 3) {
  throw new Error("Usage: node tools/nvk/export-wine-cert.cjs /absolute/new/fragment");
}
const source = path.resolve(__dirname, "../../src/clients/secret.ts");
const compiled = ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {}, atob };
vm.runInNewContext(compiled, context, { filename: source, timeout: 1000 });
const fragment = context.exports.WINE_INF_CERT_STR;
if (typeof fragment !== "string" || !fragment.trim()) {
  throw new Error("Missing Wine INF fragment; run YAAGL's configure.sh first");
}
const output = path.resolve(process.argv[2]);
fs.writeFileSync(output, fragment, { flag: "wx" });
console.log(JSON.stringify({ output, sha256: crypto.createHash("sha256").update(fragment).digest("hex") }));
