// S3-backed filesystem adapter
import { S3 } from "./s3";

export interface DirEntry {
  name: string;
  size: number;
  mtime: Date;
  isDirectory: boolean;
}

export interface Stats {
  size: number;
  mtime: Date;
  isFile: () => boolean;
  isDirectory: () => boolean;
}

export class S3FS {
  private prefix: string;

  constructor(private s3: S3, prefix = "") {
    // Normalize: ensure trailing slash if non-empty
    this.prefix = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
  }

  private key(path: string): string {
    const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "");
    return this.prefix ? `${this.prefix}${normalized}` : normalized;
  }

  private dirKey(path: string): string {
    const k = this.key(path);
    return k ? (k.endsWith("/") ? k : `${k}/`) : "";
  }

  async readFile(path: string): Promise<Buffer> {
    return this.s3.get(this.key(path));
  }

  async writeFile(path: string, data: Buffer | string, onProgress?: (percent: number) => void, size?: number): Promise<void> {
    await this.s3.put(this.key(path), data, onProgress, size);
  }

  async unlink(path: string): Promise<void> {
    await this.s3.delete(this.key(path));
  }

  async readdir(dirPath: string): Promise<DirEntry[]> {
    const prefix = dirPath === "" || dirPath === "." ? this.prefix : this.dirKey(dirPath);
    const { objects, prefixes } = await this.s3.list(prefix, "/");

    const files = objects.flatMap(obj => {
      if (!obj.Key) return [];
      const name = obj.Key.slice(prefix.length);
      if (!name || name.includes("/")) return [];
      return [{ name, size: obj.Size ?? 0, mtime: obj.LastModified ?? new Date(), isDirectory: false }];
    });

    const dirs = prefixes.flatMap(p => {
      if (!p.Prefix) return [];
      const name = p.Prefix.slice(prefix.length).replace(/\/$/, "");
      if (!name) return [];
      return [{ name, size: 0, mtime: new Date(), isDirectory: true }];
    });

    return [...files, ...dirs];
  }

  async mkdir(path: string): Promise<void> {
    await this.s3.put(this.dirKey(path), Buffer.alloc(0));
  }

  async rmdir(dirPath: string): Promise<void> {
    const { objects } = await this.s3.list(this.dirKey(dirPath));
    await this.s3.delete(objects.flatMap(o => o.Key ? [o.Key] : []));
  }

  async stat(path: string): Promise<Stats> {
    const meta = await this.s3.head(this.key(path));
    if (meta) {
      return {
        size: meta.size,
        mtime: meta.mtime,
        isFile: () => true,
        isDirectory: () => false,
      };
    }

    // Check if it's a directory by listing with prefix
    const { objects, prefixes } = await this.s3.list(this.dirKey(path), "/");
    if (objects.length > 0 || prefixes.length > 0) {
      return {
        size: 0,
        mtime: new Date(),
        isFile: () => false,
        isDirectory: () => true,
      };
    }

    throw new Error(`ENOENT: no such file or directory: ${path}`);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.copyFile(oldPath, newPath);
    await this.unlink(oldPath);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await this.s3.copy(this.key(src), this.key(dest));
  }
}
