/**
 * Tracks whether the user has authenticated at least once in the current browser
 * tab session. This allows ProtectedRoute to distinguish between a fresh visit
 * (user never logged in) and an expired session (user was logged in, now isn't).
 *
 * Values are kept in memory only — they are reset when the tab is closed or the
 * page is hard-reloaded. Mutation is performed from event handlers (login success,
 * logout), never from render functions, keeping this store React Compiler–safe.
 */

type Subscriber = () => void;

let authenticated = false;
const subscribers = new Set<Subscriber>();

function notify() {
  subscribers.forEach((cb) => cb());
}

export const sessionHistory = {
  subscribe: (cb: Subscriber): (() => void) => {
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  },
  getSnapshot: (): boolean => authenticated,
  markAuthenticated: (): void => {
    if (!authenticated) {
      authenticated = true;
      notify();
    }
  },
  clearAuthenticated: (): void => {
    if (authenticated) {
      authenticated = false;
      notify();
    }
  },
};
