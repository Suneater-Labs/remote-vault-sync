# Remote Vault Sync

Back up and sync your vault to S3 with git-based version control.

<table>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/a8db793d-6b09-4d27-a88f-ad8a2d5e0660" alt="Git initialized notification and file badges" /><br/><em>File badges &amp; notifications</em></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/21c70822-483c-4d22-b8fa-084ed82afc87" alt="View changes diff modal" /><br/><em>View changes diff</em></td>
  </tr>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/02e089e9-9e4a-4216-bf66-c176816a335f" alt="Merge modal popup" /><br/><em>Merge conflict resolution</em></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/d269f0e4-66d9-4d7e-93aa-c5065fd4f824" alt="Status bar sync indicator" /><br/><em>Status bar indicator</em></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="https://github.com/user-attachments/assets/4b7eacec-d3d1-4635-8707-2bf0e2be9d81" alt="View commit changes" /><br/><em>View commit changes</em></td>
  </tr>
</table>

## How It Works

Uses native git via `child_process`. The `.git` directory is copied to/from S3 directly. Uses LFS to store large files in S3.

## Files

```
src/
  main.tsx           → Plugin entry, orchestrates git/S3/UI
  commands.ts        → Command palette commands
  settings.tsx       → Settings tab and defaults
  ui/
    StatusBar.tsx    → Status bar component
    RibbonButtons.ts → Push/Pull/Restore ribbon icons
    LogModal.tsx     → Commit history modal
    DiffModal.tsx    → View changes modal
    MergeModal.tsx   → Conflict resolution modal
  utils/
    git.ts           → Native git wrapper (child_process)
    lfs.ts           → Git LFS utilities
    env.ts           → Environment setup for GUI apps
    s3.ts            → S3 client wrapper
    s3-fs.ts         → S3 filesystem operations
```

## Prerequisites

Requires `git` and `git-lfs` installed on your system.

**Windows:**
```powershell
winget install --id Git.Git -e --source winget
winget install --id GitHub.GitLFS -e --source winget
```

**macOS:**
```bash
brew install git git-lfs
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install git git-lfs
```

After installing, run once:
```bash
git lfs install
```

## Setup

1. Create an S3 bucket
2. Create AWS credentials with S3 read/write access
3. Open plugin settings, enter credentials (access key, secret, region, bucket)
4. Click **Connect**
   - If the bucket already has a repo, it pulls it down
   - If empty, it initializes a new git repo

## Usage

**Ribbon buttons:**
- **Push** — Commits changes, merges remote if diverged, uploads .git to S3
- **Pull** — Downloads .git from S3, merges into local
- **Restore** — Discards local changes (git restore)

**Commands:**
- `Push to Remote`
- `Pull from Remote`
- `Restore Changes`
- `Show Log`
- `View Changes`

## S3 Storage Layout

```
s3://bucket/
  .git/                     → git repository (mirrored from local)
    lfs/objects/AB/CD/...   → LFS objects (sharded by SHA256)
```

## Status Bar

Shows current state: synced, uncommitted changes, syncing, or error.

## Build

```bash
npm install
npm run build
```

```bash
npm run lint          # Check for errors
./scripts/install.sh  # Install to test vault
```
