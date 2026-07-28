import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * @AtLeastOneField
 *
 * Class-level guard for "partial update" DTOs: passes only when at least one of
 * the named properties is actually present (not `undefined` and not `null`).
 * Without it, a PATCH body of `{}` would satisfy every `@IsOptional()` field and
 * sail through validation as a no-op update.
 *
 * It MUST decorate the class, not a property: attaching it to an `@IsOptional()`
 * field would let that field's own optional-skip suppress this check on exactly
 * the empty-body case it exists to catch. Registered under a synthetic property
 * name so no real field's skip condition can gate it.
 *
 * @example
 * @AtLeastOneField(['city', 'favoriteAmbiance'])
 * class UpdateUserPreferenceDto {
 *   city?: string;
 *   favoriteAmbiance?: AmbiancePreference;
 * }
 */
export function AtLeastOneField(
  fields: string[],
  validationOptions?: ValidationOptions,
) {
  return (target: object) => {
    registerDecorator({
      name: 'atLeastOneField',
      target: target as { new (...args: unknown[]): unknown },
      propertyName: '__atLeastOneField__',
      constraints: [fields],
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const [names] = args.constraints as [string[]];
          const obj = args.object as Record<string, unknown>;
          return names.some(
            (name) => obj[name] !== undefined && obj[name] !== null,
          );
        },
        defaultMessage(args: ValidationArguments): string {
          const [names] = args.constraints as [string[]];
          return `At least one of ${names.join(', ')} must be provided`;
        },
      },
    });
  };
}
