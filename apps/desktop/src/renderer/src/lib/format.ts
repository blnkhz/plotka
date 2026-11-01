export const fmtMm = (mm: number, digits = 1) => `${mm.toFixed(digits)} mm`;

export function fmtDistance(mm: number): string {
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  return `${mm.toFixed(0)} mm`;
}

export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
