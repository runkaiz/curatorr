interface EmptyStateProps {
  title: string;
  description?: string;
}

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-slate-200 py-16 text-center dark:border-slate-700">
      <p className="text-slate-500 dark:text-slate-400">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}
