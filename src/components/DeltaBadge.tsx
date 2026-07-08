import { TrendingUp, TrendingDown } from 'lucide-react';

interface DeltaBadgeProps {
  /** Percent change in the period, or null if not computable (e.g. too few data points, prior period is zero). */
  delta: number | null;
  /**
   * Label for the prior period. Shown after the percentage.
   * Default: "vs prior period" — accurate for half-vs-half comparisons.
   * Override for windows that match a literal period ("vs last 30 days").
   */
  label?: string;
  /** Extra Tailwind classes for the outer span. */
  className?: string;
}

/**
 * Renders a tiny colored pill: green up-arrow + percent, red down-arrow + percent,
 * or muted "—" when the delta is null.
 *
 * Used in AnalyticsView (computed deltas) and DashboardView (placeholder).
 * Pure presentation — accepts the delta number, does not compute it.
 */
export default function DeltaBadge({ delta, label = 'vs prior period', className = '' }: DeltaBadgeProps) {
  if (delta === null) {
    return (
      <span className={`text-[10px] font-mono text-[#aaa] flex items-center gap-0.5 ${className}`}>
        — (no comparison)
      </span>
    );
  }

  const sign = delta >= 0 ? '+' : '';
  const positive = delta >= 0;
  const color = positive ? 'text-green-500' : 'text-red-400';
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span className={`text-[10px] font-mono ${color} flex items-center gap-0.5 ${className}`}>
      <Icon className="w-3.5 h-3.5" /> {sign}{delta.toFixed(1)}% ({label})
    </span>
  );
}