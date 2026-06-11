#!/usr/bin/env node
// Fetch a static FFmpeg binary for the host (or a specified --target=<triple>)
// and place it under src-tauri/binaries/ with the Tauri sidecar naming
// convention. Idempotent: re-running is a no-op if the target binary already
// exists. Pass --force to redownload.
//
// Sources:
//   - Linux + Windows: BtbN/FFmpeg-Builds (GPL static builds)
//   - macOS x86_64:    evermeet.cx (x86_64-only, despite older claims of universal2)
//   - macOS arm64:     ffmpeg.martin-riedl.de (native arm64 static build)
//   - macOS universal: both of the above, combined with `lipo -create`
//                      (requires running on macOS; used for universal app builds)
//
// Pin a specific BtbN tag with FFMPEG_BUILD_TAG=autobuild-YYYY-MM-DD-HH-MM.
// Default is `latest` (rolling).

import { mkdir, writeFile, chmod, rm, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BIN_DIR = resolve(ROOT, 'src-tauri', 'binaries');
const TMP_DIR = resolve(BIN_DIR, '.tmp');

const TAG = process.env.FFMPEG_BUILD_TAG ?? 'latest';
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1];

function detectHostTriple() {
  const arch =
    process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'aarch64' : process.arch;
  switch (process.platform) {
    case 'linux':
      return `${arch}-unknown-linux-gnu`;
    case 'darwin':
      return `${arch}-apple-darwin`;
    case 'win32':
      return `${arch}-pc-windows-msvc`;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

const target = targetArg ?? detectHostTriple();

const SOURCES = {
  'x86_64-unknown-linux-gnu': {
    url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${TAG}/ffmpeg-master-${TAG}-linux64-gpl.tar.xz`,
    archiveBin: `ffmpeg-master-${TAG}-linux64-gpl/bin/ffmpeg`,
    suffix: '',
  },
  'aarch64-unknown-linux-gnu': {
    url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${TAG}/ffmpeg-master-${TAG}-linuxarm64-gpl.tar.xz`,
    archiveBin: `ffmpeg-master-${TAG}-linuxarm64-gpl/bin/ffmpeg`,
    suffix: '',
  },
  'x86_64-pc-windows-msvc': {
    url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${TAG}/ffmpeg-master-${TAG}-win64-gpl.zip`,
    archiveBin: `ffmpeg-master-${TAG}-win64-gpl/bin/ffmpeg.exe`,
    suffix: '.exe',
  },
  'x86_64-apple-darwin': {
    url: 'https://evermeet.cx/ffmpeg/getrelease/zip',
    archiveBin: 'ffmpeg',
    suffix: '',
  },
  'aarch64-apple-darwin': {
    url: 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip',
    archiveBin: 'ffmpeg',
    suffix: '',
  },
};

async function fetchOne(triple) {
  const config = SOURCES[triple];
  if (!config) {
    console.error(`Unknown target: ${triple}`);
    console.error(`Known targets: ${Object.keys(SOURCES).join(', ')}, universal-apple-darwin`);
    process.exit(1);
  }

  const dest = resolve(BIN_DIR, `ffmpeg-${triple}${config.suffix}`);

  if (existsSync(dest) && !FORCE) {
    console.log(`✓ ${basename(dest)} already present (use --force to redownload)`);
    return dest;
  }

  await mkdir(BIN_DIR, { recursive: true });
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });

  const archiveName = config.url.split('/').pop().split('?')[0] || 'ffmpeg.archive';
  const archivePath = resolve(TMP_DIR, archiveName);

  console.log(`Fetching FFmpeg for ${triple}`);
  console.log(`  ${config.url}`);

  const res = await fetch(config.url, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`Download failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(archivePath, buf);

  const sizeMb = (buf.length / 1024 / 1024).toFixed(1);
  console.log(`  downloaded ${sizeMb} MiB, extracting…`);

  // `tar` on Linux/macOS/Win10+ handles both .tar.xz and .zip via libarchive.
  execFileSync('tar', ['-xf', archivePath, '-C', TMP_DIR], { stdio: 'inherit' });

  const extracted = resolve(TMP_DIR, config.archiveBin);
  try {
    await stat(extracted);
  } catch {
    console.error(`Expected ${config.archiveBin} inside archive, not found.`);
    process.exit(1);
  }

  await cp(extracted, dest);
  if (process.platform !== 'win32' && config.suffix !== '.exe') {
    await chmod(dest, 0o755);
  }

  await rm(TMP_DIR, { recursive: true, force: true });

  console.log(`✓ Wrote ${dest}`);
  return dest;
}

if (target === 'universal-apple-darwin') {
  if (process.platform !== 'darwin') {
    console.error('universal-apple-darwin requires macOS (needs `lipo`).');
    process.exit(1);
  }
  const dest = resolve(BIN_DIR, 'ffmpeg-universal-apple-darwin');
  if (existsSync(dest) && !FORCE) {
    console.log(`✓ ${basename(dest)} already present (use --force to redownload)`);
    process.exit(0);
  }
  const x64 = await fetchOne('x86_64-apple-darwin');
  const arm = await fetchOne('aarch64-apple-darwin');
  execFileSync('lipo', ['-create', '-output', dest, x64, arm], { stdio: 'inherit' });
  await chmod(dest, 0o755);
  console.log(`✓ Wrote ${dest} (universal: x86_64 + arm64)`);
} else {
  await fetchOne(target);
}
