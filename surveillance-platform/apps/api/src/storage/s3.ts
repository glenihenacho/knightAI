import { Readable } from "node:stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../env.js";

export interface StoredObject {
  body: Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
}

export interface ObjectStorage {
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  getSignedReadUrl(key: string, ttlSeconds?: number): Promise<string>;
  getObjectText(key: string): Promise<string | null>;
  getObjectStream(key: string): Promise<StoredObject | null>;
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
      // Some S3-compatible endpoints (MinIO older builds) signal 404 via the
      // HTTP metadata rather than a typed error.
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  return {
    async putObject({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async getSignedReadUrl(key, ttlSeconds = env.SNAPSHOT_URL_TTL_SECONDS) {
      const cmd = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
      return getSignedUrl(client, cmd, { expiresIn: ttlSeconds });
    },

    async getObjectText(key) {
      const obj = await getObject(key);
      if (!obj?.Body) return null;
      return obj.Body.transformToString();
    },

    async getObjectStream(key) {
      const obj = await getObject(key);
      if (!obj?.Body) return null;
      return {
        body: obj.Body as Readable,
        contentType: obj.ContentType,
        contentLength: obj.ContentLength,
      };
    },
  };
}
