"use client";

import { formatRating } from "@/components/shared/formatters";

interface PosterCardProps {
  id: string;
  title: string;
  year: number | null;
  plexRating: number | null;
  type: string;
  isPermanent: boolean;
}

export default function PosterCard({
  id,
  title,
  year,
  plexRating,
  type,
  isPermanent,
}: PosterCardProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 ${
        isPermanent ? "ring-2 ring-amber-400/60" : ""
      }`}
    >
      <div className="aspect-[2/3] w-full">
        <img
          src={`/api/thumb/${id}`}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>
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
      {isPermanent && (
        <div className="absolute right-2 top-2 rounded-full bg-amber-400 p-1" title="Permanent collection">
          <svg className="h-3 w-3 text-amber-900" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
      )}
    </div>
  );
}
