"use client";

const filters = [
  { value: "", label: "All" },
  { value: "high_score", label: "High Score (70+)" },
  { value: "never_watched", label: "Never Watched" },
  { value: "watched_once_year_ago", label: "Watched Once (1yr+)" },
  { value: "largest", label: "Largest" },
  { value: "low_resolution", label: "Low Res" },
  { value: "abandoned", label: "Abandoned" },
  { value: "single_user", label: "Single User" },
  { value: "not_owner", label: "Not Watched by Owner" },
  { value: "fully_watched", label: "Fully Watched" },
];

interface AdminFilterBarProps {
  activeFilter: string;
  hidePermanent: boolean;
  search: string;
  onFilterChange: (filter: string) => void;
  onHidePermanentChange: (hide: boolean) => void;
  onSearchChange: (query: string) => void;
}

export default function AdminFilterBar({
  activeFilter,
  hidePermanent,
  search,
  onFilterChange,
  onHidePermanentChange,
  onSearchChange,
}: AdminFilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search titles..."
            className="w-48 rounded-md border border-slate-600 bg-slate-800 py-1.5 pl-8 pr-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="mx-1 h-5 w-px bg-slate-700" />
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={hidePermanent}
          onChange={(e) => onHidePermanentChange(e.target.checked)}
          className="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
        />
        Hide permanent items
      </label>
    </div>
  );
}
