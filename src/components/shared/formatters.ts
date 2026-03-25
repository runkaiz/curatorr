const sizeFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${sizeFormatter.format(value)} ${units[i]}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeDate(unix: number): string {
  const now = Date.now() / 1000;
  const diff = unix - now;
  const absDiff = Math.abs(diff);

  if (absDiff < 60) return "just now";
  if (absDiff < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (absDiff < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (absDiff < 2592000) return rtf.format(Math.round(diff / 86400), "day");
  if (absDiff < 31536000) return rtf.format(Math.round(diff / 2592000), "month");
  return rtf.format(Math.round(diff / 31536000), "year");
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function parseGenres(genreJson: string | null): string[] {
  if (!genreJson) return [];
  try {
    return JSON.parse(genreJson);
  } catch {
    return [];
  }
}

export function getDecade(year: number | null): string | null {
  if (!year) return null;
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}
