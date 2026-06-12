#!/usr/bin/env node
// Upload the YOLOX-nano ONNX model to S3 at models/yolox_nano.onnx — the
// worker pulls it from there at startup (sha256-pinned). Downloads from the
// upstream Megvii release (Apache-2.0) unless a local file is given.
//
//   S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
//     node scripts/upload-model.mjs [path/to/yolox_nano.onnx]

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MODEL_URL =
  "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx";
const MODEL_SHA256 =
  process.env.MODEL_SHA256 ??
  "c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d";
const MODEL_KEY = process.env.MODEL_S3_KEY ?? "models/yolox_nano.onnx";

const localPath = process.argv[2];
let buf;
if (localPath) {
  buf = await readFile(localPath);
} else {
  console.log(`downloading ${MODEL_URL}`);
  const res = await fetch(MODEL_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${MODEL_URL} -> ${res.status}`);
  buf = Buffer.from(await res.arrayBuffer());
}

const got = createHash("sha256").update(buf).digest("hex");
if (got !== MODEL_SHA256) {
  throw new Error(`sha256 mismatch: expected ${MODEL_SHA256}, got ${got}`);
}

const client = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
await client.send(
  new PutObjectCommand({
    Bucket: process.env.S3_BUCKET ?? "surveillance",
    Key: MODEL_KEY,
    Body: buf,
    ContentType: "application/octet-stream",
  }),
);
console.log(`uploaded ${MODEL_KEY} (${buf.length} bytes, sha256 ${got})`);
