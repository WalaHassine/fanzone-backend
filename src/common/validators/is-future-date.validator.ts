import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * @IsFutureDate
 *
 * Property guard asserting that an ISO 8601 datetime string refers to a moment
 * strictly after "now". Used for `matchDate`: a World Cup fixture cannot be
 * scheduled in the past.
 *
 * It validates *semantics only*, not format: if the value does not parse to a
 * real date it returns `true` and defers to a co-located `@IsISO8601()` to raise
 * the format error, so a single malformed input yields one message rather than
 * two overlapping ones.
 *
 * @example
 * @IsISO8601({ strict: true })
 * @IsFutureDate({ message: 'matchDate must be a datetime in the future' })
 * matchDate!: string;
 */
export function IsFutureDate(validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isFutureDate',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' && !(value instanceof Date)) {
            return false;
          }
          const time = new Date(value as string).getTime();
          // Not a parseable date — leave the format complaint to @IsISO8601.
          if (Number.isNaN(time)) {
            return true;
          }
          return time > Date.now();
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a datetime in the future`;
        },
      },
    });
  };
}
