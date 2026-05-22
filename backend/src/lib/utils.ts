import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a stored digits-only phone number for human display.
 * 10-digit US:  "9198181422"  → "(919) 818-1422"
 * 7-digit local: "5551234"    → "555-1234"
 * null / blank               → ""
 * unexpected length          → original value unchanged
 *
 * Display-only — does NOT alter stored DB values.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return phone;
}
