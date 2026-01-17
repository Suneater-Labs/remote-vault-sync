# Remote Vault Sync

Back up and sync your vault to S3 with git-based version control.

## How It Works

Uses native git via `child_process`. The `.git` directory is copied to/from S3 directly. Uses LFS to store large files in S3.

## Files

```
src/
  main.tsx           → Plugin entry, orchestrates git/S3/UI
  commands.ts        → Command palette commands
  settings.ts        → Settings tab and defaults
  ui/
    StatusBar.tsx    → Status bar component
    RibbonButtons.ts → Push/Pull/Restore ribbon icons
    LogModal.tsx     → Commit history modal
    DiffModal.tsx    → View changes modal
    MergeModal.tsx   → Conflict resolution modal
  utils/
    git.ts           → Native git wrapper (child_process)
    s3.ts            → S3 client wrapper
    s3-fs.ts         → S3 filesystem operations
    s3-lfs.ts        → LFS clean/smudge with S3 storage
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
  .git/           → git repository (mirrored from local)
  lfs/ab/cd/...   → large files (sharded by SHA256)
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
