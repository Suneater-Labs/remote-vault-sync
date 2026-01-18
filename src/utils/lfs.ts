import {spawn} from "child_process";
import {Git} from "./git";

// Git attributes for LFS-tracked files (fallback to binary if LFS unavailable)
const LFS_GITATTRIBUTES = `*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.jpeg filter=lfs diff=lfs merge=lfs -text
*.gif filter=lfs diff=lfs merge=lfs -text
*.webp filter=lfs diff=lfs merge=lfs -text
*.bmp filter=lfs diff=lfs merge=lfs -text
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.mov filter=lfs diff=lfs merge=lfs -text
*.webm filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.wav filter=lfs diff=lfs merge=lfs -text
*.flac filter=lfs diff=lfs merge=lfs -text
*.pdf filter=lfs diff=lfs merge=lfs -text
*.zip filter=lfs diff=lfs merge=lfs -text
*.tar filter=lfs diff=lfs merge=lfs -text
*.gz filter=lfs diff=lfs merge=lfs -text
`;

const BINARY_GITATTRIBUTES = `*.png binary
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

// Returns LFS gitattributes if available, otherwise binary fallback
export function getGitattributes(lfsAvailable: boolean): string {
	return lfsAvailable ? LFS_GITATTRIBUTES : BINARY_GITATTRIBUTES;
}

// Check if git-lfs is installed
export async function isLfsAvailable(cwd: string): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("git", ["lfs", "version"], {cwd, shell: true});
		proc.on("close", (code) => resolve(code === 0));
		proc.on("error", () => resolve(false));
	});
}

// Install git-lfs locally in repo (--local flag = no global config)
export async function installLfs(cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn("git", ["lfs", "install", "--local"], {cwd, shell: true});
		let stderr = "";
		proc.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
		proc.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`git lfs install failed: ${stderr}`));
		});
		proc.on("error", reject);
	});
}

// Configure LFS to work offline (disable fetching from remote)
export async function configureLfs(git: Git): Promise<void> {
	// Disable LFS fetching - we handle object storage via S3 sync
	await git.setConfig("lfs.fetchexclude", "*");
	// Ensure filter process is set (should be set by install, but be explicit)
	await git.setConfig("filter.lfs.process", "git-lfs filter-process");
	await git.setConfig("filter.lfs.required", "true");
	await git.setConfig("filter.lfs.clean", "git-lfs clean -- %f");
	await git.setConfig("filter.lfs.smudge", "git-lfs smudge -- %f");
}

// Replace LFS pointer files with actual content
export async function checkoutLfs(cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn("git", ["lfs", "checkout"], {cwd, shell: true});
		let stderr = "";
		proc.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
		proc.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`git lfs checkout failed: ${stderr}`));
		});
		proc.on("error", reject);
	});
}

// Remove unreferenced LFS objects to save space
export async function pruneLfs(cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn("git", ["lfs", "prune"], {cwd, shell: true});
		let stderr = "";
		proc.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
		proc.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`git lfs prune failed: ${stderr}`));
		});
		proc.on("error", reject);
	});
}

// Get OIDs of LFS files in current HEAD
export async function getLfsOids(cwd: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const proc = spawn("git", ["lfs", "ls-files", "--long"], {cwd, shell: true});
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (data: Buffer) => (stdout += data.toString()));
		proc.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
		proc.on("close", (code) => {
			if (code === 0) {
				// Output format: "oid * filename" or "oid - filename"
				const oids = stdout.trim().split("\n")
					.filter(line => line.length > 0)
					.map(line => line.split(" ")[0])
					.filter((oid): oid is string => oid !== undefined);
				resolve(oids);
			} else {
				reject(new Error(`git lfs ls-files failed: ${stderr}`));
			}
		});
		proc.on("error", reject);
	});
}
