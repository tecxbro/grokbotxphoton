/** Deterministic test clock; no wall-clock timing or sleep-dependent assertions. */
export class TestClock {
  constructor(public value = 1000) {}
  now() { return this.value; }
  advance(ms: number) { this.value += ms; }
}
