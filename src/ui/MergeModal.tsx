// Modal for resolving merge conflicts
import {useState, useCallback} from "react";

export type Resolution = "ours" | "theirs" | "both";

export interface MergeModalProps {
  conflicts: string[];
  conflictContents: Record<string, string>;
  onResolve: (resolutions: Record<string, Resolution>) => void;
  onCancel: () => void;
}

// Render conflict content with ours/theirs sections
function renderConflictContent(content: string, resolution?: Resolution) {
  const lines = content.split("\n");
  let mode: "normal" | "local" | "remote" = "normal";

  return lines.map((line, i) => {
    if (line.startsWith("<<<<<<<")) {
      mode = "local";
      const dim = resolution === "theirs" ? " opacity-30" : "";
      return <div key={i} className={`text-(--text-faint) whitespace-pre${dim}`}>{line}</div>;
    }
    if (line.startsWith("=======")) {
      mode = "remote";
      return <div key={i} className="text-(--text-faint) whitespace-pre">{line}</div>;
    }
    if (line.startsWith(">>>>>>>")) {
      mode = "normal";
      const dim = resolution === "ours" ? " opacity-30" : "";
      return <div key={i} className={`text-(--text-faint) whitespace-pre${dim}`}>{line}</div>;
    }

    const isLocalDimmed = resolution === "theirs";
    const isRemoteDimmed = resolution === "ours";

    if (mode === "local") {
      const cls = isLocalDimmed ? "opacity-30 line-through" : "bg-[rgba(88,166,92,0.08)] border-l-2 border-l-[rgba(88,166,92,0.5)]";
      return <div key={i} className={`${cls} whitespace-pre`}>{line || " "}</div>;
    }
    if (mode === "remote") {
      const cls = isRemoteDimmed ? "opacity-30 line-through" : "bg-[rgba(69,137,191,0.08)] border-l-2 border-l-[rgba(69,137,191,0.5)]";
      return <div key={i} className={`${cls} whitespace-pre`}>{line || " "}</div>;
    }
    return <div key={i} className="whitespace-pre">{line || " "}</div>;
  });
}

// Button style helper
const btn = "px-3 py-1 text-xs rounded border border-(--background-modifier-border) hover:bg-(--background-modifier-hover)";
const btnSelected = "px-3 py-1 text-xs rounded bg-(--interactive-accent) text-(--text-on-accent) border border-(--interactive-accent)";

export const MergeModal = ({conflicts, conflictContents, onResolve, onCancel}: MergeModalProps) => {
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(conflicts.map(f => [f, true]))
  );

  const setResolution = useCallback((file: string, resolution: Resolution) => {
    setResolutions(prev => ({...prev, [file]: resolution}));
  }, []);

  const setAllResolutions = useCallback((resolution: Resolution) => {
    setResolutions(Object.fromEntries(conflicts.map(f => [f, resolution])));
  }, [conflicts]);

  const toggleExpanded = useCallback((file: string) => {
    setExpanded(prev => ({...prev, [file]: !prev[file]}));
  }, []);

  const allResolved = conflicts.every(f => resolutions[f]);

  const handleResolve = useCallback(() => {
    if (allResolved) onResolve(resolutions);
  }, [allResolved, resolutions, onResolve]);

  return (
    <div className="remote-vault-sync flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-(--background-modifier-border)">
        <div className="flex gap-1">
          <button className={btn} onClick={() => setAllResolutions("ours")}>All Ours</button>
          <button className={btn} onClick={() => setAllResolutions("theirs")}>All Theirs</button>
          <button className={btn} onClick={() => setAllResolutions("both")}>All Both</button>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-(--text-muted)">{Object.keys(resolutions).length}/{conflicts.length}</span>
        <button className={btn} onClick={onCancel}>Cancel</button>
        <button
          className={allResolved ? btnSelected : `${btn} opacity-50 cursor-not-allowed`}
          onClick={handleResolve}
          disabled={!allResolved}
        >
          Resolve
        </button>
      </div>

      {/* Conflict list */}
      <div className="flex-1 overflow-auto p-2">
        {conflicts.map(file => {
          const content = conflictContents[file] ?? "";
          const resolution = resolutions[file];
          const isExpanded = expanded[file];

          return (
            <div key={file} className="mb-2 rounded border border-(--background-modifier-border) overflow-hidden">
              {/* File header */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-(--background-modifier-hover) bg-(--background-secondary)"
                onClick={() => toggleExpanded(file)}
              >
                <span className="text-(--text-muted) text-xs">{isExpanded ? "▾" : "▸"}</span>
                <code className="text-xs font-mono truncate flex-1">{file}</code>
                {resolution && <span className="text-xs text-(--text-muted)">✓ {resolution}</span>}
              </div>

              {isExpanded && (
                <>
                  {/* Resolution buttons */}
                  <div className="flex gap-1 px-3 py-2 border-t border-(--background-modifier-border)">
                    <button
                      className={resolution === "ours" ? btnSelected : btn}
                      onClick={e => { e.stopPropagation(); setResolution(file, "ours"); }}
                    >
                      Ours
                    </button>
                    <button
                      className={resolution === "theirs" ? btnSelected : btn}
                      onClick={e => { e.stopPropagation(); setResolution(file, "theirs"); }}
                    >
                      Theirs
                    </button>
                    <button
                      className={resolution === "both" ? btnSelected : btn}
                      onClick={e => { e.stopPropagation(); setResolution(file, "both"); }}
                    >
                      Both
                    </button>
                  </div>

                  {/* Conflict content */}
                  <div className="px-3 py-2 font-mono text-xs overflow-x-auto border-t border-(--background-modifier-border) bg-(--background-primary)">
                    {renderConflictContent(content, resolution)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
