// Model bootstrap: pull the sha256-pinned YOLOX ONNX from S3 to local disk
// once at startup. No model, no worker — a detection worker that silently
// can't detect is worse than one that won't boot.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { Logger } from "pino";
import type { Env } from "./env.js";
import type { ObjectStorage } from "./s3.js";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function ensureModel(env: Env, s3: ObjectStorage, log: Logger): Promise<string> {
  if (env.MODEL_LOCAL_PATH) {
    if (!existsSync(env.MODEL_LOCAL_PATH)) {
      throw new Error(`MODEL_LOCAL_PATH ${env.MODEL_LOCAL_PATH} does not exist`);
    }
    log.info({ path: env.MODEL_LOCAL_PATH }, "using local model override");
    return env.MODEL_LOCAL_PATH;
  }

  if (existsSync(env.MODEL_CACHE_PATH)) {
    const cached = await readFile(env.MODEL_CACHE_PATH);
    if (sha256(cached) === env.MODEL_SHA256) {
      log.info({ path: env.MODEL_CACHE_PATH }, "model cache hit");
      return env.MODEL_CACHE_PATH;
    }
    log.warn({ path: env.MODEL_CACHE_PATH }, "model cache hash mismatch, refetching");
  }

  const obj = await s3.getObjectBuffer(env.MODEL_S3_KEY);
  if (!obj) {
    throw new Error(
      `model not found in S3 at ${env.MODEL_S3_KEY} — upload it with ` +
        `infra/scripts (see apps/connector-tauri/scripts/fetch-model.mjs for the source URL)`,
    );
  }
  const got = sha256(obj);
  if (got !== env.MODEL_SHA256) {
    throw new Error(`model sha256 mismatch: expected ${env.MODEL_SHA256}, got ${got}`);
  }
  await writeFile(env.MODEL_CACHE_PATH, obj);
  log.info({ key: env.MODEL_S3_KEY, bytes: obj.length }, "model fetched from S3");
  return env.MODEL_CACHE_PATH;
}
