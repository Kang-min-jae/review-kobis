export default function RowSkeleton() {
  return (
    <section className="px-5 py-6">
      <div className="h-5 w-32 animate-pulse rounded bg-neutral-800" />
      <div className="row-scrollbar mt-4 flex gap-4 overflow-x-auto pb-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-2/3 w-32 shrink-0 animate-pulse rounded-lg bg-neutral-800" />
        ))}
      </div>
    </section>
  );
}
