// Same object-store posture as the API's storage/s3.ts, plus a buffer read
// for the model fetch. Kept separate so the worker has no dependency on the
// API package.

import type { Readable } from "node:stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type { Env } from "./env.js";

export interface ObjectStorage {
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  getObjectStream(key: string): Promise<Readable | null>;
  getObjectBuffer(key: string): Promise<Buffer | null>;
}

export function createObjectStorage(env: Env): ObjectStorage {
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });

  async function getObject(key: string): Promise<GetObjectCommandOutput | null> {
    try {
      return await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  return {
    async putObject({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async getObjectStream(key) {
      const obj = await getObject(key);
      return (obj?.Body as Readable | undefined) ?? null;
    },

    async getObjectBuffer(key) {
      const obj = await getObject(key);
      if (!obj?.Body) return null;
      return Buffer.from(await obj.Body.transformToByteArray());
    },
  };
}
