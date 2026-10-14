const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const { resolve } = require("node:path");

const source = resolve("public");
const output = resolve("dist");

if (!existsSync(source)) {
  throw new Error("Missing public directory");
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true, force: true });

console.log("Copied public/ to dist/ for Cloudflare Pages preview.");
