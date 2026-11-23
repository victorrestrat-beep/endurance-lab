/**
 * Raised when a model receives input it cannot work with: an empty or
 * non-finite series, a duration that is not a whole number of seconds, too few
 * points to fit a model, and so on.
 */
export class ModelInputError extends RangeError {
  override readonly name = 'ModelInputError';
}
