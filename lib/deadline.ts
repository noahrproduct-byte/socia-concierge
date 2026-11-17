// A time limit for long work inside a request. A serverless function that is
// still working when the platform's own limit arrives is killed with no chance
// to clean up: the allowance it took is never given back and the person gets a
// reply that just stops. Racing the work against a slightly shorter limit of
// our own lets the route give the allowance back and say what happened. The
// work itself is not cancelled (it ends when the function does). Pure.

export class DeadlineError extends Error {
  readonly ms: number;
  constructor(ms: number) {
    super(`Stopped after ${Math.round(ms / 1000)} seconds.`);
    this.name = "DeadlineError";
    this.ms = ms;
  }
}

/** The margin kept between our own limit and the function's, for the reply and the clean-up. */
export const DEADLINE_MARGIN_MS = 25_000;

/** Our own limit for a route allowed `maxDurationSeconds` by the platform. */
export const deadlineFor = (maxDurationSeconds: number): number => Math.max(5_000, maxDurationSeconds * 1000 - DEADLINE_MARGIN_MS);

/** `work`, or a DeadlineError after `ms`. The timer never holds the process open. */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
  });
  // A late failure of the abandoned work must not become an unhandled rejection.
  work.catch(() => undefined);
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** What a person is told when their request ran out of time. */
export const TOOK_TOO_LONG = "That took too long and was stopped. It didn't use up your allowance. Try again in a moment.";
