const registrationRegistry = new Set<string>();

/**
 * Ensures a metric registration block is executed at most once per process lifetime.
 */
export function createIdempotentMetricRegistration(
  key: string,
  registerFn: () => void,
): boolean {
  if (registrationRegistry.has(key)) {
    return false;
  }
  registerFn();
  registrationRegistry.add(key);
  return true;
}

/**
 * Resets the registration registry (for unit testing purposes).
 */
export function resetMetricRegistrationsForTest(): void {
  registrationRegistry.clear();
}
