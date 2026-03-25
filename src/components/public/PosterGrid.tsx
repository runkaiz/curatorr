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
  deletedFromSource: number | null;
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
  const [permanentItems, setPermanentItems] = useState<LibraryItem[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingPermanent, setLoadingPermanent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Filters
  const [type, setType] = useState("");
  const [genre, setGenre] = useState("");
  const [decade, setDecade] = useState("");
  const [sort, setSort] = useState("added_at");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch permanent collection items
  const fetchPermanent = useCallback(async () => {
    setLoadingPermanent(true);
    try {
      const params = new URLSearchParams();
      params.set("permanent_only", "true");
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("sort", "title");
      params.set("order", "asc");
      params.set("limit", "100");

      const res = await fetch(`/api/library?${params}`);
      if (!res.ok) return;
      const data: LibraryResponse = await res.json();
      setPermanentItems(data.items);
    } catch {
      // Silently fail — permanent section is supplementary
    } finally {
      setLoadingPermanent(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchPermanent();
  }, [fetchPermanent]);

  // Fetch main library items (excluding permanent)
  const fetchItems = useCallback(
    async (pageNum: number, append: boolean = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (genre) params.set("genre", genre);
        if (decade) params.set("decade", decade);
        if (debouncedSearch) params.set("q", debouncedSearch);
        params.set("hide_permanent", "true");
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
    [type, genre, decade, debouncedSearch, sort, toast]
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

  const hasFilters = type || genre || decade || debouncedSearch;
  const showPermanent = permanentItems.length > 0 && !hasFilters;

  return (
    <div className="space-y-6">
      <FilterBar
        genres={genres}
        type={type}
        genre={genre}
        decade={decade}
        sort={sort}
        search={search}
        onTypeChange={(v) => setType(v)}
        onGenreChange={(v) => setGenre(v)}
        onDecadeChange={(v) => setDecade(v)}
        onSortChange={(v) => setSort(v)}
        onSearchChange={(v) => setSearch(v)}
      />

      {/* Permanent Collection — search results */}
      {debouncedSearch && permanentItems.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <svg
              className="h-4 w-4 text-amber-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Permanent Collection
            </h2>
            <span className="text-xs text-slate-400">
              {permanentItems.length} item{permanentItems.length !== 1 && "s"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {permanentItems.map((item) => (
              <PosterCard
                key={item.id}
                id={item.id}
                title={item.title}
                year={item.year}
                plexRating={item.plexRating}
                type={item.type}
                isPermanent={item.isPermanent}
                deletedFromSource={!!item.deletedFromSource}
              />
            ))}
          </div>
          <hr className="mt-6 border-slate-200 dark:border-slate-800" />
        </section>
      )}

      {/* Permanent Collection — default view (no filters) */}
      {showPermanent && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <svg
              className="h-4 w-4 text-amber-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Permanent Collection
            </h2>
            <span className="text-xs text-slate-400">
              {permanentItems.length} item{permanentItems.length !== 1 && "s"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {permanentItems.map((item) => (
              <PosterCard
                key={item.id}
                id={item.id}
                title={item.title}
                year={item.year}
                plexRating={item.plexRating}
                type={item.type}
                isPermanent={item.isPermanent}
                deletedFromSource={!!item.deletedFromSource}
              />
            ))}
          </div>
          <hr className="mt-6 border-slate-200 dark:border-slate-800" />
        </section>
      )}

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

      {!loading && !error && items.length === 0 && permanentItems.length === 0 && (
        <div className="py-20 text-center text-slate-500 dark:text-slate-400">
          <p className="text-lg">No items found</p>
          <p className="mt-1 text-sm">
            {total === 0 && !debouncedSearch
              ? "Library is empty. Sync from the admin dashboard first."
              : "Try adjusting your filters."}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <>
          {(showPermanent || (debouncedSearch && permanentItems.length > 0)) && (
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Library
            </h2>
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
                deletedFromSource={!!item.deletedFromSource}
              />
            ))}
          </div>
        </>
      )}

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
