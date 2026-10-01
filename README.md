This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Plex permanent exhibition

Curatorr can mirror its permanent items into a manual Plex collection. Enable
write-back with:

```env
PLEX_PERMANENT_COLLECTION_SYNC=true
PLEX_PERMANENT_COLLECTION_NAME=Permanent Exhibition
```

Marking or unmarking an item updates Plex immediately, and every library sync
reconciles collection membership again. Other Plex collection tags are
preserved. If Plex is unavailable, Curatorr remains the source of truth and the
write is retried during the next sync.

For an external scheduler, configure `MAINTENANCE_TOKEN` and periodically call:

```bash
curl -X POST \
  -H "Authorization: Bearer $MAINTENANCE_TOKEN" \
  http://curatorr:3000/api/maintenance/permanent-collection
```

The collection is created by Plex when the first permanent item receives the
tag. TV, Anime, and Movies libraries each hold their own same-named collection,
which Plex presents as related collections.

## Libraries

Curatorr discovers Plex movie and show libraries by their Plex section IDs.
The public catalog filters by library name, so TV and Anime remain separate
even though Plex classifies both as shows. New libraries are enabled on the
next sync; the admin Libraries menu can disable any library explicitly.

TV and Anime sizes are calculated directly from Plex on every sync by paging
through all episodes and summing their media file parts, including specials
and alternate versions. Shared multi-episode files are counted once per show.
Totals are saved in Curatorr’s database and do not depend on Tautulli’s media
info cache. Missing file sizes or incomplete episode catalogs stop the sync
before overwriting that library’s saved sizes. This requires more Plex reads
than scanning only recent episodes. Tautulli still supplies watch history.

Moving a permanent title between libraries can change its Plex ID. Sync now
retains Plex/TVDB/TMDB identifiers and reconnects the permanent marker, note,
and watch history before removing stale records or updating Plex collections.
For records created by older versions, it can recover a unique exact
title/type/year match and reports that fallback in the sync notes. Ambiguous
matches retain the old record and protect possible destinations from deletion
and Plex collection changes until reviewed.

## Deletion recommendations

The balanced scoring policy favors long-idle titles with little recorded use.
The admin dashboard opens on **Deletion Candidates** and explains each score.
The score is a review priority, not a probability that deletion is safe.

- New titles and newly added episodes get a 60-day grace period. Viewing in
  the last 30 days holds a title back. Recorded unfinished viewing by any
  user also holds it back, including partially watched series.
- Candidates must be idle for at least 180 days. Missing size, age, episode
  count, detailed viewing history, or a sync older than 7 days limits the score.
  Titles with no recorded plays need at least 180 days of library history;
  this does not establish that they have never been watched.
- Size is ranked within the Plex library. Episode plays are normalized by
  episode count, while repeat viewing and multiple viewers reduce priority.
  Resolution and critic ratings are not deletion penalties.
- The score combines inactivity (55 points), low use (25), library-relative
  size (15), and age (5), then applies repeat/viewer deductions and protections.
  A score of 70 or above is a candidate only when the evidence checks pass.
- Scores refresh after sync and at most hourly when the catalog is read.
  Permanent or library-selection changes invalidate the cached scores.
  The space estimate counts only current candidates. Nothing is deleted
  automatically.

Watch history follows the [Tautulli API](https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference#get_history):
episode events attach to their parent show; season/episode identity survives
library moves; resumed sessions are grouped; and all history pages are read
instead of silently stopping at 10,000 records. Completing one episode does
not mark a series as fully watched. The **Completed Movies** filter is limited
to movies. Tautulli only knows recorded viewing, and this policy cannot infer
future interest or whether a currently available series has finished airing.

After upgrading, run **Sync Now** to recover moved permanent items and populate
the corrected history and new-episode data. Existing databases are migrated
without discarding permanent notes. Old scores are replaced conservatively
until the new sync completes.

Run `npm test` for scoring, API, migration, and library-move regression checks.
The Docker build runs these checks before building the app.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
