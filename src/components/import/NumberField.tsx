/**
 * A number input that keeps what is typed
 */

import { useRef, useState } from 'react';
import { NumberInput, type NumberInputProps } from '@mantine/core';

export interface NumberFieldProps extends Omit<NumberInputProps, 'value' | 'onChange' | 'onValueChange'> {
  /** The number shown when the field opens; none for a blank field */
  value: number | undefined;
  /** The number typed ("1." reports 1), or none while the field is blank or only "-" */
  onValueChange: (value: number | undefined) => void;
}

/**
 * Keeps the text as typed and reports a number only once it is one. Fed
 * back its own number, a number input rewrites a half-typed "-0" as "0",
 * and "-0.5" would end up 0.5.
 */
export function NumberField({ value, onValueChange, ...inputProps }: NumberFieldProps): React.JSX.Element {
  const [text, setText] = useState<string | number>(
    value !== undefined && Number.isFinite(value) ? value : ''
  );
  const lastNumber = useRef<number>(value ?? NaN);
  return (
    <NumberInput
      {...inputProps}
      value={text}
      onChange={(typed) => {
        const number = typeof typed === 'number' ? typed : typed.trim() === '' ? NaN : Number(typed);
        // On blur the input reports its number again, -0 as 0 (=== takes
        // them as equal): nothing changed, and "-0" stays as typed
        if (typeof typed === 'number' && number === lastNumber.current) return;
        lastNumber.current = number;
        // "-0" is a number but still half typed: keep it as text
        setText(Object.is(number, -0) ? String(typed) || '-0' : typed);
        onValueChange(Number.isFinite(number) ? number : undefined);
      }}
    />
  );
}
