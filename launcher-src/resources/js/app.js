// esp launcher
// Sets up an "esp" profile in the official Minecraft Launcher and keeps the mod files current.
"use strict";

const REPO = "betterplayer1234f-boop/espclient";
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;

// Developer flags: --manifest=<url> --mcdir=<path> --dry (don't open the Minecraft Launcher)
const ARGS = window.NL_ARGS || [];
const arg = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const DRY_RUN = ARGS.includes("--dry");
const MANIFEST_URL = arg("manifest") || `${RAW}/launcher/manifest.json`;
const REPO_URL = `https://github.com/${REPO}`;
const SITE_URL = `https://betterplayer1234f-boop.github.io/espclient/`;
const LAUNCHER_VERSION = "1.0.0";
const PROFILE_KEY = "esp";

const $ = (id) => document.getElementById(id);

const app = {
  manifest: null,
  appData: "",
  mcDir: "",
  settings: { ram: 4, gameDir: "", jvm: "", closeAfter: false },
  busy: false,
  fileState: {},   // file name -> "ok" | "missing" | "bad"
};

// ------------------------------------------------------------------ small helpers

const join = (...parts) => parts.join("\\").replace(/\\{2,}/g, "\\");

async function exists(path) {
  try {
    await Neutralino.filesystem.getStats(path);
    return true;
  } catch {
    return false;
  }
}

async function mkdirs(path) {
  const parts = path.split("\\");
  let cur = parts.shift();
  for (const p of parts) {
    cur += "\\" + p;
    if (!(await exists(cur))) {
      await Neutralino.filesystem.createDirectory(cur);
    }
  }
}

async function sha256(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function versionNewer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

let toastTimer;
function toast(text, error = false) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (error ? " error" : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4200);
}

function status(text, detail = "", progress = null, working = false) {
  $("status-text").textContent = text;
  $("status-detail").textContent = detail;
  if (progress !== null) $("bar-fill").style.width = Math.round(progress * 100) + "%";
  document.querySelector(".bar").classList.toggle("working", working);
}

function setCheck(id, state) {
  const el = $(id);
  el.classList.remove("ok", "bad", "warn");
  if (state) el.classList.add(state);
}

// ------------------------------------------------------------------ settings

async function loadSettings() {
  try {
    const raw = await Neutralino.storage.getData("settings");
    Object.assign(app.settings, JSON.parse(raw));
  } catch { /* first run */ }
  if (!app.settings.gameDir) app.settings.gameDir = arg("mcdir") ? arg("mcdir") + "-esp" : join(app.appData, ".esp");
}

async function saveSettings() {
  await Neutralino.storage.setData("settings", JSON.stringify(app.settings));
}

function bindSettings() {
  const ram = $("ram"), gamedir = $("gamedir"), jvm = $("jvm"), closeAfter = $("close-after");
  ram.value = app.settings.ram;
  gamedir.value = app.settings.gameDir;
  jvm.value = app.settings.jvm;
  closeAfter.checked = app.settings.closeAfter;
  const showRam = () => {
    $("ram-label").textContent = ram.value + " GB";
    $("chip-ram").textContent = ram.value + " GB";
  };
  showRam();
  ram.addEventListener("input", showRam);
  ram.addEventListener("change", () => { app.settings.ram = Number(ram.value); saveSettings(); });
  gamedir.addEventListener("change", () => { app.settings.gameDir = gamedir.value.trim() || join(app.appData, ".esp"); saveSettings(); refreshState(); });
  jvm.addEventListener("change", () => { app.settings.jvm = jvm.value.trim(); saveSettings(); });
  closeAfter.addEventListener("change", () => { app.settings.closeAfter = closeAfter.checked; saveSettings(); });
  $("reset-gamedir").addEventListener("click", () => {
    app.settings.gameDir = join(app.appData, ".esp");
    gamedir.value = app.settings.gameDir;
    saveSettings();
    refreshState();
  });
}

// ------------------------------------------------------------------ manifest

