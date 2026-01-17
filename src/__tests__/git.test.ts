import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Git } from "../utils/git";

describe("Git", () => {
  let tempDir: string;
  let git: Git;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "git-test-"));
    git = new Git(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("init", () => {
    it("creates a git repository", async () => {
      await git.init();
      const { stat } = await import("fs/promises");
      const gitDir = await stat(join(tempDir, ".git"));
      expect(gitDir.isDirectory()).toBe(true);
    });
  });

  describe("add and status", () => {
    beforeEach(async () => {
      await git.init();
      await git.setConfig("user.email", "test@test.com");
      await git.setConfig("user.name", "Test");
    });

    it("tracks untracked files", async () => {
      await writeFile(join(tempDir, "test.txt"), "hello");
      const status = await git.status();
      expect(status.untracked).toContain("test.txt");
    });

    it("stages files with add", async () => {
      await writeFile(join(tempDir, "test.txt"), "hello");
      await git.add("test.txt");
      const status = await git.status();
      expect(status.staged).toContain("test.txt");
    });

    it("addAll stages all files", async () => {
      await writeFile(join(tempDir, "a.txt"), "a");
      await writeFile(join(tempDir, "b.txt"), "b");
      await git.addAll();
      const status = await git.status();
      expect(status.staged).toContain("a.txt");
      expect(status.staged).toContain("b.txt");
    });
  });

  describe("commit", () => {
    beforeEach(async () => {
      await git.init();
      await git.setConfig("user.email", "test@test.com");
      await git.setConfig("user.name", "Test");
    });

    it("creates a commit and returns oid", async () => {
      await writeFile(join(tempDir, "test.txt"), "hello");
      await git.add("test.txt");
      const oid = await git.commit("Initial commit");
      expect(oid).toMatch(/^[a-f0-9]+$/);
    });

    it("commit appears in log", async () => {
      await writeFile(join(tempDir, "test.txt"), "hello");
      await git.add("test.txt");
      await git.commit("Test message");
      const log = await git.log(1);
      expect(log[0]?.message).toBe("Test message");
    });
  });

  describe("log", () => {
    beforeEach(async () => {
      await git.init();
      await git.setConfig("user.email", "test@test.com");
      await git.setConfig("user.name", "Test");
    });

    it("returns commit history", async () => {
      await writeFile(join(tempDir, "a.txt"), "a");
      await git.add("a.txt");
      await git.commit("First");

      await writeFile(join(tempDir, "b.txt"), "b");
      await git.add("b.txt");
      await git.commit("Second");

      const log = await git.log(2);
      expect(log).toHaveLength(2);
      expect(log[0]?.message).toBe("Second");
      expect(log[1]?.message).toBe("First");
    });
  });

  describe("diff", () => {
    beforeEach(async () => {
      await git.init();
      await git.setConfig("user.email", "test@test.com");
      await git.setConfig("user.name", "Test");
    });

    it("shows diff for modified files", async () => {
      await writeFile(join(tempDir, "test.txt"), "hello");
      await git.add("test.txt");
      await git.commit("Initial");

      await writeFile(join(tempDir, "test.txt"), "hello world");
      const diff = await git.diff("test.txt");
      expect(diff).toContain("-hello");
      expect(diff).toContain("+hello world");
    });
  });

  describe("branch operations", () => {
    beforeEach(async () => {
      await git.init();
      await git.setConfig("user.email", "test@test.com");
      await git.setConfig("user.name", "Test");
      await writeFile(join(tempDir, "init.txt"), "init");
      await git.add("init.txt");
      await git.commit("Initial");
    });

    it("gets current branch", async () => {
      const branch = await git.currentBranch();
      expect(["main", "master"]).toContain(branch);
    });

    it("creates and switches to new branch", async () => {
      await git.createBranch("feature");
      const branch = await git.currentBranch();
      expect(branch).toBe("feature");
    });
  });

  describe("config", () => {
    beforeEach(async () => {
      await git.init();
    });

    it("sets and gets config values", async () => {
      await git.setConfig("user.email", "foo@bar.com");
      const email = await git.getConfig("user.email");
      expect(email).toBe("foo@bar.com");
    });

    it("returns null for missing config", async () => {
      const val = await git.getConfig("nonexistent.key");
      expect(val).toBeNull();
    });
  });

  describe("reset", () => {
    beforeEach(async () => {
      await git.init();
      await git.setConfig("user.email", "test@test.com");
      await git.setConfig("user.name", "Test");
      await writeFile(join(tempDir, "test.txt"), "original");
      await git.add("test.txt");
      await git.commit("Initial");
    });

    it("resets file to committed state", async () => {
      await writeFile(join(tempDir, "test.txt"), "modified");
      await git.reset("test.txt");
      const { readFile } = await import("fs/promises");
      const content = await readFile(join(tempDir, "test.txt"), "utf8");
      expect(content).toBe("original");
    });
  });

  describe("remotes", () => {
    beforeEach(async () => {
      await git.init();
    });

    it("adds and lists remotes", async () => {
      await git.addRemote("origin", "https://example.com/repo.git");
      const remotes = await git.listRemotes();
      expect(remotes).toContainEqual({ name: "origin", url: "https://example.com/repo.git" });
    });

    it("removes remotes", async () => {
      await git.addRemote("origin", "https://example.com/repo.git");
      await git.removeRemote("origin");
      const remotes = await git.listRemotes();
      expect(remotes).toHaveLength(0);
    });
  });
});
