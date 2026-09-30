#!/usr/bin/env node
// Renders the ad to a vertical 1080×1920 MP4 (H.264 + AAC).
//
// Every frame is a deterministic function of time, so we seek the page to
// each frame, screenshot it, and pipe the frames to ffmpeg. The soundtrack is
// synthesized by the page itself via OfflineAudioContext.
//
//   node render.mjs                         # full cut  → out/paying-it-back-dad.mp4
//   node render.mjs --cut 30                # :30 cut   → out/paying-it-back-dad-30.mp4
//   node render.mjs --cut 15                # :15 cut   → out/paying-it-back-dad-15.mp4
//   node render.mjs --still 21.3            # one PNG frame (full-cut time) → out/still-21.3.png
//   node render.mjs --paidfor "Committee X" # adds a "Paid for by…" end-card disclaimer
//
// Needs Playwright (local or global install) and an ffmpeg with libx264
// (set FFMPEG=/path/to/ffmpeg if it's not on PATH).

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]);
    return acc;
  }, [])
);
const cut = String(args.cut || 'full');
const fps = Number(args.fps || 30);
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const outDir = path.join(here, 'out');
mkdirSync(outDir, { recursive: true });

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const query = new URLSearchParams({ render: '1', cut });
if (args.paidfor) query.set('paidfor', args.paidfor);
await page.goto(`${pathToFileURL(path.join(here, 'index.html')).href}?${query}`);
await page.evaluate(() => window.__ready);

if (args.still !== undefined) {
  const t = Number(args.still);
  await page.evaluate(ct => window.__seek(ct), t);
  const file = path.join(outDir, args.out || `still-${t}.png`);
  await page.screenshot({ path: file });
  console.log(file);
  await browser.close();
  process.exit(0);
}

const duration = await page.evaluate(() => window.__duration);
const frames = Math.round(duration * fps);
const base = cut === 'full' ? 'paying-it-back-dad' : `paying-it-back-dad-${cut}`;
const outFile = path.join(outDir, `${base}.mp4`);
const wavFile = path.join(outDir, `${base}.wav`);

console.log(`Rendering ${cut} cut: ${duration.toFixed(1)}s, ${frames} frames @ ${fps}fps`);
const wav = await page.evaluate(() => window.__renderAudio());
writeFileSync(wavFile, Buffer.from(wav, 'base64'));

const ff = spawn(ffmpeg, [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-i', wavFile,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', // social-platform loudness
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
  outFile,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((resolve, reject) => ff.on('close', code => code ? reject(new Error(`ffmpeg exited ${code}`)) : resolve()));

for (let i = 0; i < frames; i++) {
  await page.evaluate(ct => window.__seek(ct), i / fps);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % (fps * 5) === 0) process.stdout.write(`  ${(i / fps).toFixed(0)}s\n`);
}
ff.stdin.end();
await done;
rmSync(wavFile);
await browser.close();
console.log(outFile);
