"use client";

import { useState, useEffect, useCallback } from "react";
import {
  formatFileSize,
  formatRelativeDate,
} from "@/components/shared/formatters";
import AdminFilterBar from "./AdminFilterBar";
import SpaceReclaimBar from "./SpaceReclaimBar";
import { useToast } from "@/components/shared/Toast";

interface LibraryItem {
  id: string;
  type: string;
  title: string;
  year: number | null;
  plexRating: number | null;
  addedAt: number | null;
  lastViewedAt: number | null;
  playCount: number;
  fileSizeBytes: number;
  resolution: string | null;
  episodeCount: number | null;
  filePath: string | null;
  pruningScore: number | null;
  isPermanent: boolean;
  deletedFromSource: number | null;
}

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

const PAGE_SIZE = 50;

export default function PruningTable({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [activeFilter, setActiveFilter] = useState("");
  const [hidePermanent, setHidePermanent] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortState, setSortState] = useState<SortState>({
    column: "score",
    direction: "desc",
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Map of id -> fileSize for reclaim calculation
  const [sizeMap, setSizeMap] = useState<Map<string, number>>(new Map());

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeFilter) params.set("filter", activeFilter);
      if (hidePermanent) params.set("hide_permanent", "true");
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("sort", sortState.column);
      params.set("order", sortState.direction);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const res = await fetch(`/api/library?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();

      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);

      // Update size map
      const newSizeMap = new Map(sizeMap);
      for (const item of data.items) {
        newSizeMap.set(item.id, item.fileSizeBytes);
      }
      setSizeMap(newSizeMap);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load items";
      setError(msg);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [activeFilter, hidePermanent, debouncedSearch, sortState, page, refreshKey, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Reset page when filter/sort changes
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [activeFilter, hidePermanent, debouncedSearch, sortState]);

  function handleSort(column: string) {
    setSortState((prev) => ({
      column,
      direction:
        prev.column === column && prev.direction === "desc" ? "asc" : "desc",
    }));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (items.every((item) => selected.has(item.id))) {
      // Deselect all on page
      setSelected((prev) => {
        const next = new Set(prev);
        for (const item of items) next.delete(item.id);
        return next;
      });
    } else {
      // Select all on page
      setSelected((prev) => {
        const next = new Set(prev);
        for (const item of items) next.add(item.id);
        return next;
      });
    }
  }

  async function handleMarkPermanent() {
    try {
      const results = await Promise.all(
        Array.from(selected).map((id) =>
          fetch("/api/permanent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: id }),
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        toast(`${failed} item(s) failed to mark as permanent`, "error");
      } else {
        toast(`Marked ${selected.size} item(s) as permanent`, "success");
      }
      setSelected(new Set());
      fetchItems();
    } catch (err) {
      toast("Failed to mark items as permanent", "error");
    }
  }

  const reclaimBytes = Array.from(selected).reduce(
    (sum, id) => sum + (sizeMap.get(id) || 0),
    0
  );

  const allOnPageSelected =
    items.length > 0 && items.every((item) => selected.has(item.id));

  const columns = [
    { key: "score", label: "Score", sortable: true },
    { key: "title", label: "Title", sortable: true },
    { key: "type", label: "Type", sortable: false },
    { key: "size", label: "Size", sortable: true },
    { key: "resolution", label: "Res", sortable: false },
    { key: "last_viewed", label: "Last Watched", sortable: true },
    { key: "play_count", label: "Plays", sortable: true },
    { key: "added_at", label: "Added", sortable: true },
    { key: "status", label: "Status", sortable: false },
    { key: "file_path", label: "Path", sortable: false },
  ];

  return (
    <div className="space-y-4">
      <AdminFilterBar
        activeFilter={activeFilter}
        hidePermanent={hidePermanent}
        search={search}
        onFilterChange={setActiveFilter}
        onHidePermanentChange={setHidePermanent}
        onSearchChange={setSearch}
      />

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-700 bg-slate-800/50 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 ${col.sortable ? "cursor-pointer select-none hover:text-slate-200" : ""}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortState.column === col.key && (
                      <span>{sortState.direction === "asc" ? "\u2191" : "\u2193"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading &&
              items.length === 0 &&
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={11} className="px-3 py-3">
                    <div className="h-4 animate-pulse rounded bg-slate-800" />
                  </td>
                </tr>
              ))}

            {!loading && error && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center">
                  <p className="text-red-400">Failed to load items</p>
                  <p className="mt-1 text-xs text-slate-500">{error}</p>
                  <button
                    onClick={() => fetchItems()}
                    className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            )}

            {!loading && !error && items.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-10 text-center text-slate-500"
                >
                  No items match this filter.
                </td>
              </tr>
            )}

            {items.map((item) => (
              <tr
                key={item.id}
                className={`transition-colors hover:bg-slate-800/50 ${
                  selected.has(item.id) ? "bg-blue-900/20" : ""
                } ${item.deletedFromSource ? "border-l-2 border-l-red-500 bg-red-900/10" : item.isPermanent ? "border-l-2 border-l-amber-400" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                </td>
                <td className="px-3 py-2">
                  <ScoreBadge score={item.pruningScore} />
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 font-medium text-slate-200" title={item.title}>
                  {item.title}
                </td>
                <td className="px-3 py-2 text-slate-400">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">
                    {item.type === "show" ? "TV" : "Movie"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-300">
                  {formatFileSize(item.fileSizeBytes)}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {item.resolution || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                  {item.lastViewedAt
                    ? formatRelativeDate(item.lastViewedAt)
                    : <span className="text-red-400">Never</span>}
                </td>
                <td className="px-3 py-2 text-center text-xs text-slate-400">
                  {item.playCount}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                  {item.addedAt ? formatRelativeDate(item.addedAt) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {item.isPermanent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Permanent
                      </span>
                    )}
                    {item.deletedFromSource && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Removed from Plex
                      </span>
                    )}
                  </div>
                </td>
                <td
                  className="max-w-[150px] truncate px-3 py-2 font-mono text-xs text-slate-500"
                  title={item.filePath || ""}
                >
                  {item.filePath || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <SpaceReclaimBar
        selectedCount={selected.size}
        reclaimBytes={reclaimBytes}
        onMarkPermanent={handleMarkPermanent}
        onClearSelection={() => setSelected(new Set())}
      />
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-slate-600">—</span>;
  }

  let colorClass: string;
  if (score >= 76) {
    colorClass = "bg-red-500/20 text-red-400";
  } else if (score >= 51) {
    colorClass = "bg-orange-500/20 text-orange-400";
  } else if (score >= 26) {
    colorClass = "bg-yellow-500/20 text-yellow-400";
  } else {
    colorClass = "bg-green-500/20 text-green-400";
  }

  return (
    <span
      className={`inline-flex min-w-[2.5rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {score}
    </span>
  );
}
