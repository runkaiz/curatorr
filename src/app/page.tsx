import PosterGrid from "@/components/public/PosterGrid";
import ThemeToggle from "@/components/public/ThemeToggle";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
          <h1 className="text-lg font-semibold tracking-tight">Curatorr</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-6">
        <PosterGrid />
      </main>
    </div>
  );
}
