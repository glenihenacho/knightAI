#!/usr/bin/env node
// Fetch the YOLOX-nano ONNX person-detection model (Apache-2.0, Megvii) that
// the behavior engine bundles as a Tauri resource. Idempotent: no-op when the
// file already exists with the right hash. Pass --force to redownload.
//
// --testdata additionally places the model plus a sample photo into the
// analysis crate's testdata/ so `cargo test` exercises real inference.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MODEL_DIR = resolve(ROOT, 'src-tauri', 'assets', 'models');
const TESTDATA_DIR = resolve(ROOT, 'src-tauri', 'analysis', 'testdata');

const MODEL_URL =
  'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx';
// Sample photo for the gated detector integration test (people at a bus stop).
const SAMPLE_URL = 'https://ultralytics.com/images/bus.jpg';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const TESTDATA = args.includes('--testdata');

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function ensure(path, url, { expectHash } = {}) {
  if (!FORCE && existsSync(path)) {
    if (!expectHash || sha256(readFileSync(path)) === expectHash) {
      console.log(`[fetch-model] ok: ${path}`);
      return;
    }
    console.log(`[fetch-model] hash mismatch, refetching: ${path}`);
    await rm(path);
  }
  console.log(`[fetch-model] downloading ${url}`);
  const buf = await download(url);
  if (expectHash && sha256(buf) !== expectHash) {
    throw new Error(`sha256 mismatch for ${url}: got ${sha256(buf)}`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
  console.log(`[fetch-model] wrote ${path} (${buf.length} bytes)`);
}

const MODEL_SHA256 =
  process.env.YOLOX_NANO_SHA256 ??
  'c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d';

await ensure(resolve(MODEL_DIR, 'yolox_nano.onnx'), MODEL_URL, {
  expectHash: MODEL_SHA256,
});
if (TESTDATA) {
  await ensure(resolve(TESTDATA_DIR, 'yolox_nano.onnx'), MODEL_URL, {
    expectHash: MODEL_SHA256,
  });
  await ensure(resolve(TESTDATA_DIR, 'person.jpg'), SAMPLE_URL);
}
