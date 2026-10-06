// Publishes a new esp build to the launcher.
//
//   node tools/release.mjs <path/to/esp-X.Y.Z.jar> "<news title>" "<news body>"
//
// Copies the jar into launcher/mods, points manifest.json at it (version, size, sha256),
// adds a news entry, and deletes the previous esp jar. Commit and push afterwards;
// every launcher picks it up on its next start.
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [jarPath, title, body] = process.argv.slice(2);
if (!jarPath) {
  console.error('usage: node tools/release.mjs <esp-X.Y.Z.jar> "title" "body"');
  process.exit(1);
}

const file = basename(jarPath);
const match = /^esp-(.+)\.jar$/.exec(file);
if (!match) {
  console.error("jar must be named esp-<version>.jar");
  process.exit(1);
}
const version = match[1];
const bytes = readFileSync(jarPath);
const sha256 = createHash("sha256").update(bytes).digest("hex");

const modsDir = join(root, "launcher", "mods");
for (const old of readdirSync(modsDir)) {
  if (old.startsWith("esp-") && old !== file) unlinkSync(join(modsDir, old));
}
copyFileSync(jarPath, join(modsDir, file));

const manifestPath = join(root, "launcher", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const esp = manifest.mods.find((m) => m.id === "esp");
Object.assign(esp, {
  version,
  file,
  url: `https://raw.githubusercontent.com/betterplayer1234f-boop/espclient/main/launcher/mods/${file}`,
  size: bytes.length,
  sha256,
});
manifest.version = version;
if (title) {
  manifest.news.unshift({ date: new Date().toISOString().slice(0, 10), title, body: body || "" });
  manifest.news = manifest.news.slice(0, 8);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`esp ${version}  ${bytes.length} bytes  sha256 ${sha256}`);
console.log("now: git add -A && git commit -m \"esp " + version + "\" && git push");
