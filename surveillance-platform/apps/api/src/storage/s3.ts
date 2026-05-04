import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../env.js";

export interface ObjectStorage {
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  getSignedReadUrl(key: string, ttlSeconds?: number): Promise<string>;
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
  };
}
