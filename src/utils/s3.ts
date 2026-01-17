// Low-level S3 operations with pagination/batching/multipart abstracted
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCopyCommand,
  CompleteMultipartUploadCommand,
  _Object as S3Object,
  CommonPrefix,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";
import { paginate, batch } from "./paginate";

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

export class S3 {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty response for ${key}`);
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty response for ${key}`);
    return res.Body as Readable;
  }

  async put(key: string, body: Buffer | string | Readable, onProgress?: (percent: number) => void, size?: number): Promise<void> {
    const data = typeof body === "string" ? Buffer.from(body) : body;
    if (data instanceof Readable || onProgress) {
      const upload = new Upload({
        client: this.client,
        params: { Bucket: this.bucket, Key: key, Body: data, ContentLength: size },
        partSize: 16 * 1024 * 1024,
        queueSize: 1,
      });
      if (onProgress && size) {
        upload.on("httpUploadProgress", (p) => {
          if (p.loaded) onProgress(Math.round(p.loaded / size * 100));
        });
      }
      await upload.done();
    } else {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data }));
    }
  }

  async delete(keys: string | string[]): Promise<void> {
    const keyList = Array.isArray(keys) ? keys : [keys];
    if (keyList.length === 0) return;
    await batch(keyList.map(k => ({ Key: k })), 1000, async (chunk) => {
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: chunk },
      }));
    });
  }

  async list(prefix: string, delimiter?: string): Promise<{ objects: S3Object[]; prefixes: CommonPrefix[] }> {
    const request = {
      Bucket: this.bucket,
      Prefix: prefix || undefined,
      Delimiter: delimiter,
    };

    const results = await paginate(
      request,
      (req) => this.client.send(new ListObjectsV2Command(req)),
      (res) => [{ objects: res.Contents ?? [], prefixes: res.CommonPrefixes ?? [] }],
      (res) => res.NextContinuationToken,
      (req, token) => ({ ...req, ContinuationToken: token })
    );

    return {
      objects: results.flatMap(r => r.objects),
      prefixes: results.flatMap(r => r.prefixes),
    };
  }

  async head(key: string): Promise<{ size: number; mtime: Date } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, mtime: res.LastModified ?? new Date() };
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  // Server-side copy, handles multipart for >5GB
  async copy(src: string, dest: string, size?: number): Promise<void> {
    const copySize = size ?? (await this.head(src))?.size ?? 0;

    if (copySize > 5 * 1024 * 1024 * 1024) {
      await this.multipartCopy(src, dest, copySize);
    } else {
      await this.client.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${src}`,
        Key: dest,
      }));
    }
  }

  private async multipartCopy(src: string, dest: string, size: number): Promise<void> {
    const partSize = 1024 * 1024 * 1024; // 1GB parts
    const { UploadId } = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: dest })
    );

    const parts: { ETag: string; PartNumber: number }[] = [];
    for (let i = 0, partNum = 1; i < size; i += partSize, partNum++) {
      const end = Math.min(i + partSize - 1, size - 1);
      const { CopyPartResult } = await this.client.send(new UploadPartCopyCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${src}`,
        Key: dest,
        UploadId,
        PartNumber: partNum,
        CopySourceRange: `bytes=${i}-${end}`,
      }));
      if (CopyPartResult?.ETag) {
        parts.push({ ETag: CopyPartResult.ETag, PartNumber: partNum });
      }
    }

    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: dest,
      UploadId,
      MultipartUpload: { Parts: parts },
    }));
  }
}
