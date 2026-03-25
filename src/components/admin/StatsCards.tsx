"use client";

import { useEffect, useState } from "react";
import { formatFileSize, formatRelativeDate } from "@/components/shared/formatters";

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

  useEffect(() => {
    setLoading(true);
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

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
