import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * @RequiredTogether
 *
 * Class-level guard for a group of fields that only make sense as a set: it
 * passes when the named properties are *all* present or *all* absent, and fails
 * on a partial set. Use it for co-dependent filter parameters — a `maxDistance`
 * with no coordinates to measure from is not a narrower search, it is a bug.
 *
 * It MUST decorate the class, not a property: attaching it to an `@IsOptional()`
 * field would let that field's own optional-skip suppress the check on exactly
 * the partial-set case it exists to catch. Registered under a synthetic property
 * name so no real field's skip condition can gate it — the same technique as
 * `@AtLeastOneField`.
 *
 * The registration keys are derived from `fields` rather than being constant.
 * class-validator groups results by `propertyName` and stores each rule under
 * its `name` in a single `constraints` map, so two `@RequiredTogether` rules on
 * one class sharing fixed keys would collide and the second would overwrite the
 * first — silently reporting one violation where two occurred, defeating
 * `stopAtFirstError: false`.
 *
 * @example
 * @RequiredTogether(['latitude', 'longitude', 'maxDistance'])
 * class FanzoneFilterDto {
 *   latitude?: number;
 *   longitude?: number;
 *   maxDistance?: number;
 * }
 */
export function RequiredTogether(
  fields: string[],
  validationOptions?: ValidationOptions,
) {
  const key = fields.join('_');

  return (target: object) => {
    registerDecorator({
      name: `requiredTogether_${key}`,
      target: (target as { new (...args: unknown[]): unknown }),
      propertyName: `__requiredTogether_${key}__`,
      constraints: [fields],
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const [names] = args.constraints as [string[]];
          const obj = args.object as Record<string, unknown>;
          const present = names.filter(
            (name) => obj[name] !== undefined && obj[name] !== null,
          );
          return present.length === 0 || present.length === names.length;
        },
        defaultMessage(args: ValidationArguments): string {
          const [names] = args.constraints as [string[]];
          return `${names.join(', ')} must be provided together`;
        },
      },
    });
  };
}
