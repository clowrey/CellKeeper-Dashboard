import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const options = {
  entryPoints: ["src/index.js"],
  outfile: "dist/cellkeeper-dashboard.js",
  bundle: true,
  format: "esm",
  target: "es2021",
  minify: false,
  legalComments: "none",
  banner: { js: `/* CellKeeper Dashboard ${version} - https://github.com/clowrey/CellKeeper-Dashboard */` },
  define: { __VERSION__: JSON.stringify(version) },
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching src/ ...");
} else {
  await esbuild.build(options);
  console.log(`built dist/cellkeeper-dashboard.js (${version})`);
}
