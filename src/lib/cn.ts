// Утилита для классов (clsx + tailwind-merge).
// Использование: cn('p-2', condition && 'bg-red-500', className)
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
