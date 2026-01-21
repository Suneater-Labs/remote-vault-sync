// Status bar indicator for sync state
export type SyncStatus = "clean" | "changes" | "error" | "disconnected" | "syncing";

export interface StatusBarProps {
  status: SyncStatus;
  step?: string;        // e.g. "Pushing...", "Staging..."
  progress?: number;    // 0-100 for LFS uploads
}

const statusColors: Record<SyncStatus, string> = {
  clean: "bg-green-500",
  changes: "bg-yellow-500",
  error: "bg-red-500",
  disconnected: "bg-(--text-muted)",
  syncing: "bg-(--interactive-accent) animate-pulse",
};

const statusLabels: Record<SyncStatus, string> = {
  clean: "Clean",
  changes: "Uncommitted changes",
  error: "Error",
  disconnected: "Not configured",
  syncing: "Syncing",
};

export const StatusBar = ({ status, step, progress }: StatusBarProps) => {
  return (
    <div className="remote-vault-sync flex items-center gap-2 text-xs">
      {step && <span className="text-(--text-muted)">{step}</span>}

      {progress !== undefined && (
        <div className="flex items-center gap-1">
          <div className="w-16 h-1.5 bg-(--background-modifier-border) rounded-full overflow-hidden">
            <div
              className="h-full bg-(--interactive-accent) transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-(--text-muted) w-8">{progress}%</span>
        </div>
      )}

      <span
        className={`w-2.5 h-2.5 rounded-full inline-flex items-center justify-center cursor-default ml-1 ${statusColors[status]}`}
        title={statusLabels[status]}
      />
    </div>
  );
};
