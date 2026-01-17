// Modal showing file diffs grouped by file in cards
import {useState, useCallback} from "react";
import type {App} from "obsidian";
import type {GitStatus} from "../utils/git";

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg)$/i;

function getFileType(filename: string): "video" | "image" | "text" {
  if (VIDEO_EXT.test(filename)) return "video";
  if (IMAGE_EXT.test(filename)) return "image";
  return "text";
}

export interface DiffModalProps {
  app: App;
  diff: string;
  status: GitStatus;
}

interface FileDiff {
  filename: string;
  type: "added" | "modified" | "deleted";
  hunkHeader?: string;
  hunks: string[];
  collapsed: boolean;
}

// Parse raw git diff into per-file chunks
function parseDiff(diff: string): FileDiff[] {
  if (!diff.trim()) return [];
  const files: FileDiff[] = [];
  const chunks = diff.split(/(?=^diff --git )/m).filter(Boolean);

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const headerMatch = lines[0]?.match(/^diff --git a\/(.+) b\//);
    if (!headerMatch) continue;

    const filename = headerMatch[1];
    let type: FileDiff["type"] = "modified";
    if (chunk.includes("new file mode")) type = "added";
    else if (chunk.includes("deleted file mode")) type = "deleted";

    // Extract hunk header and content separately
    let hunkHeader: string | undefined;
    const hunks: string[] = [];
    let inHunk = false;
    for (const line of lines) {
      if (line.startsWith("@@")) {
        if (!inHunk) {
          hunkHeader = line;
          inHunk = true;
        } else {
          hunks.push(line);
        }
      } else if (inHunk) {
        hunks.push(line);
      }
    }

    // New/deleted files start collapsed; modified start expanded
    files.push({
      filename: filename ?? "",
      type,
      hunkHeader,
      hunks,
      collapsed: type !== "modified",
    });
  }

  return files;
}

// Badge colors for change type
const typeBadge = {
  added: "bg-green-500/20 text-green-500",
  modified: "bg-yellow-500/20 text-yellow-500",
  deleted: "bg-red-500/20 text-red-500",
};

// Line colors
function getLineClass(line: string): string {
  if (line.startsWith("@@")) return "text-(--text-accent)";
  if (line.startsWith("+")) return "text-green-500";
  if (line.startsWith("-")) return "text-red-500";
  return "text-(--text-muted)";
}

// Renders file content based on type (video/image/text)
function FileContent({file, app, loadedContent}: {file: FileDiff; app: App; loadedContent: string[]}) {
  const type = getFileType(file.filename);

  // Diff hunks always render as text lines
  if (file.hunks.length) {
    return (
      <div className="p-2 font-mono text-xs overflow-x-auto border-t border-(--background-modifier-border)">
        {file.hunks.map((line, i) => (
          <div key={i} className={`whitespace-pre ${getLineClass(line)}`}>{line || " "}</div>
        ))}
      </div>
    );
  }

  // New binary files: show media preview
  const src = app.vault.adapter.getResourcePath(file.filename);
  if (type === "video") {
    return (
      <div className="p-2 border-t border-(--background-modifier-border) flex justify-center">
        <video src={src} controls style={{maxWidth: "100%", maxHeight: "16rem"}} />
      </div>
    );
  }
  if (type === "image") {
    return (
      <div className="p-2 border-t border-(--background-modifier-border) flex justify-center">
        <img src={src} style={{maxWidth: "100%", maxHeight: "16rem"}} />
      </div>
    );
  }

  // New text files: show loaded content as green lines
  if (loadedContent.length) {
    return (
      <div className="p-2 font-mono text-xs overflow-x-auto border-t border-(--background-modifier-border)">
        {loadedContent.map((line, i) => (
          <div key={i} className={`whitespace-pre ${getLineClass(line)}`}>{line || " "}</div>
        ))}
      </div>
    );
  }

  return null;
}

export const DiffModal = ({app, diff, status}: DiffModalProps) => {
  // Combine parsed diff with untracked files
  const initialFiles = (): FileDiff[] => {
    const diffFiles = parseDiff(diff);
    const diffFilenames = new Set(diffFiles.map(f => f.filename));
    const untracked = status.untracked
      .filter(f => !diffFilenames.has(f))
      .map((filename): FileDiff => ({
        filename,
        type: "added",
        hunks: [],
        collapsed: true,
      }));
    return [...diffFiles, ...untracked];
  };

  const [files, setFiles] = useState(initialFiles);
  const [loadedContent, setLoadedContent] = useState<Record<string, string[]>>({});

  // Toggle collapse state for a file
  const toggleCollapse = useCallback(async (index: number) => {
    const file = files[index];
    if (!file) return;

    // If expanding an untracked text file, load its content
    const type = getFileType(file.filename);
    if (file.collapsed && file.type === "added" && !file.hunks.length && type === "text" && !loadedContent[file.filename]) {
      try {
        const content = await app.vault.adapter.read(file.filename);
        const lines = content.split("\n").map(line => `+${line}`);
        setLoadedContent(prev => ({...prev, [file.filename]: lines}));
      } catch {
        setLoadedContent(prev => ({...prev, [file.filename]: ["+[Could not read file]"]}));
      }
    }

    setFiles(prev => prev.map((f, i) => i === index ? {...f, collapsed: !f.collapsed} : f));
  }, [files, app, loadedContent]);

  if (!files.length) {
    return <div className="remote-vault-sync text-(--text-muted) p-4">No changes</div>;
  }

  return (
    <div className="remote-vault-sync p-2">
      {files.map((file, index) => (
        <div key={file.filename} style={{contentVisibility: "auto", containIntrinsicSize: "auto 48px"}} className="pb-2">
          <div className="rounded bg-(--background-secondary) border border-(--background-modifier-border) overflow-hidden">
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-(--background-modifier-hover) sticky top-0 bg-(--background-secondary) z-10"
              onClick={() => void toggleCollapse(index)}
            >
              <span className="text-(--text-muted)">{file.collapsed ? "▸" : "▾"}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeBadge[file.type]}`}>
                {file.type}
              </span>
              <code className="text-sm font-mono truncate flex-1">{file.filename}</code>
              {file.hunkHeader && (
                <code className="text-xs text-(--text-accent) font-mono">{file.hunkHeader}</code>
              )}
            </div>
            {!file.collapsed && <FileContent file={file} app={app} loadedContent={loadedContent[file.filename] ?? []} />}
          </div>
        </div>
      ))}
    </div>
  );
};
