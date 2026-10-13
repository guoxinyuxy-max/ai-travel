import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 条件类名 + Tailwind 冲突合并 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
