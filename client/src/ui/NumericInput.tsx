import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';
import { TextField } from './TextField';
import type { TextFieldProps } from './TextField';

export interface NumericInputProps
  extends Omit<TextFieldProps, 'value' | 'onChange' | 'defaultValue' | 'type'> {
  /** The value the Device currently reports. Mirrored only while not editing. */
  readonly value: number;
  /** Called once per edit, with the parsed value, when the edit commits. */
  readonly onCommit: (value: number) => void;
  /** Formats the live value for display. Defaults to decimal. */
  readonly format?: (value: number) => string;
  /** Parses what was typed. Returning `null` refuses the commit. */
  readonly parse?: (raw: string) => number | null;
}

/** Rejects anything that is not a finite number, including the empty field. */
function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A numeric field over a value the Device is also updating.
 *
 * The field mirrors the Device only while nobody is editing it. Once someone
 * starts typing it holds their draft, and an arriving read cannot overwrite it —
 * otherwise the value that reaches the hardware is neither what they typed nor
 * what they saw. Enter and blur both commit the same draft, so the keyboard and
 * pointer paths cannot disagree about what gets written; Escape abandons it.
 *
 * See `__tests__/NumericInput.test.tsx` for the failure this shape prevents.
 */
export function NumericInput({
  value,
  onCommit,
  format,
  parse = parseDecimal,
  mono = true,
  onKeyDown,
  onFocus,
  onBlur,
  ...rest
}: NumericInputProps): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  // Read during the commit handlers rather than during render, so committing
  // never depends on a state update having been flushed first.
  const draftRef = useRef<string | null>(null);

  const setDraftValue = (next: string | null): void => {
    draftRef.current = next;
    setDraft(next);
  };

  const display = format ? format(value) : String(value);

  const commit = useCallback(() => {
    const raw = draftRef.current;
    setDraftValue(null);
    // Not an edit, or an edit that changed nothing worth sending.
    if (raw === null) return;
    const parsed = parse(raw);
    if (parsed === null) return;
    onCommit(parsed);
  }, [onCommit, parse]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDraftValue(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraftValue(null);
    }
    onKeyDown?.(event);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>): void => {
    // Seed the draft on focus so that arriving values stop being mirrored the
    // moment the field is entered, not on the first keystroke.
    if (draftRef.current === null) setDraftValue(event.target.value);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    commit();
    onBlur?.(event);
  };

  return (
    <TextField
      {...rest}
      mono={mono}
      inputMode="decimal"
      autoComplete="off"
      value={draft ?? display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
