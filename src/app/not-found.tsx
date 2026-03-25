import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-300 dark:text-slate-700">
          404
        </h1>
        <p className="mt-2 text-lg text-slate-500 dark:text-slate-400">
          Page not found
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
