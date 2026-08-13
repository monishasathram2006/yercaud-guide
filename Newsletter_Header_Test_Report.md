# Test Report — Newsletter Subscribe Form & Header

Component tests written against the two QA sheets provided in this session:
`frontend/test/NewsletterForm.test.tsx` (23 rows, TC01–TC23, 22 automated
tests) and `frontend/test/Header.test.tsx` (50 rows, HN-001–HN-050, 32
automated tests). All 106 tests in the frontend suite pass as of this report.

"Actual Result" reflects what the component genuinely does, verified by
running the tests — not the QA sheet's assumption where the two differ.
**Status** legend: **Pass** = matches the sheet's expectation · **Divergence**
= behaves differently than the sheet expected (noted why) · **Fixed** = was a
real gap, fixed during this session · **Not Testable** = needs a real
browser/E2E harness, not exercised here.

## Newsletter Subscribe Form (Footer) — TC01–TC23

| ID | Test Case | Expected Result (sheet) | Actual Result (verified) | Status |
|---|---|---|---|---|
| TC01 | Valid email submission | Subscription succeeds, success message shown | Succeeds; calls `api.content.subscribe({ email, source: "footer" })`; shows "Thanks — you're subscribed." | Pass |
| TC02 | Empty field submission | Inline error: "Email is required" | Shows "Enter a valid email" — one message covers both blank and malformed input, there's no separate "required" message | Divergence |
| TC03 | Invalid email format ("test@", "test.com", "test@@x.com") | Error: "Please enter a valid email" | Blocked by the browser's native `type="email"` constraint *before* the app's own validation runs — no app error text renders, no API call | Divergence |
| TC04 | Missing domain/TLD ("test@domain") | Validation error shown | Passes native constraint (no TLD required by the browser), but the app's own regex requires a dot — "Enter a valid email" shown | Pass |
| TC05 | Leading/trailing whitespace (" test@domain.com ") | Trimmed automatically and accepted | Browser strips whitespace as typed (native `type="email"` sanitization), then `.trim()` again before sending — accepted | Pass |
| TC06 | Duplicate email | Friendly message: "You're already subscribed" | Same generic "Thanks — you're subscribed" message either way — by design, the backend's response can't reveal a prior subscription (prevents email enumeration) | Divergence (by design) |
| TC07 | Case sensitivity ("Test@Domain.com" vs "test@domain.com") | Treated as same subscriber (normalized to lowercase) | No normalization — sent exactly as typed; backend's uniqueness is on the raw column | Divergence (by design) |
| TC08 | Very long email string (250+ chars) | Gracefully rejected or truncated | No client-side length limit — sent in full, untruncated (would only be caught server-side) | Divergence |
| TC09 | XSS attempt (`<script>alert(1)</script>@x.com`) | Input sanitized, no script execution | Blocked entirely by the native email-format constraint before reaching app code or the API; confirmed no `<script>` element ever appears in the DOM | Pass |
| TC10 | SQL injection attempt (`' OR '1'='1`) | Input sanitized/escaped, no DB error exposed | Blocked by the native constraint (no "@") before reaching app code or the API | Pass |
| TC11 | Double submission (rapid double-click) | Only one request sent; button disables | Confirmed — button disables after the first click; a second rapid click yields exactly one API call | Pass |
| TC12 | Network failure | Error message shown, no silent failure | Raw browser error ("Failed to fetch") shown verbatim — not a translated/friendly message, but not silent either | Pass |
| TC13 | Server error (5xx) | "Something went wrong, try again" | The server's actual error message is shown verbatim, not a generic fallback | Divergence |
| TC14 | Placeholder visibility on dark background | Legible placeholder | Not testable — visual/contrast check needs a real browser | Not Testable |
| TC15 | Focus state (outline/border change) | Visible focus styling | Focus *reachability* confirmed (input can receive focus); the visual outline itself is CSS-only, not verified | Partial |
| TC16 | Button hover/active state | Visual feedback on hover/click | Not testable — CSS-only | Not Testable |
| TC17 | Loading state | Loading indicator, disabled until response | Button text becomes "Subscribing..." and is disabled while pending | Pass |
| TC18 | Keyboard navigation (Tab, Enter) | Fully operable via keyboard | Field is keyboard-reachable; Enter submits the form | Pass |
| TC19 | Screen reader labels | Proper ARIA labels/roles | **Gap found**: input had no accessible name (placeholder isn't one) — fixed with `aria-label="Email address"` | Fixed |
| TC20 | Color contrast (WCAG AA) | Meets contrast requirements | Not testable — needs visual/contrast tooling | Not Testable |
| TC21 | Responsive (mobile/tablet) | Stacks/resizes without clipping | Not testable — the test environment (jsdom) has no real CSS layout engine | Not Testable |
| TC22 | Bot/spam prevention | Rate limiting or CAPTCHA triggers | Not implemented anywhere (frontend or backend) | Divergence (gap) |
| TC23 | Special characters in local part (`user+test@domain.com`, `user.name@domain.com`) | Valid formats accepted | Confirmed accepted, sent as typed | Pass |

## Header — HN-001–HN-050

`@tanstack/react-router` is mocked for these tests (no real router in a component test), so any "clicking X opens page Y" row is verified as **"the link's href is correct"**, not as an actual page/URL change.

| ID | Test Case | Expected Result (sheet) | Actual Result (verified) | Status |
|---|---|---|---|---|
| HN-001 | Header displayed on page load | Visible, no layout issues | Renders without error | Pass |
| HN-002 | Company logo displayed | Logo visible, not broken | `<img>` present with correct `src`/`alt`; actual load-success needs a real browser/network | Pass* |
| HN-003 | Clicking logo redirects to Home | Redirected to Home | href="/" confirmed; real navigation needs a real router | Pass* |
| HN-004 | Navigation menu displayed | All menu items visible | All 9 nav items present | Pass |
| HN-005 | Home menu navigation | Home page opens | href="/" | Pass* |
| HN-006 | Hotels menu navigation | Hotels page opens | href="/hotels" | Pass* |
| HN-007 | Restaurants menu navigation | Restaurants page opens | href="/restaurants" | Pass* |
| HN-008 | Activities menu navigation | Activities page opens | href="/activities" | Pass* |
| HN-009 | Travel menu navigation | Travel page opens | href="/travel" | Pass* |
| HN-010 | Tours & Travels navigation | Correct page opens | href="/tours" | Pass* |
| HN-011 | Directory navigation | Directory page opens | href="/directory" | Pass* |
| HN-012 | Blog navigation | Blog page opens | href="/blog" | Pass* |
| HN-013 | FAQ navigation | FAQ page opens | href="/faq" | Pass* |
| HN-014 | Active menu highlighting | Current page menu highlighted | Confirmed — current-path link gets the active style; Home is active only at the exact root, not by prefix | Pass |
| HN-015 | Hover effect on menu items | Hover effect displayed | Not testable — CSS-only | Not Testable |
| HN-016 | Menu items are clickable | Every item responds to click | All are real `<a href>` elements | Pass |
| HN-017 | Menu text readable | Properly aligned/visible | Not testable — visual | Not Testable |
| HN-018 | Header alignment | Elements properly aligned | Not testable — visual | Not Testable |
| HN-019 | Sign In button visible | Displayed | Confirmed when signed out | Pass |
| HN-020 | Clicking Sign In | Login page/modal opens | href="/login" confirmed; real page-open needs a real router | Pass* |
| HN-021 | Favorites icon visible | Displayed | Confirmed | Pass |
| HN-022 | Clicking Favorites when logged in | Favorites page opens | href="/favorites" confirmed | Pass* |
| HN-023 | Clicking Favorites when logged out | Redirected to login | **Diverges**: Header doesn't gate this link at all — it's always "/favorites" regardless of auth. The `/favorites` route itself shows a sign-in prompt in place (no URL redirect) | Divergence |
| HN-024 | Favorites icon hover state | Hover effect correct | Not testable — CSS-only | Not Testable |
| HN-025 | Sign In button hover state | Hover styling correct | Not testable — CSS-only | Not Testable |
| HN-026 | Keyboard navigation through header | Tab moves focus sequentially | Confirmed: logo → Home → ... in source order | Pass |
| HN-027 | Enter key activates menu links | Selected page opens | Focused link is a real, native-activatable anchor with href; actual page-open needs a real router | Pass* |
| HN-028 | Focus indicator visibility | Focus outline clearly visible | Focus reachability confirmed; the visible outline itself is CSS, not verified | Partial |
| HN-029 | Screen reader labels | Accessible names announced correctly | Mobile-menu toggle's `aria-label`/`aria-expanded` update correctly with state | Pass |
| HN-030 | Header responsiveness — desktop | Layout intact | Not testable — jsdom has no CSS layout engine | Not Testable |
| HN-031 | Header responsiveness — tablet | Layout adjusts | Not testable | Not Testable |
| HN-032 | Header responsiveness — mobile | Mobile layout displays | Not testable | Not Testable |
| HN-033 | Navigation menu on mobile | Mobile nav functions | Confirmed: toggle button opens/closes the mobile nav; items duplicate only while open | Pass |
| HN-034 | Header doesn't overlap content | Content remains visible | Not testable — visual/layout | Not Testable |
| HN-035 | Sticky header | Remains fixed during scroll | Header carries `sticky`/`top-0` classes; actual scroll behavior needs a real browser | Partial |
| HN-036 | Header on page refresh | Loads correctly | Not testable — SSR/E2E concern | Not Testable |
| HN-037 | Broken links in navigation | None found | All 9 nav hrefs match real, existing route files (`hotels.tsx`, `restaurants.tsx`, etc.) | Pass |
| HN-038 | Browser compatibility | Works in supported browsers | Not testable — needs real browsers/E2E | Not Testable |
| HN-039 | Logo under slow network | Loads successfully | Not testable — needs real network throttling | Not Testable |
| HN-040 | Navigation under slow network | Still functions | Not testable | Not Testable |
| HN-041 | No console errors on load | No JS errors | Confirmed — no `console.error` calls rendering signed-out or signed-in | Pass |
| HN-042 | Page title updates after navigation | Correct title shown | Not Header's responsibility — each route sets its own title via `head()` | Out of scope |
| HN-043 | URL changes after navigation | URL matches destination | Not verifiable without a real router | Not Testable |
| HN-044 | Unauthorized pages require authentication | Protected pages redirect | Not Header's responsibility — each protected route gates itself (e.g. `favorites.tsx`) | Out of scope |
| HN-045 | Browser Back button | Previous page restored | Not testable — real browser history needed | Not Testable |
| HN-046 | Browser Forward button | Next page restored | Not testable | Not Testable |
| HN-047 | Multiple rapid clicks on menu | No duplicate requests/UI issues | Adapted: rapid clicks on the mobile-menu toggle flip state cleanly each time, no stuck state. Links themselves fire no requests in this app, so "duplicate requests" doesn't apply | Pass (adapted) |
| HN-048 | Navigation after session timeout | Login prompt shown | Header has no session-timeout-specific logic — it just reflects the current auth state, so an expired session renders the same as a fresh signed-out visit | Pass (adapted) |
| HN-049 | Dark/light theme support | Header renders correctly | Not implemented anywhere in this codebase | Divergence (gap) |
| HN-050 | Header performance | Loads within acceptable time | Not testable — needs real performance tooling | Not Testable |

\* "Pass" on navigation rows means the link's href is verified correct, not that a real page transition was observed (no live router in these tests).
