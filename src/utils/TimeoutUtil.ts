export class TimeoutUtil {
  // Resolves after specified delay.
  static delay(ms: number) {
    return new Promise((resolve, _) => setTimeout(resolve, ms));
  }

  // Rejects after specified delay.
  static timeout(ms: number) {
    return new Promise((_, reject) => setTimeout(reject, ms));
  }
}
