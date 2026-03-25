"use client";

import { useEffect, useState } from "react";
import { formatFileSize, formatRelativeDate } from "@/components/shared/formatters";
import { useToast } from "@/components/shared/Toast";

interface Stats {
  totalSize: number;
  totalItems: number;
  movieCount: number;
  showCount: number;
  purgeableSize: number;
  purgeableCount: number;
  largestItem: { id: string; title: string; size: number; type: string } | null;
  oldestUnwatched: {
    id: string;
    title: string;
    addedAt: number;
    type: string;
  } | null;
}

export default function StatsCards({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/stats")
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || `Server error (${r.status})`);
        }
        return r.json();
      })
      .then((data) => setStats(data))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load stats";
        setError(msg);
        toast(msg, "error");
      })
      .finally(() => setLoading(false));
  }, [refreshKey, toast]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg bg-slate-800 border border-slate-700"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-center text-sm text-red-400">
        Failed to load stats: {error}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      label: "Library Size",
      value: formatFileSize(stats.totalSize),
      sub: `${stats.totalItems} items`,
    },
    {
      label: "Movies / Shows",
      value: `${stats.movieCount} / ${stats.showCount}`,
      sub: `${stats.totalItems} total`,
    },
    {
      label: "Purgeable",
      value: formatFileSize(stats.purgeableSize),
      sub: `${stats.purgeableCount} never-watched items`,
    },
    {
      label: "Largest Item",
      value: stats.largestItem
        ? formatFileSize(stats.largestItem.size)
        : "N/A",
      sub: stats.largestItem
        ? stats.largestItem.title
        : "No items",
    },
    {
      label: "Oldest Unwatched",
      value: stats.oldestUnwatched
        ? formatRelativeDate(stats.oldestUnwatched.addedAt)
        : "N/A",
      sub: stats.oldestUnwatched
        ? stats.oldestUnwatched.title
        : "All watched",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-slate-700 bg-slate-800 p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {card.label}
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {card.value}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={card.sub}>
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
