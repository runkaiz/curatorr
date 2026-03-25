"use client";

import { useState, useEffect, useCallback } from "react";
import {
  formatFileSize,
  formatRelativeDate,
} from "@/components/shared/formatters";

interface PermanentItem {
  itemId: string;
  note: string | null;
  createdAt: number;
  title: string;
  type: string;
  year: number | null;
  fileSizeBytes: number;
  resolution: string | null;
}

export default function PermanentPage() {
  const [items, setItems] = useState<PermanentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/permanent");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data.items);
    } catch (err) {
      console.error("Failed to fetch permanent items:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleRemove(itemId: string) {
    try {
      const res = await fetch(`/api/permanent/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove");
      setItems((prev) => prev.filter((i) => i.itemId !== itemId));
    } catch (err) {
      console.error("Failed to remove permanent item:", err);
    }
  }

  function startEdit(item: PermanentItem) {
    setEditingId(item.itemId);
    setEditNote(item.note || "");
  }

  async function saveNote(itemId: string) {
    try {
      const res = await fetch(`/api/permanent/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editNote || null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setItems((prev) =>
        prev.map((i) =>
          i.itemId === itemId ? { ...i, note: editNote || null } : i
        )
      );
      setEditingId(null);
    } catch (err) {
      console.error("Failed to update note:", err);
    }
  }

  const totalSize = items.reduce((sum, i) => sum + i.fileSizeBytes, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Permanent Exhibition</h1>
          <p className="mt-1 text-sm text-slate-400">
            {items.length} items &middot; {formatFileSize(totalSize)} total
          </p>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-slate-800"
            />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-slate-700 py-16 text-center">
          <p className="text-slate-400">No permanent items yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Mark items as permanent from the Dashboard pruning table.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Poster</th>
                <th className="px-3 py-2.5">Title</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Size</th>
                <th className="px-3 py-2.5">Note</th>
                <th className="px-3 py-2.5">Added</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {items.map((item) => (
                <tr
                  key={item.itemId}
                  className="border-l-2 border-l-amber-400 transition-colors hover:bg-slate-800/50"
                >
                  <td className="px-3 py-2">
                    <img
                      src={`/api/thumb/${item.itemId}`}
                      alt={item.title}
                      className="h-12 w-8 rounded object-cover"
                      loading="lazy"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-200">
                      {item.title}
                    </div>
                    {item.year && (
                      <div className="text-xs text-slate-500">{item.year}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                      {item.type === "show" ? "TV" : "Movie"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-300">
                    {formatFileSize(item.fileSizeBytes)}
                  </td>
                  <td className="max-w-[250px] px-3 py-2">
                    {editingId === item.itemId ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder="Add a note..."
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNote(item.itemId);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                        />
                        <button
                          onClick={() => saveNote(item.itemId)}
                          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(item)}
                        className="truncate text-xs text-slate-400 hover:text-slate-200"
                        title={item.note || "Click to add note"}
                      >
                        {item.note || (
                          <span className="italic text-slate-600">
                            Add note...
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                    {formatRelativeDate(item.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleRemove(item.itemId)}
                      className="rounded-md px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-400/10"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
