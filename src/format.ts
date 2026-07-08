// Shared number/currency formatting helpers.
// Used by DashboardView and AnalyticsView (previously duplicated in both).

/** Compact number formatting: 1_500_000 -> "1.50M", 1_500 -> "1.5K", 950 -> "950". */
export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/** USD currency formatting, e.g. 1420 -> "$1,420.00". */
export function formatCurrency(num: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}
