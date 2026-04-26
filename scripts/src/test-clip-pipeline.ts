import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:8080";

type SongCase = {
  name: string;
  youtubeQuery: string;
  trackDurationMs: number;
  startSeconds: number;
  durationSeconds: number;
};

const CASES: SongCase[] = [
  { name: "Despacito (radio edit trap)", youtubeQuery: "Despacito Luis Fonsi official audio", trackDurationMs: 282_000, startSeconds: 60, durationSeconds: 5 },
  { name: "Bohemian Rhapsody",           youtubeQuery: "Bohemian Rhapsody Queen official audio", trackDurationMs: 355_000, startSeconds: 90, durationSeconds: 5 },
  { name: "Hotel California",            youtubeQuery: "Hotel California Eagles official audio", trackDurationMs: 391_000, startSeconds: 120, durationSeconds: 5 },
  { name: "Imagine",                     youtubeQuery: "Imagine John Lennon official audio", trackDurationMs: 183_000, startSeconds: 30, durationSeconds: 5 },
  { name: "Smells Like Teen Spirit",     youtubeQuery: "Smells Like Teen Spirit Nirvana official audio", trackDurationMs: 301_000, startSeconds: 90, durationSeconds: 5 },
];

const TOLERANCE_PCT = 3;

type DebugResponse = {
  picked: { id: string; title: string; durationSec: number };
  pickReason: string;
  durationMatch?: { expectedSec: number; actualSec: number; deltaPct: number | null };
  candidates: { durationSec: number; title: string }[];
};

async function ffprobeDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  return parseFloat(stdout.trim());
}

async function runCase(c: SongCase) {
  process.stdout.write(`\n[${c.name}]\n`);
  const debugUrl = new URL(`${BASE_URL}/api/songs/clip-youtube/debug`);
  debugUrl.searchParams.set("youtubeQuery", c.youtubeQuery);
  debugUrl.searchParams.set("startSeconds", String(c.startSeconds));
  debugUrl.searchParams.set("durationSeconds", String(c.durationSeconds));
  debugUrl.searchParams.set("trackDurationMs", String(c.trackDurationMs));

  const debugRes = await fetch(debugUrl);
  if (!debugRes.ok) {
    console.error(`  FAIL: debug endpoint ${debugRes.status}: ${await debugRes.text()}`);
    return false;
  }
  const debug = (await debugRes.json()) as DebugResponse;
  console.log(`  picked: ${debug.picked.title.slice(0, 60)} | ${debug.picked.durationSec}s | reason=${debug.pickReason}`);
  console.log(`  candidates: ${debug.candidates.map(x => `${x.durationSec}s`).join(", ")}`);

  const expectedSec = c.trackDurationMs / 1000;
  const deltaPct = Math.abs(debug.picked.durationSec - expectedSec) / expectedSec * 100;
  if (deltaPct > TOLERANCE_PCT) {
    console.error(`  FAIL: picked duration ${debug.picked.durationSec}s vs expected ${expectedSec}s (${deltaPct.toFixed(2)}% off, tolerance ${TOLERANCE_PCT}%)`);
    return false;
  }
  console.log(`  duration match: ${deltaPct.toFixed(2)}% off — OK`);

  const clipRes = await fetch(`${BASE_URL}/api/songs/clip-youtube?debug=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      youtubeQuery: c.youtubeQuery,
      startSeconds: c.startSeconds,
      durationSeconds: c.durationSeconds,
      trackDurationMs: c.trackDurationMs,
    }),
  });
  if (!clipRes.ok) {
    console.error(`  FAIL: clip endpoint ${clipRes.status}: ${await clipRes.text()}`);
    return false;
  }
  const buf = Buffer.from(await clipRes.arrayBuffer());
  if (buf.length === 0) {
    console.error("  FAIL: clip is empty");
    return false;
  }
  const dir = mkdtempSync(join(tmpdir(), "singsing-smoke-"));
  const path = join(dir, "clip.m4a");
  const fs = await import("node:fs/promises");
  await fs.writeFile(path, buf);
  const fileSize = statSync(path).size;
  const probedDuration = await ffprobeDuration(path);
  const durationDelta = Math.abs(probedDuration - c.durationSeconds);
  console.log(`  clip: ${fileSize} bytes | ffprobe ${probedDuration.toFixed(2)}s vs requested ${c.durationSeconds}s (Δ ${durationDelta.toFixed(2)}s)`);
  try { unlinkSync(path); } catch {}
  if (durationDelta > 0.2) {
    console.error(`  FAIL: clip duration off by ${durationDelta.toFixed(2)}s`);
    return false;
  }
  console.log("  OK");
  return true;
}

async function main() {
  console.log(`Running clip pipeline smoke against ${BASE_URL}`);
  let passed = 0;
  let failed = 0;
  for (const c of CASES) {
    try {
      if (await runCase(c)) passed++;
      else failed++;
    } catch (e) {
      console.error(`  FAIL: exception:`, e);
      failed++;
    }
  }
  console.log(`\n=== ${passed}/${CASES.length} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
