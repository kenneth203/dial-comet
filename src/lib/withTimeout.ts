// Emergency loading-repair — bounded settlement wrapper.
//
// Supabase / GoTrue promises are not AbortSignal-cancellable. `withTimeout`
// does NOT cancel the underlying work — it guarantees the *caller* reaches a
// terminal state within `ms`. If the wrapped promise never settles, the
// timeout branch rejects with a TimeoutError, and any late settlement of the
// abandoned promise is swallowed by an attached no-op catch so it cannot
// surface as an unhandled rejection.

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`withTimeout: "${label}" did not settle within ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TimeoutError(label, ms));
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );

    // Ensure late settlement of the abandoned promise cannot become an
    // unhandled rejection after the timeout branch has already fired.
    Promise.resolve(promise).catch(() => {
      /* swallowed — caller already rejected via timeout */
    });
  });
}
