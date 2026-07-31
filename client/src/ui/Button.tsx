import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'base' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  sm: styles.sm,
  base: '',
  lg: styles.lg,
};

/**
 * The base action.
 *
 * `type` defaults to `button`, because the HTML default is `submit` and a button
 * inside a form that unexpectedly submits it is a bug nobody sees coming.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'base', className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.button, styles[variant], SIZE_CLASS[size], className)}
      {...rest}
    />
  );
});
