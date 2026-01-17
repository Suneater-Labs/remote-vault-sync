import {debounce, Modal, Notice, Plugin} from 'obsidian';
import {createElement} from 'react';
import {createRoot, Root} from 'react-dom/client';
import {spawn} from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import picomatch from "picomatch";
import {DEFAULT_SETTINGS, VaultSyncSettings, VaultSyncSettingTab} from "./settings";
import {StatusBar, StatusBarProps} from "./ui/StatusBar";
import {RibbonButtons} from "./ui/RibbonButtons";
import {LogModal} from "./ui/LogModal";
import {DiffModal} from "./ui/DiffModal";
import {MergeModal, Resolution} from "./ui/MergeModal";
import {Git, GitStatus} from "./utils/git";
import {S3} from "./utils/s3";
import {S3FS} from "./utils/s3-fs";
import {S3LFS, DEFAULT_GITATTRIBUTES, getLfsPatterns} from "./utils/s3-lfs";
import {createCommands} from "./commands";

// Run arbitrary git command (for commands not wrapped by Git class)
function gitExec(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data: Buffer) => (stdout += data.toString()));
    proc.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`git ${args[0]} failed: ${stderr || stdout}`));
    });
    proc.on("error", reject);
  });
}

export default class VaultSync extends Plugin {
	settings: VaultSyncSettings;
	private statusBarRoot: Root | null = null;
	private statusBarState: StatusBarProps = { status: "disconnected" };
	private git: Git | null = null;
	private s3fs: S3FS | null = null;
	private s3lfs: S3LFS | null = null;
	private pendingMerge: { preHead: string; modal: Modal } | null = null;
	private locked = false;
	private explorerObserver: MutationObserver | null = null;
	private ribbonButtons: RibbonButtons | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new VaultSyncSettingTab(this.app, this));
		this.mountStatusBar();
		this.ribbonButtons = new RibbonButtons(
			this,
			() => { void this.push(); },
			() => { void this.pull(); },
			() => { void this.restore(); }
		);
		createCommands(this).forEach(cmd => this.addCommand(cmd));
		if (this.isConfigured()) {
			this.createS3Client();
			await this.ensureGitIdentity();
		}
		this.app.workspace.onLayoutReady(() => {
			this.ribbonButtons?.reorder();
			this.setupExplorerObserver();
			void this.refreshStatus();
		});

		// Watch for file changes to update status
		this.registerEvent(this.app.vault.on('create', () => void this.refreshStatus()));
		this.registerEvent(this.app.vault.on('modify', () => void this.refreshStatus()));
		this.registerEvent(this.app.vault.on('delete', () => void this.refreshStatus()));
		this.registerEvent(this.app.vault.on('rename', () => void this.refreshStatus()));
	}

	private async _refreshStatus() {
		if (!this.isConfigured()) {
			this.updateStatus({ status: "disconnected" });
			return;
		}

		const hasLocalGit = await this.app.vault.adapter.exists(".git");
		if (!hasLocalGit) {
			this.updateStatus({ status: "disconnected" });
			return;
		}

		try {
			this.git = new Git(this.getVaultPath());
			const status = await this.git.status();
			const isClean = !status.staged.length && !status.modified.length &&
			                !status.untracked.length && !status.deleted.length;
			this.updateStatus({ status: isClean ? "clean" : "changes" });
			this.ribbonButtons?.setRestoreDisabled(isClean);
			this.updateFileDecorations(status);
		} catch {
			this.updateStatus({ status: "error" });
		}
	}

	private refreshStatus = debounce(() => void this._refreshStatus(), 1000);

	// Watch file explorer for folder expand/collapse to re-apply badges
	private setupExplorerObserver() {
		const container = document.querySelector(".nav-files-container");
		if (!container) return;

		this.explorerObserver = new MutationObserver(() => this.refreshStatus());
		this.explorerObserver.observe(container, { childList: true, subtree: true });
	}

	onunload() {
		this.explorerObserver?.disconnect();
		this.ribbonButtons?.destroy();
		this.statusBarRoot?.unmount();
		document.querySelectorAll(".remote-vault-sync-badge").forEach(el => el.remove());
	}

	private mountStatusBar() {
		const el = this.addStatusBarItem();
		this.statusBarRoot = createRoot(el);
		this.renderStatusBar();
	}

	private renderStatusBar() {
		this.statusBarRoot?.render(createElement(StatusBar, this.statusBarState));
	}

	updateStatus(state: StatusBarProps) {
		this.statusBarState = state;
		this.renderStatusBar();
	}

	// Render git status badges in file explorer
	private updateFileDecorations(status: GitStatus) {
		document.querySelectorAll(".remote-vault-sync-badge").forEach(el => el.remove());

		// Priority order: U < M < A < D (later entries override earlier)
		const sources: [string[], string][] = [
			[status.untracked, "U"],
			[status.modified, "M"],
			[status.staged, "A"],
			[status.deleted, "D"],
		];
		const badges = new Map<string, string>();
		for (const [files, badge] of sources) {
			for (const f of files) badges.set(f, badge);
		}

		const untrackedDirs = status.untracked.filter(f => f.endsWith("/"));
		const elements = document.querySelectorAll<HTMLElement>(".nav-file-title[data-path]");

		elements.forEach(el => {
			const filePath = el.dataset.path ?? "";
			let badge = badges.get(filePath);
			if (!badge) {
				for (const dir of untrackedDirs) {
					if (filePath.startsWith(dir)) { badge = "U"; break; }
				}
			}
			if (!badge) return;
			const span = document.createElement("span");
			span.className = `remote-vault-sync-badge remote-vault-sync-badge-${badge}`;
			span.textContent = badge;
			el.appendChild(span);
		});
	}

	private isConfigured(): boolean {
		const { s3 } = this.settings;
		return Boolean(s3.accessKeyId && s3.secretAccessKey && s3.region && s3.bucket);
	}

	private getVaultPath(): string {
		const adapter = this.app.vault.adapter;
		if ('basePath' in adapter && typeof adapter.basePath === 'string') {
			return adapter.basePath;
		}
		throw new Error("Could not get vault path");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<VaultSyncSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private createS3Client() {
		const s3 = new S3(this.settings.s3);
		this.s3fs = new S3FS(s3);
		this.s3lfs = new S3LFS(s3);
	}

	private async configureGit() {
		if (!this.git) return;
		await this.git.setConfig("filter.lfs.clean", "cat");
		await this.git.setConfig("filter.lfs.smudge", "cat");
		await this.git.setConfig("filter.lfs.required", "false");
	}

	// Set default user identity if not configured
	private async ensureGitIdentity() {
		if (!this.git) return;
		const name = await this.git.getConfig("user.name");
		const email = await this.git.getConfig("user.email");
		if (!name) await this.git.setConfig("user.name", "remote-vault-sync");
		if (!email) await this.git.setConfig("user.email", "remote-vault-sync@local");
	}

	// Generate descriptive commit message from status
	private generateCommitMessage(status: GitStatus): string {
		const parts: string[] = [];
		if (status.untracked.length) parts.push(`add ${status.untracked.length} file(s)`);
		if (status.modified.length) parts.push(`update ${status.modified.length} file(s)`);
		if (status.deleted.length) parts.push(`delete ${status.deleted.length} file(s)`);
		return parts.length ? parts.join(", ") : "vault sync";
	}

	async connect() {
		if (!this.isConfigured()) {
			new Notice("Please fill in all S3 settings first");
			return;
		}

		try {
			this.git = new Git(this.getVaultPath());
			const hasLocalGit = await this.app.vault.adapter.exists(".git");
			const hasRemoteGit = await this.s3fs!.exists(".git/HEAD");

			if (!hasLocalGit && hasRemoteGit) {
				this.updateStatus({ status: "syncing", step: "Pulling from Remote..." });
				await this.copyDirFromS3(".git");
				await this.configureGit();
				await this.git.checkout(".");
				const patterns = await getLfsPatterns(this.getVaultPath());
				await this.s3lfs!.smudgeFiles(this.getVaultPath(), patterns);
				new Notice("Pulled from Remote");
			} else if (!hasLocalGit) {
				this.updateStatus({ status: "syncing", step: "Initializing..." });
				await this.git.init();
				await this.configureGit();
				const gitignore = `**/.DS_Store\n${this.app.vault.configDir}/**\n.trash/**\n`;
				await this.app.vault.adapter.write(".gitignore", gitignore);
				new Notice("Initialized git repo");
			} else {
				new Notice("Connected");
			}

			await this.ensureGitAttributes();
			this.refreshStatus();
		} catch (e) {
			console.error("[remote-vault-sync] Connect failed:", e);
			new Notice(`Connect failed: ${e instanceof Error ? e.message : String(e)}`);
			this.updateStatus({ status: "error" });
		}
	}

	async push() {
		if (this.locked) return;
		if (!this.s3fs || !this.git || !this.s3lfs) {
			new Notice("Not connected");
			return;
		}

		const status = await this.git.status();
		const hasChanges = status.staged.length || status.modified.length ||
		                   status.untracked.length || status.deleted.length;
		const localHead = await this.git.rev("HEAD");
		const remoteHead = await this.getRemoteHead();

		// Nothing to do if clean and in sync
		if (!hasChanges && localHead === remoteHead) {
			new Notice("Already up to date");
			return;
		}

		this.locked = true;
		this.ribbonButtons?.setLocked(true);
		try {
			// Only commit if there are changes
			if (hasChanges) {
				this.updateStatus({ status: "syncing", step: "Syncing..." });
				const patterns = await getLfsPatterns(this.getVaultPath());
				const match = picomatch(patterns);
				const lfsFiles = [...status.untracked, ...status.modified].filter(f => match(f));
				for (const file of lfsFiles) {
					this.updateStatus({ status: "syncing", step: `Uploading ${file} (0%)` });
					await this.s3lfs.clean(path.join(this.getVaultPath(), file), (pct) => {
						this.updateStatus({ status: "syncing", step: `Uploading ${file} (${pct}%)` });
					});
				}
				this.updateStatus({ status: "syncing", step: "Committing..." });
				await this.git.addAll();
				await this.git.commit(this.generateCommitMessage(status));
			}

			// Re-check HEAD after potential commit
			const newLocalHead = await this.git.rev("HEAD");
			if (remoteHead && remoteHead !== newLocalHead) {
				// Check if remote is ancestor of local (fast-forward)
				try {
					await gitExec(this.getVaultPath(), ["merge-base", "--is-ancestor", remoteHead, newLocalHead]);
					// Remote is ancestor, safe to push
				} catch {
					// Diverged - need to merge first
					await this.pullAndMerge();
					if (this.pendingMerge) return; // Conflict modal open, push continues after resolution
				}
			}

			this.updateStatus({ status: "syncing", step: "Pushing .git..." });
			await this.copyDirToS3(".git");
			new Notice("Pushed to Remote");
			this.refreshStatus();
		} catch (e) {
			console.error("[remote-vault-sync] Push failed:", e);
			new Notice(`Push failed: ${e instanceof Error ? e.message : String(e)}`);
			this.updateStatus({ status: "error" });
		} finally {
			this.ribbonButtons?.setLocked(false);
			this.locked = false;
		}
	}

	async pull() {
		if (this.locked) return;
		if (!this.git || !this.s3fs || !this.s3lfs) {
			new Notice("Not connected");
			return;
		}

		// Check if already in sync
		const localHead = await this.git.rev("HEAD");
		const remoteHead = await this.getRemoteHead();
		if (localHead === remoteHead) {
			new Notice("Already up to date");
			return;
		}

		this.locked = true;
		this.ribbonButtons?.setLocked(true);
		try {
			const vaultPath = this.getVaultPath();
			const tempDir = path.join(os.tmpdir(), "remote-vault-sync-remote");

			// Download S3 .git to temp directory
			this.updateStatus({ status: "syncing", step: "Fetching from S3..." });
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.mkdir(tempDir, { recursive: true });
			await this.copyDirFromS3ToPath(".git", path.join(tempDir, ".git"));

			// Fetch and merge
			this.updateStatus({ status: "syncing", step: "Merging..." });
			await gitExec(vaultPath, ["fetch", tempDir, "main"]);
			await fs.rm(tempDir, { recursive: true, force: true });
			await gitExec(vaultPath, ["merge", "FETCH_HEAD", "-m", "merge remote"]);

			// Restore LFS files
			const patterns = await getLfsPatterns(vaultPath);
			await this.s3lfs.smudgeFiles(vaultPath, patterns);

			new Notice("Pulled from Remote");
		} catch (e) {
			console.error("[remote-vault-sync] Pull failed:", e);
			new Notice(`Pull failed: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.ribbonButtons?.setLocked(false);
			this.locked = false;
		}
	}

	async restore() {
		if (this.locked) return;
		if (!this.git || !this.s3lfs) {
			new Notice("Not connected");
			return;
		}

		// Show confirmation modal
		const confirmed = await new Promise<boolean>((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText("Discard Changes?");
			modal.contentEl.createEl("p", { text: "This will discard all local changes. Continue?" });
			const btnContainer = modal.contentEl.createDiv({ cls: "modal-button-container" });
			btnContainer.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
				modal.close();
				resolve(false);
			});
			const yesBtn = btnContainer.createEl("button", { text: "Yes", cls: "mod-warning" });
			yesBtn.addEventListener("click", () => {
				modal.close();
				resolve(true);
			});
			modal.open();
		});

		if (!confirmed) return;

		this.locked = true;
		this.ribbonButtons?.setLocked(true);
		try {
			this.updateStatus({ status: "syncing", step: "Restoring..." });
			await gitExec(this.getVaultPath(), ["restore", "."]);
			const patterns = await getLfsPatterns(this.getVaultPath());
			await this.s3lfs.smudgeFiles(this.getVaultPath(), patterns);
			new Notice("Restored");
			this.refreshStatus();
		} catch (e) {
			console.error("[remote-vault-sync] Restore failed:", e);
			new Notice(`Restore failed: ${e instanceof Error ? e.message : String(e)}`);
			this.updateStatus({ status: "error" });
		} finally {
			this.ribbonButtons?.setLocked(false);
			this.locked = false;
		}
	}

	async commit(message: string) {
		if (!this.git || !this.s3lfs) {
			new Notice("Not connected");
			return;
		}

		try {
			this.updateStatus({ status: "syncing", step: "Processing LFS..." });
			const patterns = await getLfsPatterns(this.getVaultPath());
			await this.s3lfs.cleanFiles(this.getVaultPath(), patterns);
			this.updateStatus({ status: "syncing", step: "Committing..." });
			await this.git.addAll();
			await this.git.commit(message);
			new Notice("Committed");
			this.refreshStatus();
		} catch (e) {
			console.error("[remote-vault-sync] Commit failed:", e);
			new Notice(`Commit failed: ${e instanceof Error ? e.message : String(e)}`);
			this.updateStatus({ status: "error" });
		}
	}

	async showLogModal() {
		if (!this.git) {
			new Notice("Not connected");
			return;
		}

		try {
			const commits = await this.git.log(500);
			const modal = new Modal(this.app);
			modal.titleEl.setText("Commit History");

			// Make header sticky: modal content as flex column, content area scrolls
			modal.modalEl.style.display = "flex";
			modal.modalEl.style.flexDirection = "column";
			modal.modalEl.style.maxHeight = "80vh";
			modal.contentEl.style.overflow = "auto";
			modal.contentEl.style.flex = "1";

			const root = createRoot(modal.contentEl);
			root.render(createElement(LogModal, {commits}));
			modal.onClose = () => root.unmount();
			modal.open();
		} catch (e) {
			console.error("[remote-vault-sync] Log failed:", e);
			new Notice(`Failed to get log: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async showDiffModal() {
		if (!this.git) {
			new Notice("Not connected");
			return;
		}

		try {
			const diff = await this.git.diff();
			const status = await this.git.status();
			const modal = new Modal(this.app);
			modal.titleEl.setText("Changes");

			// Make header sticky: modal content as flex column, content area scrolls
			modal.modalEl.style.display = "flex";
			modal.modalEl.style.flexDirection = "column";
			modal.modalEl.style.maxHeight = "80vh";
			modal.contentEl.style.overflow = "auto";
			modal.contentEl.style.flex = "1";

			const root = createRoot(modal.contentEl);
			root.render(createElement(DiffModal, {app: this.app, diff, status}));
			modal.onClose = () => root.unmount();
			modal.open();
		} catch (e) {
			console.error("[remote-vault-sync] Diff failed:", e);
			new Notice(`Failed to get diff: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	private async ensureGitAttributes() {
		if (await this.app.vault.adapter.exists(".gitattributes")) return;
		await this.app.vault.adapter.write(".gitattributes", DEFAULT_GITATTRIBUTES);
	}

	private async copyDirToS3(dir: string) {
		if (!this.s3fs) return;
		const vaultPath = this.getVaultPath();

		const walk = async (localDir: string, s3Prefix: string) => {
			const entries = await fs.readdir(path.join(vaultPath, localDir), { withFileTypes: true });
			for (const entry of entries) {
				const localPath = path.join(localDir, entry.name);
				const s3Key = `${s3Prefix}/${entry.name}`;
				if (entry.isDirectory()) {
					await walk(localPath, s3Key);
				} else {
					const content = await fs.readFile(path.join(vaultPath, localPath));
					await this.s3fs!.writeFile(s3Key, content);
				}
			}
		};

		await walk(dir, dir);
	}

	private async copyDirFromS3(dir: string) {
		if (!this.s3fs) return;
		const vaultPath = this.getVaultPath();

		const entries = await this.s3fs.readdir(dir);
		for (const entry of entries) {
			const s3Key = `${dir}/${entry.name}`;
			const localPath = path.join(vaultPath, s3Key);

			if (entry.isDirectory) {
				await this.copyDirFromS3(s3Key);
			} else {
				const content = await this.s3fs.readFile(s3Key);
				await fs.mkdir(path.dirname(localPath), { recursive: true });
				await fs.writeFile(localPath, content);
			}
		}
	}

	// Copy S3 directory to arbitrary local path (not vault-relative)
	private async copyDirFromS3ToPath(s3Dir: string, localDir: string) {
		if (!this.s3fs) return;

		const entries = await this.s3fs.readdir(s3Dir);
		for (const entry of entries) {
			const s3Key = `${s3Dir}/${entry.name}`;
			const localPath = path.join(localDir, entry.name);

			if (entry.isDirectory) {
				await this.copyDirFromS3ToPath(s3Key, localPath);
			} else {
				const content = await this.s3fs.readFile(s3Key);
				await fs.mkdir(path.dirname(localPath), { recursive: true });
				await fs.writeFile(localPath, content);
			}
		}
	}

	// Read remote HEAD SHA from S3
	private async getRemoteHead(): Promise<string | null> {
		if (!this.s3fs) return null;
		try {
			const headContent = (await this.s3fs.readFile(".git/HEAD")).toString().trim();
			// HEAD is either a ref (ref: refs/heads/main) or a SHA
			if (headContent.startsWith("ref: ")) {
				const ref = headContent.slice(5);
				const sha = (await this.s3fs.readFile(`.git/${ref}`)).toString().trim();
				return sha;
			}
			return headContent;
		} catch {
			return null;
		}
	}

	// Fetch remote and merge, showing conflict modal if needed
	private async pullAndMerge() {
		if (!this.git || !this.s3fs) return;

		const preHead = await this.git.rev("HEAD");
		const tempDir = path.join(os.tmpdir(), "remote-vault-sync-remote");

		// Download remote .git to temp directory
		this.updateStatus({ status: "syncing", step: "Fetching remote..." });
		await fs.rm(tempDir, { recursive: true, force: true });
		await fs.mkdir(tempDir, { recursive: true });
		await this.copyDirFromS3ToPath(".git", path.join(tempDir, ".git"));

		// Fetch remote commits into local repo
		const vaultPath = this.getVaultPath();
		await gitExec(vaultPath, ["fetch", tempDir, "main"]);
		await fs.rm(tempDir, { recursive: true, force: true });

		// Merge remote into local
		this.updateStatus({ status: "syncing", step: "Merging..." });
		try {
			await gitExec(vaultPath, ["merge", "FETCH_HEAD", "-m", "merge remote"]);
		} catch (e) {
			// Check for conflicts
			const out = await gitExec(vaultPath, ["diff", "--name-only", "--diff-filter=U"]);
			const conflicts = out.trim() ? out.trim().split("\n") : [];
			if (conflicts.length) {
				await this.showMergeModal(conflicts, preHead);
				return;
			}
			throw e;
		}
	}

	// Show merge conflict resolution modal
	private async showMergeModal(conflicts: string[], preHead: string) {
		if (!this.git) return;

		// Read conflict content in parallel
		const entries = await Promise.all(
			conflicts.map(async file => {
				const content = await this.app.vault.adapter.read(file).catch(() => "[Could not read file]");
				return [file, content] as const;
			})
		);
		const conflictContents: Record<string, string> = Object.fromEntries(entries);

		const modal = new Modal(this.app);
		modal.titleEl.setText("Merge Conflicts");

		modal.modalEl.style.display = "flex";
		modal.modalEl.style.flexDirection = "column";
		modal.modalEl.style.maxHeight = "80vh";
		modal.modalEl.style.width = "800px";
		modal.contentEl.style.overflow = "auto";
		modal.contentEl.style.flex = "1";

		this.pendingMerge = { preHead, modal };

		const root = createRoot(modal.contentEl);
		root.render(createElement(MergeModal, {
			conflicts,
			conflictContents,
			onResolve: (resolutions) => { void this.resolveMerge(resolutions, conflicts); },
			onCancel: () => { modal.close(); },
		}));
		modal.onClose = () => {
			root.unmount();
			if (this.pendingMerge?.modal === modal) {
				void this.cancelMerge(preHead);
			}
		};
		modal.open();
	}

	// Apply merge resolutions and complete merge
	private async resolveMerge(resolutions: Record<string, Resolution>, conflicts: string[]) {
		if (!this.git || !this.s3lfs) return;

		try {
			this.updateStatus({ status: "syncing", step: "Applying resolutions..." });
			const vaultPath = this.getVaultPath();

			for (const file of conflicts) {
				const resolution = resolutions[file];
				if (resolution === "ours") {
					await gitExec(vaultPath, ["checkout", "--ours", file]);
				} else if (resolution === "theirs") {
					await gitExec(vaultPath, ["checkout", "--theirs", file]);
				} else {
					// "both" - keep file as-is but strip conflict markers
					const content = await this.app.vault.adapter.read(file);
					const cleaned = this.stripConflictMarkers(content);
					await this.app.vault.adapter.write(file, cleaned);
				}
				await this.git.add(file);
			}

			await this.git.commit("resolve merge conflicts");

			// Clear pendingMerge before closing to prevent cancelMerge from running
			const modalToClose = this.pendingMerge?.modal;
			this.pendingMerge = null;
			modalToClose?.close();

			// Restore LFS files after merge
			const patterns = await getLfsPatterns(this.getVaultPath());
			await this.s3lfs.smudgeFiles(this.getVaultPath(), patterns);

			// Continue with push
			this.updateStatus({ status: "syncing", step: "Pushing .git..." });
			await this.copyDirToS3(".git");
			new Notice("Pushed to Remote");
			this.refreshStatus();
		} catch (e) {
			console.error("[remote-vault-sync] Resolve failed:", e);
			new Notice(`Resolve failed: ${e instanceof Error ? e.message : String(e)}`);
			this.updateStatus({ status: "error" });
		}
	}

	// Cancel merge and restore pre-merge state
	private async cancelMerge(preHead: string) {
		if (!this.git || !this.s3lfs || !this.pendingMerge) return;

		// Clear first to prevent re-entry from onClose
		this.pendingMerge = null;

		try {
			this.updateStatus({ status: "syncing", step: "Aborting merge..." });
			const vaultPath = this.getVaultPath();
			await gitExec(vaultPath, ["merge", "--abort"]);
			await this.git.resetHard(preHead);

			// Restore LFS files
			const patterns = await getLfsPatterns(this.getVaultPath());
			await this.s3lfs.smudgeFiles(this.getVaultPath(), patterns);

			new Notice("Merge cancelled");
			this.updateStatus({ status: "changes" });
		} catch (e) {
			console.error("[remote-vault-sync] Cancel merge failed:", e);
			new Notice(`Cancel failed: ${e instanceof Error ? e.message : String(e)}`);
			this.updateStatus({ status: "error" });
		}
	}

	// Strip conflict markers, keeping both versions concatenated
	private stripConflictMarkers(content: string): string {
		return content
			.replace(/^<<<<<<< HEAD\n/gm, "")
			.replace(/^=======\n/gm, "")
			.replace(/^>>>>>>> .*\n/gm, "");
	}
}
