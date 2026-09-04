function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} TB`;
  if (n >= 100) return `${n.toFixed(0)} GB`;
  return `${n.toFixed(1).replace(/\.0$/, '')} GB`;
}

/** Storage usage bar — neutral until nearly full, then the red exception. */
export default function StorageMeter({ usedGb, limitGb }: { usedGb: number; limitGb: number }) {
  const ratio = limitGb > 0 ? Math.min(1, usedGb / limitGb) : 0;
  const pct = Math.round(ratio * 100);
  const tone = ratio >= 0.9 ? 'bg-danger' : 'bg-overlay/40';

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-body">
          {fmt(usedGb)} <span className="text-muted">of {fmt(limitGb)} used</span>
        </span>
        <span className="text-xs font-medium tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-overlay/10">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Storage covers uploaded floor plans, drawings, and exported reports.
      </p>
    </div>
  );
}
