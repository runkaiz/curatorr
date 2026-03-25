"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/shared/Toast";

interface Section {
  key: string;
  title: string;
  type: "movie" | "show";
  enabled: boolean;
}

export default function LibrarySelector() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const fetchSections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sections");
      if (!res.ok) throw new Error("Failed to fetch sections");
      const data = await res.json();
      setSections(data.sections);
      setDirty(false);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to load libraries",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) fetchSections();
  }, [open, fetchSections]);

  function toggleSection(key: string) {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s))
    );
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setDirty(false);
      toast("Library selection saved", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to save",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = sections.filter((s) => s.enabled).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
          />
        </svg>
        Libraries
        {sections.length > 0 && (
          <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300">
            {enabledCount}/{sections.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
          <div className="border-b border-slate-700 px-4 py-3">
            <p className="text-sm font-medium text-slate-200">
              Plex Libraries
            </p>
            <p className="text-xs text-slate-400">
              Select which libraries to sync
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded bg-slate-700"
                  />
                ))}
              </div>
            ) : sections.length === 0 ? (
              <p className="p-3 text-center text-sm text-slate-500">
                No libraries found. Check your Plex connection.
              </p>
            ) : (
              sections.map((section) => (
                <label
                  key={section.key}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-slate-700/50"
                >
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    onChange={() => toggleSection(section.key)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {section.title}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">
                      {section.type === "show" ? "TV Shows" : "Movies"}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3">
            <button
              onClick={() => {
                setOpen(false);
                setDirty(false);
              }}
              className="text-sm text-slate-400 transition-colors hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
