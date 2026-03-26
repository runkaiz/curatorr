"use client";

import { formatFileSize } from "@/components/shared/formatters";

interface SpaceReclaimBarProps {
  selectedCount: number;
  reclaimBytes: number;
  onMarkPermanent: () => void;
  onDelete?: () => void;
  onClearSelection: () => void;
  seerrConfigured: boolean;
  deleting?: boolean;
}

export default function SpaceReclaimBar({
  selectedCount,
  reclaimBytes,
  onMarkPermanent,
  onDelete,
  onClearSelection,
  seerrConfigured,
  deleting,
}: SpaceReclaimBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-600 bg-slate-800 px-4 py-3 shadow-lg">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between">
        <div className="text-sm text-slate-200">
          <span className="font-semibold">{selectedCount}</span> item
          {selectedCount !== 1 && "s"} selected &mdash; You&apos;d reclaim{" "}
          <span className="font-semibold text-green-400">
            {formatFileSize(reclaimBytes)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {seerrConfigured && onDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete via Seerr"}
            </button>
          )}
          <button
            onClick={onMarkPermanent}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
          >
            Mark Permanent
          </button>
          <button
            onClick={onClearSelection}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-600"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
