// Shared brand mark + wordmark, used in every page header so the "Waypoint
// by Profound" identity stays consistent in one place.

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="26" height="26" rx="7" fill="#0A0A12" />
      <path d="M13 6L17.5 13L13 20L8.5 13L13 6Z" fill="#FF5A36" />
    </svg>
  );
}

export function BrandLockup({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark />
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-lg tracking-tight text-ink-950">Waypoint</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-950/35">by Profound</span>
      </span>
    </span>
  );
}
