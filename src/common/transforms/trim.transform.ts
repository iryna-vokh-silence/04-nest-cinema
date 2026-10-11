import { Transform } from 'class-transformer';

/**
 * Trims string input before validation, so "   " becomes "" and is rejected
 * by @IsNotEmpty(). Non-string values are passed through unchanged and are
 * reported by the type validators.
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
