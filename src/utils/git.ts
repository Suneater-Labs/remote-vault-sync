// Native git command wrapper
import { spawn } from "child_process";
import { gitEnv } from "./env";

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export interface Commit {
  oid: string;
  message: string;
  tree: string;
  parent: string[];
  author: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  };
  committer: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  };
  gpgsig?: string;
}

// Platform-aware shell escaping
function shellEscape(s: string): string {
  if (process.platform === "win32") {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// Execute a git command and return stdout
async function exec(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const escaped = args.map(shellEscape);
    const proc = spawn("git", escaped, { cwd, shell: true, env: gitEnv });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => (stdout += data.toString()));
    proc.stderr.on("data", (data: Buffer) => (stderr += data.toString()));

    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trimEnd());
      else reject(new Error(`git ${args[0]} failed: ${stderr || stdout}`));
    });

    proc.on("error", reject);
  });
}

export class Git {
  constructor(private cwd: string) {}

  // Run arbitrary git command with any cwd
  static exec(cwd: string, args: string[]): Promise<string> {
    return exec(cwd, args);
  }

  async init(): Promise<void> {
    await exec(this.cwd, ["init"]);
  }

  async add(filepath: string): Promise<void> {
    await exec(this.cwd, ["add", filepath]);
  }

  async addAll(): Promise<void> {
    await exec(this.cwd, ["add", "-A"]);
  }

  async commit(message: string): Promise<string> {
    const out = await exec(this.cwd, ["commit", "-m", message]);
    // Matches "[branch oid]" or "[branch (root-commit) oid]"
    const match = out.match(/\[[\w-]+(?:\s+\([^)]+\))?\s+([a-f0-9]+)\]/);
    return match?.[1] ?? "";
  }

  async push(remote: string, branch: string): Promise<void> {
    await exec(this.cwd, ["push", remote, branch]);
  }

  async pull(remote: string, branch: string): Promise<void> {
    await exec(this.cwd, ["pull", remote, branch]);
  }

  async fetch(remote: string): Promise<void> {
    await exec(this.cwd, ["fetch", remote]);
  }

  async status(): Promise<GitStatus> {
    const out = await exec(this.cwd, ["status", "--porcelain", "-u"]);
    const result: GitStatus = { staged: [], modified: [], untracked: [], deleted: [] };

    for (const line of out.split("\n").filter(Boolean)) {
      const index = line[0];
      const worktree = line[1];
      const raw = line.slice(3);
      const filepath = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\"/g, '"') : raw;

      if (index === "A" || index === "M" || index === "R") result.staged.push(filepath);
      if (worktree === "M") result.modified.push(filepath);
      if (index === "?" && worktree === "?") result.untracked.push(filepath);
      if (index === "D" || worktree === "D") result.deleted.push(filepath);
    }

    return result;
  }

  async diff(filepath?: string): Promise<string> {
    const args = ["diff"];
    if (filepath) args.push(filepath);
    return exec(this.cwd, args);
  }

  async diffStaged(filepath?: string): Promise<string> {
    const args = ["diff", "--staged"];
    if (filepath) args.push(filepath);
    return exec(this.cwd, args);
  }

  async log(count = 10): Promise<Commit[]> {
    // Format: oid, tree, parents, author name/email/timestamp/tz, committer name/email/timestamp/tz, subject
    const format = "%H%x00%T%x00%P%x00%an%x00%ae%x00%at%x00%ai%x00%cn%x00%ce%x00%ct%x00%ci%x00%s%x00";
    const out = await exec(this.cwd, ["log", `-${count}`, `--format=${format}`]);
    const commits: Commit[] = [];

    for (const entry of out.split("\x00\n").filter(Boolean)) {
      const fields = entry.split("\x00");
      const [oid, tree, parents, authorName, authorEmail, authorTs, authorDate,
             committerName, committerEmail, committerTs, committerDate, message] = fields;

      // Parse timezone offset from ISO date (e.g., "2024-01-15 10:30:00 -0700" -> 420)
      const parseOffset = (isoDate: string): number => {
        const match = isoDate.match(/([+-])(\d{2})(\d{2})$/);
        if (!match) return 0;
        const offset = parseInt(match[2]!, 10) * 60 + parseInt(match[3]!, 10);
        return match[1] === "-" ? offset : -offset;
      };

      commits.push({
        oid: oid ?? "",
        tree: tree ?? "",
        parent: parents ? parents.split(" ").filter(Boolean) : [],
        message: message ?? "",
        author: {
          name: authorName ?? "",
          email: authorEmail ?? "",
          timestamp: parseInt(authorTs ?? "0", 10),
          timezoneOffset: parseOffset(authorDate ?? ""),
        },
        committer: {
          name: committerName ?? "",
          email: committerEmail ?? "",
          timestamp: parseInt(committerTs ?? "0", 10),
          timezoneOffset: parseOffset(committerDate ?? ""),
        },
      });
    }

    return commits;
  }

  async addRemote(name: string, url: string): Promise<void> {
    await exec(this.cwd, ["remote", "add", name, url]);
  }

  async removeRemote(name: string): Promise<void> {
    await exec(this.cwd, ["remote", "remove", name]);
  }

  async listRemotes(): Promise<{ name: string; url: string }[]> {
    const out = await exec(this.cwd, ["remote", "-v"]);
    const remotes: { name: string; url: string }[] = [];
    const seen = new Set<string>();

    for (const line of out.split("\n").filter(Boolean)) {
      const parts = line.split(/\s+/);
      const name = parts[0];
      const url = parts[1];
      if (name && url && !seen.has(name)) {
        seen.add(name);
        remotes.push({ name, url });
      }
    }

    return remotes;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await exec(this.cwd, ["config", key, value]);
  }

  async getConfig(key: string): Promise<string | null> {
    try {
      return await exec(this.cwd, ["config", "--get", key]);
    } catch {
      return null;
    }
  }

  async currentBranch(): Promise<string> {
    return exec(this.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  }

  async checkout(ref: string): Promise<void> {
    await exec(this.cwd, ["checkout", ref]);
  }

  async createBranch(name: string): Promise<void> {
    await exec(this.cwd, ["checkout", "-b", name]);
  }

  async reset(filepath: string): Promise<void> {
    await exec(this.cwd, ["checkout", "--", filepath]);
  }

  async resetHard(ref = "HEAD"): Promise<void> {
    await exec(this.cwd, ["reset", "--hard", ref]);
  }

  async clean(): Promise<void> {
    await exec(this.cwd, ["clean", "-fd"]);
  }

  async rev(ref = "HEAD"): Promise<string> {
    return exec(this.cwd, ["rev-parse", ref]);
  }
}
