import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MAX_ATTACHMENT_SIZE_BYTES } from '@rocket/shared';
import { env } from '../env.js';
import { detectAttachmentMimeType } from './files.js';

export type AttachmentUploadForm = {
  url: string;
  fields: Record<string, string>;
};

export class S3StorageProvider {
  private readonly client: S3Client;
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly options: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      forcePathStyle: boolean;
    },
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
      maxAttempts: 2,
    });
  }

  private async ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        try {
          await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
        } catch {
          try {
            await this.client.send(new CreateBucketCommand({ Bucket: this.options.bucket }));
          } catch (error) {
            const name = error instanceof Error ? error.name : '';
            if (name !== 'BucketAlreadyExists' && name !== 'BucketAlreadyOwnedByYou') throw error;
          }
        }
      })();
    }

    try {
      await this.bucketReady;
    } catch (error) {
      this.bucketReady = null;
      throw error;
    }
  }

  async createUploadForm(storageKey: string, mimeType: string): Promise<AttachmentUploadForm> {
    await this.ensureBucket();
    const result = await createPresignedPost(this.client, {
      Bucket: this.options.bucket,
      Key: storageKey,
      Expires: 300,
      Fields: { 'Content-Type': mimeType },
      Conditions: [
        ['content-length-range', 1, env.STORAGE_MAX_FILE_SIZE_BYTES],
        ['eq', '$Content-Type', mimeType],
      ],
    });
    return result;
  }

  async verifyUpload(storageKey: string, fileName: string, mimeType: string, expectedSize: number) {
    await this.ensureBucket();
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.options.bucket, Key: storageKey }),
    );
    if (
      head.ContentLength !== expectedSize ||
      head.ContentLength === undefined ||
      head.ContentLength > Math.min(MAX_ATTACHMENT_SIZE_BYTES, env.STORAGE_MAX_FILE_SIZE_BYTES) ||
      head.ContentType !== mimeType
    )
      return false;

    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: storageKey }),
    );
    if (!object.Body) return false;
    const bytes = await object.Body.transformToByteArray();
    return detectAttachmentMimeType(fileName, bytes) === mimeType;
  }

  async createDownloadUrl(
    storageKey: string,
    fileName: string,
    mimeType: string,
    disposition: 'inline' | 'attachment' = 'attachment',
  ) {
    await this.ensureBucket();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey,
        ResponseContentType: mimeType,
        ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      }),
      { expiresIn: 300 },
    );
  }

  async deleteObject(storageKey: string) {
    await this.ensureBucket();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: storageKey }),
    );
  }
}

export const storageProvider = new S3StorageProvider({
  endpoint: env.STORAGE_ENDPOINT,
  region: env.STORAGE_REGION,
  bucket: env.STORAGE_BUCKET,
  accessKey: env.STORAGE_ACCESS_KEY,
  secretKey: env.STORAGE_SECRET_KEY,
  forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
});
