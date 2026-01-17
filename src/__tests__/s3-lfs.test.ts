import { describe, it, expect } from "vitest";
import { getLfsPatterns, DEFAULT_GITATTRIBUTES } from "../utils/s3-lfs";

describe("getLfsPatterns", () => {
  it("parses DEFAULT_GITATTRIBUTES", () => {
    const patterns = DEFAULT_GITATTRIBUTES.split("\n")
      .filter(line => line.includes("binary"))
      .map(line => line.split(/\s+/)[0])
      .filter((p): p is string => !!p);
    expect(patterns).toContain("*.png");
    expect(patterns).toContain("*.mp4");
    expect(patterns).toContain("*.pdf");
  });
});
