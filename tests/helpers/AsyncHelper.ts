export class AsyncHelper {
  /**
   * Skips "a tick", so all current promises could settle (resolve/reject) themselves
   *
   * NOTE: Doesn't work in browser, only works in Node environment
   */
  waitForPromisesToSettle() {
    return new Promise(process.nextTick);
  }
}