async function fetchManifest() {
  try {
    const res = await fetch(MANIFEST_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const manifest = await res.json();
    await Neutralino.storage.setData("manifest", JSON.stringify(manifest));
    setCheck("check-net", "ok");
    return manifest;
  } catch (e) {
    setCheck("check-net", "bad");
    try {
      const cached = JSON.parse(await Neutralino.storage.getData("manifest"));
      toast("Couldn't reach GitHub, using the last downloaded file list.");
      $("news-source").textContent = "cached";
      return cached;
    } catch {
      return null;
    }
  }
}

function renderManifest() {
  const m = app.manifest;
  $("mc-version").textContent = m.minecraft;
  $("sticker-version").textContent = "v" + m.version;
  $("chip-loader").textContent = "fabric " + m.loader;
  if (m.tagline) $("tagline").textContent = m.tagline;

  const news = $("news");
  news.innerHTML = "";
  for (const item of (m.news || []).slice(0, 4)) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="news-date"></span><div><div class="news-title"></div><div class="news-body"></div></div>`;
    li.querySelector(".news-date").textContent = item.date;
    li.querySelector(".news-title").textContent = item.title;
    li.querySelector(".news-body").textContent = item.body;
    news.append(li);
  }

  if (m.launcher && versionNewer(m.launcher.version, LAUNCHER_VERSION)) {
    toast(`Launcher ${m.launcher.version} is out. Grab it from the website when you get a sec.`);
  }
}

// ------------------------------------------------------------------ install state

function versionId() {
  return `fabric-loader-${app.manifest.loader}-${app.manifest.minecraft}`;
}

function modsDir() {
  return join(app.settings.gameDir, "mods");
}

async function checkFile(mod) {
  const path = join(modsDir(), mod.file);
  if (!(await exists(path))) return "missing";
  // Re-hashing every start is cheap for a couple of small jars.
  try {
    const buf = await Neutralino.filesystem.readBinaryFile(path);
    return (await sha256(buf)) === mod.sha256 ? "ok" : "bad";
  } catch {
    return "bad";
  }
}

const STEP_DEFS = [
  { id: "fabric", label: "Fabric loader" },
  { id: "mods", label: "esp + Fabric API" },
  { id: "profile", label: "Launcher profile" },
];

function renderSteps(states) {
  const ul = $("steps");
  ul.innerHTML = "";
  for (const def of STEP_DEFS) {
    const s = states[def.id] || { state: "todo", ver: "" };
    const li = document.createElement("li");
    li.className = s.state;
    li.innerHTML = `<span class="mark"></span><span class="what"></span><span class="ver"></span>`;
    li.querySelector(".mark").textContent = s.state === "done" ? "✓" : s.state === "fail" ? "!" : "";
    li.querySelector(".what").textContent = def.label;
    li.querySelector(".ver").textContent = s.ver || "";
    ul.append(li);
  }
}

const stepStates = {};
function step(id, state, ver) {
  stepStates[id] = { state, ver: ver ?? stepStates[id]?.ver ?? "" };
  renderSteps(stepStates);
}

async function refreshState() {
  const m = app.manifest;
  if (!m) return;
  const vid = versionId();
  const fabricOk = await exists(join(app.mcDir, "versions", vid, vid + ".json"));
  step("fabric", fabricOk ? "done" : "todo", m.loader);

  let allOk = true;
  for (const mod of m.mods) {
    app.fileState[mod.file] = await checkFile(mod);
    if (app.fileState[mod.file] !== "ok") allOk = false;
  }
  const esp = m.mods.find((x) => x.id === "esp");
  step("mods", allOk ? "done" : "todo", esp ? esp.version : "");

  let profileOk = false;
  try {
    const profiles = JSON.parse(await Neutralino.filesystem.readFile(join(app.mcDir, "launcher_profiles.json")));
    const p = profiles.profiles && profiles.profiles[PROFILE_KEY];
    profileOk = !!p && p.lastVersionId === vid && p.gameDir === app.settings.gameDir;
  } catch { /* no launcher profiles yet */ }
  step("profile", profileOk ? "done" : "todo", "");

  renderFiles();
  const ready = fabricOk && allOk && profileOk;
  $("install-state").textContent = ready ? "ready" : "needs update";
  $("play-label").textContent = ready ? "Play" : "Install";
  $("play").classList.toggle("update", !ready);
  $("play").disabled = false;
  status(ready ? "Ready" : "Update available", ready ? `esp ${m.version} · ${m.minecraft}` : "press Install, takes a few seconds", ready ? 1 : 0);
}

function renderFiles() {
  const tbody = $("files");
  tbody.innerHTML = "";
  for (const mod of app.manifest.mods) {
    const tr = document.createElement("tr");
    const state = app.fileState[mod.file] || "missing";
    const label = { ok: "installed", missing: "not yet", bad: "changed" }[state];
    tr.innerHTML = `<td><div class="fname"></div><div class="mono dim"></div></td><td class="dim"></td><td class="mono"></td><td class="mono dim"></td><td><span class="tag ${state}">${label}</span></td>`;
    tr.children[0].children[0].textContent = mod.name;
    tr.children[0].children[1].textContent = mod.file;
    tr.children[1].textContent = mod.source;
    tr.children[2].textContent = fmtSize(mod.size);
    tr.children[3].textContent = mod.sha256.slice(0, 12) + "…";
    tbody.append(tr);
  }
}

// ------------------------------------------------------------------ install

async function download(url, onProgress) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

async function installFabric() {
  const m = app.manifest;
  const vid = versionId();
  const dir = join(app.mcDir, "versions", vid);
  const jsonPath = join(dir, vid + ".json");
  step("fabric", "busy");
  if (await exists(jsonPath)) {
    step("fabric", "done");
    return;
  }
  status("Installing Fabric", `loader ${m.loader}`, 0.05, true);
  const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${m.minecraft}/${m.loader}/profile/json`);
  if (!res.ok) throw new Error("Fabric meta returned " + res.status);
  const profile = await res.text();
  await mkdirs(dir);
  await Neutralino.filesystem.writeFile(jsonPath, profile);
  // The Fabric installer leaves an empty jar next to the json; some launcher versions expect it.
  await Neutralino.filesystem.writeBinaryFile(join(dir, vid + ".jar"), new ArrayBuffer(0));
  step("fabric", "done");
}

