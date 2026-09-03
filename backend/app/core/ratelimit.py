"""A small in-process rate limiter for the login endpoint.

Without this, the login route is an open door for credential stuffing: an
attacker can try passwords as fast as the network allows. Failures are counted
per email and per client address, and a successful login clears the counter, so
a real user who mistypes twice then gets it right is never locked out.

Deliberately in-process. It needs no Redis, and for a single-restaurant
deployment - one uvicorn process - that is the honest scope. Behind several
workers each would keep its own count, which loosens the limit but does not
break it; a shared store is the upgrade path if this ever runs multi-process.
"""

import time
from collections import defaultdict

# Per account: enough for a person having a bad morning, few enough to make
# guessing a single password pointless.
MAX_ATTEMPTS = 8

# Per address: deliberately far higher. In a restaurant every tablet and till
# shares one public address, so a tight per-IP limit would let one waiter
# mistyping their password lock out the whole floor mid-service. This tier
# exists to stop a script working through many accounts, not to police one
# person, so it must not be the binding constraint in normal use.
MAX_ATTEMPTS_PER_ADDRESS = 50

WINDOW_SECONDS = 15 * 60
LOCKOUT_SECONDS = 15 * 60


class LoginRateLimiter:
    def __init__(
        self,
        max_attempts: int = MAX_ATTEMPTS,
        window_seconds: int = WINDOW_SECONDS,
        lockout_seconds: int = LOCKOUT_SECONDS,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._failures: dict[str, list[float]] = defaultdict(list)

    def _recent(self, key: str, now: float) -> list[float]:
        cutoff = now - self.window_seconds
        attempts = [moment for moment in self._failures[key] if moment > cutoff]
        self._failures[key] = attempts
        return attempts

    def retry_after(self, key: str) -> int:
        """Seconds to wait, or 0 when the caller may try now."""
        now = time.monotonic()
        attempts = self._recent(key, now)
        if len(attempts) < self.max_attempts:
            return 0
        remaining = self.lockout_seconds - (now - attempts[-1])
        return max(1, int(remaining))

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        self._recent(key, now)
        self._failures[key].append(now)

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)

    def clear(self) -> None:
        self._failures.clear()


login_limiter = LoginRateLimiter()

# The shared-address tier, with its own much looser budget.
address_limiter = LoginRateLimiter(max_attempts=MAX_ATTEMPTS_PER_ADDRESS)


def clear_all() -> None:
    login_limiter.clear()
    address_limiter.clear()
