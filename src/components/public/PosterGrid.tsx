"use client";

import { useState, useEffect, useCallback } from "react";
import PosterCard from "./PosterCard";
import FilterBar from "./FilterBar";
import { useToast } from "@/components/shared/Toast";

interface LibraryItem {
  id: string;
  type: string;
  title: string;
  year: number | null;
  plexRating: number | null;
  isPermanent: boolean;
}

interface LibraryResponse {
  items: LibraryItem[];
  total: number;
  page: number;
  totalPages: number;
  genres: string[];
}

export default function PosterGrid() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Filters
  const [type, setType] = useState("");
  const [genre, setGenre] = useState("");
  const [decade, setDecade] = useState("");
  const [sort, setSort] = useState("added_at");

  const fetchItems = useCallback(
    async (pageNum: number, append: boolean = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (genre) params.set("genre", genre);
        if (decade) params.set("decade", decade);
        params.set("sort", sort);
        params.set("order", sort === "title" ? "asc" : "desc");
        params.set("page", String(pageNum));
        params.set("limit", "50");

        const res = await fetch(`/api/library?${params}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server error (${res.status})`);
        }
        const data: LibraryResponse = await res.json();

        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
        if (data.genres.length > 0) setGenres(data.genres);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load library";
        setError(msg);
        toast(msg, "error");
      } finally {
        setLoading(false);
      }
    },
    [type, genre, decade, sort, toast]
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setItems([]);
    setPage(1);
    fetchItems(1);
  }, [fetchItems]);

  function loadMore() {
    if (page < totalPages) {
      fetchItems(page + 1, true);
    }
  }

  return (
    <div className="space-y-6">
      <FilterBar
        genres={genres}
        type={type}
        genre={genre}
        decade={decade}
        sort={sort}
        onTypeChange={(v) => setType(v)}
        onGenreChange={(v) => setGenre(v)}
        onDecadeChange={(v) => setDecade(v)}
        onSortChange={(v) => setSort(v)}
      />

      {!loading && error && (
        <div className="py-20 text-center">
          <p className="text-lg text-red-500 dark:text-red-400">Failed to load library</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
          <button
            onClick={() => fetchItems(1)}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-20 text-center text-slate-500 dark:text-slate-400">
          <p className="text-lg">No items found</p>
          <p className="mt-1 text-sm">
            {total === 0
              ? "Library is empty. Sync from the admin dashboard first."
              : "Try adjusting your filters."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item) => (
          <PosterCard
            key={item.id}
            id={item.id}
            title={item.title}
            year={item.year}
            plexRating={item.plexRating}
            type={item.type}
            isPermanent={item.isPermanent}
          />
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
        </div>
      )}

      {!loading && page < totalPages && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Load More ({total - items.length} remaining)
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          Showing {items.length} of {total} items
        </p>
      )}
    </div>
  );
}