async function installMods(force) {
  const m = app.manifest;
  step("mods", "busy");
  await mkdirs(modsDir());

  const todo = [];
  for (const mod of m.mods) {
    const state = force ? "missing" : await checkFile(mod);
    if (state !== "ok") todo.push(mod);
  }
  const totalBytes = todo.reduce((s, x) => s + (x.size || 0), 0) || 1;
  let doneBytes = 0;

  for (const mod of todo) {
    status("Downloading", mod.file, doneBytes / totalBytes, true);
    const buf = await download(mod.url, (got) => {
      status("Downloading", `${mod.file}  ${fmtSize(got)} / ${fmtSize(mod.size)}`, (doneBytes + got) / totalBytes, true);
    });
    const hash = await sha256(buf);
    if (hash !== mod.sha256) {
      throw new Error(`${mod.file} didn't match its checksum. Try again in a minute.`);
    }
    await Neutralino.filesystem.writeBinaryFile(join(modsDir(), mod.file), buf);
    doneBytes += mod.size || buf.byteLength;
  }

  // Remove older copies of files this launcher manages (e.g. esp-0.9.0.jar after an update).
  const keep = new Set(m.mods.map((x) => x.file.toLowerCase()));
  const prefixes = m.mods.map((x) => x.cleanupPrefix).filter(Boolean);
  try {
    for (const entry of await Neutralino.filesystem.readDirectory(modsDir())) {
      const name = entry.entry.toLowerCase();
      if (entry.type === "FILE" && name.endsWith(".jar") && !keep.has(name) && prefixes.some((p) => name.startsWith(p))) {
        await Neutralino.filesystem.remove(join(modsDir(), entry.entry));
      }
    }
  } catch { /* nothing to clean */ }

  for (const mod of m.mods) app.fileState[mod.file] = "ok";
  step("mods", "done");
}

async function profileIcon() {
  try {
    const res = await fetch("/icons/appIcon.png");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  } catch {
    return "Furnace";
  }
}

async function installProfile() {
  step("profile", "busy");
  status("Writing launcher profile", "launcher_profiles.json", 0.96, true);
  const path = join(app.mcDir, "launcher_profiles.json");
  let data = { profiles: {}, settings: {}, version: 3 };
  if (await exists(path)) {
    const raw = await Neutralino.filesystem.readFile(path);
    data = JSON.parse(raw);
    // Keep a one-time backup before we ever touch the file.
    const backup = join(app.mcDir, "launcher_profiles.esp-backup.json");
    if (!(await exists(backup))) await Neutralino.filesystem.writeFile(backup, raw);
  }
  data.profiles = data.profiles || {};
  const now = new Date().toISOString();
  const existing = data.profiles[PROFILE_KEY] || {};
  const jvm = [`-Xmx${app.settings.ram}G`, app.settings.jvm].filter(Boolean).join(" ");
  data.profiles[PROFILE_KEY] = Object.assign(existing, {
    name: "esp",
    type: "custom",
    created: existing.created || now,
    lastUsed: now,
    lastVersionId: versionId(),
    gameDir: app.settings.gameDir,
    javaArgs: jvm,
    icon: await profileIcon(),
  });
  await Neutralino.filesystem.writeFile(path, JSON.stringify(data, null, 2));
  step("profile", "done");
}

// ------------------------------------------------------------------ Minecraft Launcher

async function findLauncher() {
  const pf86 = (await Neutralino.os.getEnv("ProgramFiles(x86)")) || "C:\\Program Files (x86)";
  const local = await Neutralino.os.getEnv("LOCALAPPDATA");
  const candidates = [
    join(pf86, "Minecraft Launcher", "MinecraftLauncher.exe"),
    join("C:", "XboxGames", "Minecraft Launcher", "Content", "Minecraft.exe"),
    join(local, "Programs", "Minecraft Launcher", "MinecraftLauncher.exe"),
  ];
  for (const c of candidates) {
    if (await exists(c)) return { type: "exe", path: c };
  }
  // Microsoft Store install
  const store = await Neutralino.os.execCommand('powershell -NoProfile -Command "(Get-AppxPackage -Name Microsoft.4297127D64EC6).Name"');
  if (store.stdOut && store.stdOut.trim()) return { type: "store" };
  return null;
}

