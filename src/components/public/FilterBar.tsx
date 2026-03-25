"use client";

interface FilterBarProps {
  genres: string[];
  type: string;
  genre: string;
  decade: string;
  sort: string;
  onTypeChange: (v: string) => void;
  onGenreChange: (v: string) => void;
  onDecadeChange: (v: string) => void;
  onSortChange: (v: string) => void;
}

const decades = ["2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "1960s"];

const sortOptions = [
  { value: "added_at", label: "Recently Added" },
  { value: "title", label: "Title" },
  { value: "year", label: "Year" },
  { value: "rating", label: "Rating" },
];

export default function FilterBar({
  genres,
  type,
  genre,
  decade,
  sort,
  onTypeChange,
  onGenreChange,
  onDecadeChange,
  onSortChange,
}: FilterBarProps) {
  const selectClasses =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={type}
        onChange={(e) => onTypeChange(e.target.value)}
        className={selectClasses}
      >
        <option value="">All Types</option>
        <option value="movie">Movies</option>
        <option value="show">TV Shows</option>
      </select>

      <select
        value={genre}
        onChange={(e) => onGenreChange(e.target.value)}
        className={selectClasses}
      >
        <option value="">All Genres</option>
        {genres.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      <select
        value={decade}
        onChange={(e) => onDecadeChange(e.target.value)}
        className={selectClasses}
      >
        <option value="">All Decades</option>
        {decades.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <div className="ml-auto">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className={selectClasses}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
