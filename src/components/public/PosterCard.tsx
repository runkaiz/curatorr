"use client";

import { formatRating } from "@/components/shared/formatters";

interface PosterCardProps {
  id: string;
  title: string;
  year: number | null;
  plexRating: number | null;
  type: string;
  isPermanent: boolean;
  deletedFromSource?: boolean;
}

export default function PosterCard({
  id,
  title,
  year,
  plexRating,
  type,
  isPermanent,
  deletedFromSource,
}: PosterCardProps) {
  const ringClass = deletedFromSource
    ? "ring-2 ring-red-500/70"
    : isPermanent
      ? "ring-2 ring-amber-400/60"
      : "";

  return (
    <div
      className={`group relative overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 ${ringClass}`}
    >
      <div className="aspect-[2/3] w-full">
        {deletedFromSource ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-200 dark:bg-slate-700">
            <svg
              className="h-12 w-12 text-slate-400 dark:text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              />
            </svg>
          </div>
        ) : (
          <img
            src={`/api/thumb/${id}`}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        )}
      </div>

      {deletedFromSource && (
        <div className="absolute inset-x-0 top-0 bg-red-600/90 px-2 py-1.5 text-center">
          <p className="text-xs font-semibold text-white">Removed from Plex</p>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8">
        <h3 className="text-sm font-semibold leading-tight text-white line-clamp-2">
          {title}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
          {year && <span>{year}</span>}
          <span className="uppercase">{type === "show" ? "TV" : type}</span>
          {plexRating !== null && (
            <span className="ml-auto rounded bg-white/20 px-1.5 py-0.5 font-medium">
              {formatRating(plexRating)}
            </span>
          )}
        </div>
      </div>
      {isPermanent && !deletedFromSource && (
        <div className="absolute right-2 top-2 rounded-full bg-amber-400 p-1" title="Permanent collection">
          <svg className="h-3 w-3 text-amber-900" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
      )}
    </div>
  );
}
