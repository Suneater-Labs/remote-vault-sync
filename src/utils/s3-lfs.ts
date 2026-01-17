// S3 LFS: store large files in S3, replace with pointers in git
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import { glob } from "tinyglobby";
import { S3 } from "./s3";

const LFS_VERSION = "https://git-lfs.github.com/spec/v1";

export const DEFAULT_GITATTRIBUTES = `*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.webp binary
*.bmp binary
*.mp4 binary
*.mov binary
*.webm binary
*.mp3 binary
*.wav binary
*.flac binary
*.pdf binary
*.zip binary
*.tar binary
*.gz binary
`;

export async function getLfsPatterns(vaultPath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(vaultPath, ".gitattributes"), "utf8");
    return content.split("\n")
      .filter(line => line.includes("binary"))
      .map(line => line.split(/\s+/)[0])
      .filter((p): p is string => !!p);
  } catch {
    return [];
  }
}

function formatPointer(oid: string, size: number): string {
  return `version ${LFS_VERSION}\noid sha256:${oid}\nsize ${size}\n`;
}

function parsePointer(content: string): { oid: string; size: number } | null {
  if (!content.startsWith(`version ${LFS_VERSION}`)) return null;
  const oidMatch = content.match(/^oid sha256:([a-f0-9]{64})$/m);
  const sizeMatch = content.match(/^size (\d+)$/m);
  if (!oidMatch?.[1] || !sizeMatch?.[1]) return null;
  return { oid: oidMatch[1], size: parseInt(sizeMatch[1], 10) };
}

export class S3LFS {
  constructor(private s3: S3) {}

  private key(oid: string): string {
    return `lfs/${oid}`;
  }

  // Clean: upload file to S3, replace with pointer (single-pass: hash while uploading)
  async clean(fullPath: string, onProgress?: (percent: number) => void): Promise<void> {
    const stat = await fs.stat(fullPath);
    const tempKey = `lfs/tmp/${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Hash while streaming to S3
    const hash = createHash("sha256");
    const hashTransform = new Transform({
      transform(chunk: Buffer, _, cb) {
        hash.update(chunk);
        cb(null, chunk);
      }
    });

    const stream = createReadStream(fullPath, { highWaterMark: 16 * 1024 * 1024 }).pipe(hashTransform);
    await this.s3.put(tempKey, stream, onProgress, stat.size);

    const oid = hash.digest("hex");

    // Server-side copy to final key
    await this.s3.copy(tempKey, this.key(oid), stat.size);
    await this.s3.delete(tempKey);
    await fs.writeFile(fullPath, formatPointer(oid, stat.size));
  }

  // Smudge: download from S3, replace pointer with content
  async smudge(fullPath: string): Promise<void> {
    const content = await fs.readFile(fullPath, "utf8");
    const pointer = parsePointer(content);
    if (!pointer) return;

    const stream = await this.s3.getStream(this.key(pointer.oid));
    await pipeline(stream, createWriteStream(fullPath));
  }

  private async isLfsPointer(filePath: string): Promise<boolean> {
    const fd = await fs.open(filePath, "r");
    const head = Buffer.alloc(100);
    await fd.read(head, 0, 100, 0);
    await fd.close();
    return head.toString().startsWith(`version ${LFS_VERSION}`);
  }

  // Clean all matching files in vault
  async cleanFiles(vaultPath: string, patterns: string[], onProgress?: (file: string, percent: number) => void): Promise<void> {
    const files = (await Promise.all(patterns.map(p => glob(p, { cwd: vaultPath, onlyFiles: true })))).flat();
    for (const file of files) {
      const fullPath = path.join(vaultPath, file);
      if (await this.isLfsPointer(fullPath)) continue;
      await this.clean(fullPath, (percent) => onProgress?.(file, percent));
    }
  }

  // Smudge all matching files in vault
  async smudgeFiles(vaultPath: string, patterns: string[]): Promise<void> {
    const files = (await Promise.all(patterns.map(p => glob(p, { cwd: vaultPath, onlyFiles: true })))).flat();
    for (const file of files) {
      await this.smudge(path.join(vaultPath, file));
    }
  }
}
