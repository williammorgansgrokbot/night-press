/**
 * Headless Chromium QA for the walkable lot.
 * Usage: python3 -m http.server 8765 --directory site
 *        node tools/qa.mjs [http://127.0.0.1:8765/]
 */
import { chromium } from "/workspace/brass-rail-derby/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "screenshots");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";

const VIEWS = [
  { id: "01_spawn_ride", x: -8, y: 1.65, z: 20, yaw: -0.38, pitch: -0.04, note: "spawn, looking at Night Press" },
  { id: "02_hero", x: -10.5, y: 2.55, z: 21.0, yaw: -0.438, pitch: 0.042, note: "v4b hero camera" },
  { id: "03_lot_skyline", x: -16, y: 5.4, z: 44, yaw: -0.238, pitch: 0.022, note: "v4b lot/skyline overview" },
  { id: "04_stairs", x: 0, y: 1.62, z: 12, yaw: 0, pitch: -0.08, note: "approaching Night Press stairs" },
  { id: "05_panel", x: 8.2, y: 1.55, z: -0.78, yaw: 0, pitch: -0.124, note: "control panel trailer" },
  { id: "06_carnival", x: 10, y: 1.7, z: 18, yaw: 0.71, pitch: 0.06, note: "mid-lot carnival rides" },
  { id: "07_mall", x: 18, y: 1.7, z: 0, yaw: -1.19, pitch: 0.15, note: "mall facade" },
  { id: "08_skyline_north", x: 0, y: 1.8, z: -8, yaw: 0, pitch: 0.04, note: "looking north at the horizon" },
  { id: "09_wet_lot", x: -8, y: 1.55, z: 18, yaw: -0.5, pitch: -0.22, note: "wet asphalt and parked cars" },
];

const SIZES = [
  { name: "iphone", w: 844, h: 390 },
  { name: "desktop", w: 1600, h: 900 },
];

function fmtMs(n) { return Math.round(n * 10) / 10; }

async function waitReady(page, ms = 90000) {
  await page.waitForFunction(() => window.__READY === true && window.__PERF && window.__PERF.frames > 8, { timeout: ms });
}

async function measurePerf(page, frames = 20) {
  await page.evaluate((n) => {
    window.__PERF.frames = 0;
    window.__P0 = performance.now();
    window.__P_TARGET = n;
  }, frames);
  await page.waitForFunction(() => window.__PERF.frames >= window.__P_TARGET, { timeout: 120000 });
  return page.evaluate(() => {
    const elapsed = performance.now() - window.__P0;
    const frames = window.__PERF.frames;
    return {
      elapsed,
      frames,
      frameMs: elapsed / frames,
      fps: frames / (elapsed / 1000),
      smoothMs: window.__PERF.ms,
      pixelRatio: window.World && World.pixelRatio,
    };
  });
}

async function runSize(browser, size, report) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
    isMobile: size.name === "iphone",
    hasTouch: size.name === "iphone",
  });
  const page = await context.newPage();
  const logs = [];
  const errors = [];
  page.on("console", (msg) => {
    const rec = { type: msg.type(), text: msg.text() };
    logs.push(rec);
    const t = rec.text || "";
    if (msg.type() === "error") {
      if (/favicon\.ico/i.test(t)) return;
      if (/AudioContext was not allowed to start/i.test(t)) return;
      errors.push(rec);
    }
  });
  page.on("pageerror", (err) => errors.push({ type: "pageerror", text: String(err) }));
  page.on("requestfailed", (req) => {
    const url = req.url();
    // favicon is fine
    if (url.endsWith("favicon.ico")) return;
    errors.push({ type: "requestfailed", text: `${req.failure()?.errorText || "fail"} ${url}` });
  });

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page);
  const loadMs = Date.now() - t0;

  const xfer = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    let bytes = nav ? (nav.transferSize || 0) : 0;
    const files = [];
    for (const e of entries) {
      bytes += e.transferSize || 0;
      files.push({ name: e.name.split("/").pop(), transfer: e.transferSize || 0, decoded: e.decodedBodySize || 0 });
    }
    return { bytes, files };
  });

  // land at spawn first and snap
  await page.evaluate(() => {
    if (typeof resetPlayer === "function") resetPlayer();
  });
  await page.waitForTimeout(250);

  const shots = [];
  for (const v of VIEWS) {
    await page.evaluate((v) => {
      window.__teleport(v.x, v.y, v.z, v.yaw, v.pitch);
    }, v);
    await page.waitForTimeout(180);
    const file = `${v.id}_${size.name}.png`;
    const dest = path.join(OUT, file);
    await page.screenshot({ path: dest, type: "png" });
    shots.push({ file, view: v.id, note: v.note, size: size.name });
  }

  const perf = await measurePerf(page);
  await context.close();
  report[size.name] = { loadMs, perf, transferBytes: xfer.bytes, files: xfer.files, shots, errors, logs };
  return { errors, logs, shots, perf, loadMs, xfer };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const report = { base: BASE, at: new Date().toISOString(), sizes: {} };
  // flatten for later write
  const bag = {};
  for (const size of SIZES) {
    console.log("QA", size.name, size.w, "x", size.h);
    const r = await runSize(browser, size, bag);
    console.log("  load", r.loadMs, "ms  frame", fmtMs(r.perf.frameMs), "ms  fps", fmtMs(r.perf.fps), "  errors", r.errors.length);
    if (r.errors.length) r.errors.forEach((e) => console.log("  ERR", e.type, e.text.slice(0, 240)));
  }
  report.sizes = bag;
  // summarize
  const desktopXfer = bag.desktop?.transferBytes || 0;
  report.summary = {
    transferMB: Math.round((desktopXfer / 1e6) * 100) / 100,
    iphone: bag.iphone?.perf,
    desktop: bag.desktop?.perf,
    errorCount: (bag.iphone?.errors?.length || 0) + (bag.desktop?.errors?.length || 0),
  };
  const outJson = path.join(OUT, "qa-report.json");
  await writeFile(outJson, JSON.stringify(report, null, 2));
  await browser.close();
  console.log("wrote", outJson);
  console.log("summary", JSON.stringify(report.summary));
  if (report.summary.errorCount) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exit(1); });
