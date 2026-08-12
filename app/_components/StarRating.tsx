function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7-5.4-4.7 7.1-.6z" />
    </svg>
  );
}

export default function StarRating({ rating }: { rating: number }) {
  const percent = Math.max(0, Math.min(100, (rating / 10) * 100));

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex">
        <div className="flex gap-0.5 text-muted">
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon key={i} className="h-3.5 w-3.5" />
          ))}
        </div>
        <div
          className="absolute inset-0 flex gap-0.5 overflow-hidden text-star"
          style={{ width: `${percent}%` }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon key={i} className="h-3.5 w-3.5 shrink-0" />
          ))}
        </div>
      </div>
      <span className="text-xs font-semibold text-text">{rating.toFixed(1)}</span>
    </div>
  );
}
