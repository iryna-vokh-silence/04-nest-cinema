import { ValidateIf } from 'class-validator';

/**
 * Like @IsOptional(), but only skips validation when the property is absent
 * (undefined). An explicit `null` is still validated and therefore rejected,
 * so PATCH requests cannot wipe required fields with null.
 */
export function IsDefinedIfPresent(): PropertyDecorator {
  return ValidateIf((_object, value) => value !== undefined);
}
