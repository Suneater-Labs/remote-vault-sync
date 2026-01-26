// Modal showing git commit history
import {useRef, useState} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {Commit} from "../utils/git";

dayjs.extend(relativeTime);

function formatDate(ts: number): string {
  const d = dayjs.unix(ts);
  const now = dayjs();
  if (now.diff(d, "day") < 3) return d.fromNow();
  if (d.year() === now.year()) return d.format("MMM D");
  return d.format("MMM D, YYYY");
}

export interface LogModalProps {
  commits: Commit[];
  onSelect?: (oid: string) => void;
}

export const LogModal = ({commits, onSelect}: LogModalProps) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
  });

  if (!commits.length) {
    return <div className="remote-vault-sync text-(--text-muted) p-4">No commits yet</div>;
  }

  const toggle = (oid: string) => setExpanded(s => {
    const n = new Set(s);
    if (n.has(oid)) n.delete(oid);
    else n.add(oid);
    return n;
  });

  return (
    <div ref={parentRef} className="remote-vault-sync p-2">
      <div className="flex flex-col gap-2" style={{height: virtualizer.getTotalSize()}}>
        {virtualizer.getVirtualItems().map(row => {
          const c = commits[row.index];
          if (!c) return null;
          return (
            <div
              key={c.oid}
              onClick={() => onSelect ? onSelect(c.oid) : toggle(c.oid)}
              className="flex flex-col gap-1 p-2 rounded bg-(--background-secondary) cursor-pointer hover:bg-(--background-modifier-hover)"
            >
              <div className="flex items-center gap-2">
                <code className="text-xs text-(--text-accent) font-mono">{c.oid.slice(0, 7)}</code>
                <span className={`text-sm flex-1 ${expanded.has(c.oid) ? "" : "truncate"}`}>{c.message}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                <span>{c.author.name}</span>
                <span>•</span>
                <span>{formatDate(c.author.timestamp)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
