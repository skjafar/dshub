import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TextField, TextFieldProps } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { WriteFormat, filterWriteInput, parseWriteInput } from '../utils/writeInputParse';
import {
  DigitPosition,
  ThumbwheelFormat,
  resolveThumbwheelFormat,
  getDigitPositions,
  getDefaultBounds,
  findNearestDigitPosition,
  applyDigitStep,
  navigateDigit,
  initialFractionDigits,
} from '../utils/thumbwheel';

export interface ThumbwheelInputProps {
  /** Controlled canonical display string (e.g. "42", "-3.5", "0x1A2B", "0b1010"). */
  value: string;
  onChange: (next: string) => void;
  writeFormat: WriteFormat;
  /** True for float-typed registers/parameters — enables elastic fractional-digit editing. */
  isFloat?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  helperText?: React.ReactNode;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
  slotProps?: TextFieldProps['slotProps'];
  onFocus?: TextFieldProps['onFocus'];
  onBlur?: TextFieldProps['onBlur'];
  /** Called after the thumbwheel's own key handling (e.g. to hook Enter-to-submit). */
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  autoFocus?: boolean;
  margin?: TextFieldProps['margin'];
  variant?: TextFieldProps['variant'];
}

/**
 * Digit-editable numeric TextField ("thumbwheel"): click a digit to highlight it,
 * Shift+Left/Right moves the highlight (growing decimal precision on a float past
 * the last shown digit), Up/Down steps the highlighted digit odometer-style
 * (carrying/borrowing into neighboring digits). Plain arrow keys and mouse-drag
 * text selection remain fully native. Falls back to ordinary typing otherwise.
 */
export default function ThumbwheelInput({
  value,
  onChange,
  writeFormat,
  isFloat = false,
  min,
  max,
  disabled,
  label,
  placeholder,
  helperText,
  fullWidth,
  size,
  sx,
  slotProps,
  onFocus,
  onBlur,
  onKeyDown: onKeyDownProp,
  autoFocus,
  margin,
  variant,
}: ThumbwheelInputProps) {
  const theme = useTheme();
  const thumbwheelFormat: ThumbwheelFormat = resolveThumbwheelFormat(writeFormat, isFloat);
  const defaultBounds = getDefaultBounds(thumbwheelFormat);
  const bounds = { min: min ?? defaultBounds.min, max: max ?? defaultBounds.max };

  const inputRef = useRef<HTMLInputElement | null>(null);
  const isFocusedRef = useRef(false);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [fractionDigits, setFractionDigits] = useState<number>(() => {
    if (!isFloat) return 0;
    const parsed = parseWriteInput(value, writeFormat);
    return parsed.ok ? initialFractionDigits(parsed.value) : 0;
  });

  // Resync elastic fraction width / clear any stale highlight whenever the value
  // changes from outside (live register update) — but not while the user is
  // actively editing, so in-progress thumbwheel/typing edits aren't clobbered.
  useEffect(() => {
    if (isFocusedRef.current) return;
    setSelectedIndex(null);
    if (!isFloat) return;
    const parsed = parseWriteInput(value, writeFormat);
    setFractionDigits(parsed.ok ? initialFractionDigits(parsed.value) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isFloat, writeFormat]);

  // React resets native selection on every controlled-value re-render; restore
  // the highlight after a thumbwheel-driven change.
  useLayoutEffect(() => {
    if (pendingSelectionRef.current && inputRef.current) {
      inputRef.current.setSelectionRange(pendingSelectionRef.current.start, pendingSelectionRef.current.end);
      pendingSelectionRef.current = null;
    }
  }, [value]);

  const resolveCurrentDigitIndex = (positions: DigitPosition[]): number => {
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < positions.length) return selectedIndex;
    const caret = inputRef.current?.selectionStart ?? value.length;
    return findNearestDigitPosition(positions, caret);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const s = el.selectionStart ?? 0;
    const en = el.selectionEnd ?? 0;
    if (s === en) {
      // Plain click (no drag): snap the highlight to the nearest digit.
      const positions = getDigitPositions(value, thumbwheelFormat);
      const idx = findNearestDigitPosition(positions, s);
      setSelectedIndex(idx);
      if (idx !== -1) el.setSelectionRange(positions[idx].charIndex, positions[idx].charIndex + 1);
    } else {
      // Mouse-drag range selection (copy/paste): leave it untouched.
      setSelectedIndex(null);
    }
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const s = el.selectionStart ?? 0;
    const en = el.selectionEnd ?? 0;
    if (s === en) {
      const positions = getDigitPositions(value, thumbwheelFormat);
      setSelectedIndex(findNearestDigitPosition(positions, s));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    onKeyDownProp?.(e);
    if (e.defaultPrevented) return;

    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const positions = getDigitPositions(value, thumbwheelFormat);
      if (positions.length === 0) return;
      const numeric = parseWriteInput(value, writeFormat);
      if (!numeric.ok) return;
      const startIdx = resolveCurrentDigitIndex(positions);
      const direction = e.key === 'ArrowRight' ? 1 : -1;
      const nav = navigateDigit(value, thumbwheelFormat, startIdx, direction, numeric.value, fractionDigits);
      if (!nav.changed) return;
      setFractionDigits(nav.fractionDigits);
      setSelectedIndex(nav.selectedIndex);
      const newPositions = getDigitPositions(nav.display, thumbwheelFormat);
      const target = newPositions[nav.selectedIndex];
      if (target) pendingSelectionRef.current = { start: target.charIndex, end: target.charIndex + 1 };
      if (nav.display !== value) onChange(nav.display);
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const positions = getDigitPositions(value, thumbwheelFormat);
      if (positions.length === 0) return;
      const numeric = parseWriteInput(value, writeFormat);
      if (!numeric.ok) return;
      const idx = resolveCurrentDigitIndex(positions);
      const direction = e.key === 'ArrowUp' ? 1 : -1;
      const result = applyDigitStep(numeric.value, value, thumbwheelFormat, idx, direction, bounds, fractionDigits);
      if (result.selectedIndex === -1) return;
      setSelectedIndex(result.selectedIndex);
      const newPositions = getDigitPositions(result.display, thumbwheelFormat);
      const target = newPositions[result.selectedIndex];
      if (target) pendingSelectionRef.current = { start: target.charIndex, end: target.charIndex + 1 };
      onChange(result.display);
    }
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIndex(null);
    onChange(filterWriteInput(e.target.value, writeFormat));
  };

  return (
    <TextField
      type="text"
      value={value}
      onChange={handleNativeChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      label={label}
      placeholder={placeholder}
      helperText={helperText}
      fullWidth={fullWidth}
      size={size}
      autoFocus={autoFocus}
      margin={margin}
      variant={variant}
      inputRef={inputRef}
      onFocus={(e) => { isFocusedRef.current = true; onFocus?.(e); }}
      onBlur={(e) => { isFocusedRef.current = false; setSelectedIndex(null); onBlur?.(e); }}
      slotProps={{
        ...slotProps,
        htmlInput: {
          ...(slotProps?.htmlInput ?? {}),
          onMouseUp: handleMouseUp,
          onSelect: handleSelect,
        },
      }}
      sx={[
        {
          '& input::selection': {
            backgroundColor: alpha(theme.palette.primary.main, 0.35),
            color: theme.palette.primary.contrastText,
          },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}
