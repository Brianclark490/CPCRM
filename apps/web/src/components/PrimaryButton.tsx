import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import styles from './PrimaryButton.module.css';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'gradient' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function PrimaryButton({
  children,
  variant = 'gradient',
  size = 'md',
  className,
  ...props
}: PrimaryButtonProps) {
  const cls = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} {...props}>
      {children}
    </button>
  );
}
