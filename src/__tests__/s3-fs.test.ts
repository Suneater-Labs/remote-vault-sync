import { describe, it, expect, beforeEach, vi } from "vitest";
import { S3FS } from "../utils/s3-fs";

const mockS3 = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  head: vi.fn(),
  copy: vi.fn(),
};

describe("S3FS", () => {
  let s3fs: S3FS;

  beforeEach(() => {
    vi.clearAllMocks();
    s3fs = new S3FS(mockS3 as any, "prefix");
  });

  describe("readFile", () => {
    it("calls s3.get with correct key", async () => {
      const content = Buffer.from("hello world");
      mockS3.get.mockResolvedValueOnce(content);

      const result = await s3fs.readFile("path/to/file.txt");

      expect(mockS3.get).toHaveBeenCalledWith("prefix/path/to/file.txt");
      expect(result).toEqual(content);
    });

    it("normalizes leading slashes", async () => {
      mockS3.get.mockResolvedValueOnce(Buffer.from(""));
      await s3fs.readFile("/path/to/file.txt");
      expect(mockS3.get).toHaveBeenCalledWith("prefix/path/to/file.txt");
    });
  });

  describe("writeFile", () => {
    it("writes buffer", async () => {
      mockS3.put.mockResolvedValueOnce(undefined);
      const content = Buffer.from("test");
      await s3fs.writeFile("file.txt", content);
      expect(mockS3.put).toHaveBeenCalledWith("prefix/file.txt", content, undefined, undefined);
    });

    it("writes string", async () => {
      mockS3.put.mockResolvedValueOnce(undefined);
      await s3fs.writeFile("file.txt", "string");
      expect(mockS3.put).toHaveBeenCalledWith("prefix/file.txt", "string", undefined, undefined);
    });

    it("passes onProgress and size to s3.put", async () => {
      mockS3.put.mockResolvedValueOnce(undefined);
      const onProgress = vi.fn();
      await s3fs.writeFile("file.txt", "data", onProgress, 100);
      expect(mockS3.put).toHaveBeenCalledWith("prefix/file.txt", "data", onProgress, 100);
    });
  });

  describe("unlink", () => {
    it("calls s3.delete", async () => {
      mockS3.delete.mockResolvedValueOnce(undefined);
      await s3fs.unlink("file.txt");
      expect(mockS3.delete).toHaveBeenCalledWith("prefix/file.txt");
    });
  });

  describe("readdir", () => {
    it("returns files and directories", async () => {
      const now = new Date();
      mockS3.list.mockResolvedValueOnce({
        objects: [
          { Key: "prefix/dir/file1.txt", Size: 100, LastModified: now },
          { Key: "prefix/dir/file2.txt", Size: 200, LastModified: now },
        ],
        prefixes: [{ Prefix: "prefix/dir/subdir/" }],
      });
      const entries = await s3fs.readdir("dir");
      expect(entries).toHaveLength(3);
      expect(entries.find(e => e.name === "file1.txt")).toMatchObject({ name: "file1.txt", size: 100, isDirectory: false });
      expect(entries.find(e => e.name === "subdir")).toMatchObject({ name: "subdir", isDirectory: true });
    });
  });

  describe("mkdir", () => {
    it("creates empty object with trailing slash", async () => {
      mockS3.put.mockResolvedValueOnce(undefined);
      await s3fs.mkdir("newdir");
      expect(mockS3.put).toHaveBeenCalledWith("prefix/newdir/", Buffer.alloc(0));
    });
  });

  describe("stat", () => {
    it("returns file stats", async () => {
      const mtime = new Date("2024-01-01");
      mockS3.head.mockResolvedValueOnce({ size: 1234, mtime });
      const stats = await s3fs.stat("file.txt");
      expect(stats.size).toBe(1234);
      expect(stats.isFile()).toBe(true);
    });

    it("returns directory stats on fallback", async () => {
      mockS3.head.mockResolvedValueOnce(null);
      mockS3.list.mockResolvedValueOnce({ objects: [{ Key: "prefix/dir/file.txt" }], prefixes: [] });
      const stats = await s3fs.stat("dir");
      expect(stats.isDirectory()).toBe(true);
    });

    it("throws ENOENT", async () => {
      mockS3.head.mockResolvedValueOnce(null);
      mockS3.list.mockResolvedValueOnce({ objects: [], prefixes: [] });
      await expect(s3fs.stat("nope")).rejects.toThrow("ENOENT");
    });
  });

  describe("exists", () => {
    it("returns true for existing", async () => {
      mockS3.head.mockResolvedValueOnce({ size: 100, mtime: new Date() });
      expect(await s3fs.exists("file.txt")).toBe(true);
    });

    it("returns false for missing", async () => {
      mockS3.head.mockResolvedValueOnce(null);
      mockS3.list.mockResolvedValueOnce({ objects: [], prefixes: [] });
      expect(await s3fs.exists("nope")).toBe(false);
    });
  });

  describe("without prefix", () => {
    it("uses path directly as key", async () => {
      s3fs = new S3FS(mockS3 as any);
      mockS3.get.mockResolvedValueOnce(Buffer.from(""));
      await s3fs.readFile("file.txt");
      expect(mockS3.get).toHaveBeenCalledWith("file.txt");
    });
  });
});
