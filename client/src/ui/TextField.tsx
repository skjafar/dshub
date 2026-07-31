import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './TextField.module.css';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  readonly label?: string;
  /** Help text below the field. Replaced by `error` when there is one. */
  readonly hint?: string;
  /** Marks the field invalid and shows this text instead of the hint. */
  readonly error?: string;
  /** Renders in the monospace stack with tabular figures, for hex and addresses. */
  readonly mono?: boolean;
}

/**
 * A single-line text input.
 *
 * The label, hint and error are wired to the input by id, so the error is
 * announced with the field rather than being a red string that only sighted
 * users connect to it.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, mono, className, id, ...rest },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  const inputClasses = cx(styles.input, mono && styles.mono, error && styles.invalid, className);

  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <input
        ref={ref}
        id={inputId}
        className={inputClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        {...rest}
      />

      {message ? (
        <span id={messageId} className={error ? styles.errorMessage : styles.message}>
          {message}
        </span>
      ) : null}
    </div>
  );
});
