import { registerDecorator, ValidationOptions } from 'class-validator';

export const CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks that a string has the YYYY-MM-DD format AND is a real calendar date
 * (e.g. 2030-02-30 is rejected).
 */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !CALENDAR_DATE_REGEX.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function IsCalendarDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must be a real date in YYYY-MM-DD format`,
        ...validationOptions,
      },
      validator: { validate: isCalendarDate },
    });
  };
}