async function launcherRunning() {
  const r = await Neutralino.os.execCommand('tasklist /FO CSV /NH /FI "IMAGENAME eq MinecraftLauncher.exe"');
  const r2 = await Neutralino.os.execCommand('tasklist /FO CSV /NH /FI "IMAGENAME eq Minecraft.exe"');
  return /MinecraftLauncher\.exe|Minecraft\.exe/i.test((r.stdOut || "") + (r2.stdOut || ""));
}

async function openLauncher() {
  if (DRY_RUN) {
    return true;
  }
  const found = await findLauncher();
  if (!found) {
    toast("Couldn't find the Minecraft Launcher. Install it from minecraft.net, then press Play again.", true);
    Neutralino.os.open("https://www.minecraft.net/download");
    return false;
  }
  if (found.type === "exe") {
    await Neutralino.os.execCommand(`"${found.path}"`, { background: true });
  } else {
    await Neutralino.os.execCommand("explorer.exe shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft", { background: true });
  }
  return true;
}

// ------------------------------------------------------------------ play

async function play(force = false) {
  if (app.busy || !app.manifest) return;
  app.busy = true;
  $("play").disabled = true;
  try {
    if (!(await exists(app.mcDir))) {
      throw new Error("No .minecraft folder. Install and open the Minecraft Launcher once first.");
    }
    if (!DRY_RUN && await launcherRunning()) {
      toast("Close the Minecraft Launcher first so it picks up the esp profile.", true);
      status("Waiting", "Minecraft Launcher is open", null);
      return;
    }
    await installFabric();
    await installMods(force);
    await installProfile();
    renderFiles();
    status("Opening Minecraft Launcher", "pick the esp profile, then Play", 1, false);
    $("install-state").textContent = "ready";
    $("play-label").textContent = "Play";
    $("play").classList.remove("update");
    const opened = await openLauncher();
    if (opened) {
      toast("In the Minecraft Launcher, choose the esp profile next to the Play button.");
      if (app.settings.closeAfter) setTimeout(() => Neutralino.app.exit(), 2500);
    }
  } catch (e) {
    console.error(e);
    status("Something went wrong", String(e.message || e), 0, false);
    toast(String(e.message || e), true);
    for (const id of Object.keys(stepStates)) if (stepStates[id].state === "busy") step(id, "fail");
  } finally {
    app.busy = false;
    $("play").disabled = false;
  }
}

// ------------------------------------------------------------------ wiring

function showView(name) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
}

function wire() {
  document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const views = { "1": "play", "2": "mods", "3": "settings", "4": "about" };
    if (views[e.key]) showView(views[e.key]);
    if (e.key === "Enter" && !app.busy) play();
  });
  $("btn-close").addEventListener("click", () => Neutralino.app.exit());
  $("btn-min").addEventListener("click", () => Neutralino.window.minimize());
  $("play").addEventListener("click", () => play());
  $("repair").addEventListener("click", () => { showView("play"); play(true); });
  $("open-mods").addEventListener("click", async () => { await mkdirs(modsDir()); Neutralino.os.open(modsDir()); });
  $("open-gamedir").addEventListener("click", async () => { await mkdirs(app.settings.gameDir); Neutralino.os.open(app.settings.gameDir); });
  $("open-log").addEventListener("click", async () => {
    const log = join(app.settings.gameDir, "logs", "latest.log");
    if (await exists(log)) Neutralino.os.open(log);
    else toast("No log yet. Start the game once first.");
  });
  $("open-repo").addEventListener("click", () => Neutralino.os.open(REPO_URL));
  $("open-site").addEventListener("click", () => Neutralino.os.open(SITE_URL));
  Neutralino.window.setDraggableRegion("drag");
}

async function main() {
  Neutralino.init();
  Neutralino.events.on("windowClose", () => Neutralino.app.exit());
  $("launcher-version").textContent = LAUNCHER_VERSION;
  wire();

  app.appData = await Neutralino.os.getEnv("APPDATA");
  app.mcDir = arg("mcdir") || join(app.appData, ".minecraft");
  await loadSettings();
  bindSettings();

  setCheck("check-mc", (await exists(app.mcDir)) ? "ok" : "bad");
  findLauncher().then((l) => setCheck("check-launcher", l ? "ok" : "warn"));

  status("Checking for updates", "github.com/" + REPO, 0, true);
  app.manifest = await fetchManifest();
  if (!app.manifest) {
    status("Offline", "couldn't load the file list from GitHub", 0, false);
    $("news").innerHTML = '<li class="dim">Couldn\'t reach GitHub. Check your connection and reopen the launcher.</li>';
    return;
  }
  renderManifest();
  await refreshState();
}

main();
