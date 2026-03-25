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
  onFilterChange: (filter: string) => void;
  onHidePermanentChange: (hide: boolean) => void;
}

export default function AdminFilterBar({
  activeFilter,
  hidePermanent,
  onFilterChange,
  onHidePermanentChange,
}: AdminFilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
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
