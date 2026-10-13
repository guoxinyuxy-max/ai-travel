import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({ variant = 'primary', className, type, ...rest }: Props) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'w-full rounded-btn px-4 py-3.5 text-base font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:bg-ink-200 disabled:font-normal disabled:text-ink-400',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary-soft',
        variant === 'secondary' && 'bg-ink-150 text-ink-900 hover:bg-ink-200',
        variant === 'ghost' && 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-100',
        className,
      )}
      {...rest}
    />
  )
}
