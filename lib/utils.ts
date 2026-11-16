import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Combines CSS class names for Tailwind components.

// Merges class strings without conflicting Tailwind styles.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}