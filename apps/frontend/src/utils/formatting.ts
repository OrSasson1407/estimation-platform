// apps/frontend/src/utils/formatting.ts  ← NEW
export const fmtHours = (h: number): string => {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 8) return `${h.toFixed(1)}h`;
  const days = h / 8;
  return days < 1 ? `${h.toFixed(0)}h` : `${days.toFixed(1)}d`;
};

export const fmtConfidence = (score: number): string => `${Math.round(score * 100)}%`;

export const fmtCurrency = (usd: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(usd);

export const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const fmtRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export const fmtPriority = (p: string): string =>
  ({ LOW: '🟢 Low', MEDIUM: '🟡 Medium', HIGH: '🟠 High', CRITICAL: '🔴 Critical' })[p] ?? p;

export const fmtStatus = (s: string): string =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
