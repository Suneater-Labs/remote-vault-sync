import { describe, it, expect } from "vitest";
import { getGitattributes, isLfsAvailable } from "../utils/lfs";

describe("getGitattributes", () => {
  it("returns LFS attributes when lfsAvailable is true", () => {
    const attrs = getGitattributes(true);
    expect(attrs).toContain("*.png filter=lfs diff=lfs merge=lfs -text");
    expect(attrs).toContain("*.mp4 filter=lfs diff=lfs merge=lfs -text");
    expect(attrs).toContain("*.pdf filter=lfs diff=lfs merge=lfs -text");
  });

  it("returns binary attributes when lfsAvailable is false", () => {
    const attrs = getGitattributes(false);
    expect(attrs).toContain("*.png binary");
    expect(attrs).toContain("*.mp4 binary");
    expect(attrs).toContain("*.pdf binary");
    expect(attrs).not.toContain("filter=lfs");
  });
});

describe("isLfsAvailable", () => {
  it("returns a boolean", async () => {
    const result = await isLfsAvailable(process.cwd());
    expect(typeof result).toBe("boolean");
  });
});
