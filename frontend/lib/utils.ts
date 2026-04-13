import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 2,
  prefix = "",
  suffix = ""
): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}

export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatCurrency(value: number | null | undefined, currency = "EUR", decimals = 0): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatLargeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

export function colorForValue(value: number, threshold = 0): string {
  if (value > threshold) return "text-accent-green";
  if (value < threshold) return "text-accent-red";
  return "text-text-secondary";
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
