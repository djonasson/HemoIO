# Alerts Grouping and Timeline Link — Design

**Date:** 2026-10-30
**Branch:** `feature/alerts-grouping`

## Goal

1. The Alerts page shows **one card per test** (biomarker) instead of one card per
   out-of-range result plus a separate "By Biomarker" section. The card shows the
   latest result and "N results · M new", and expands to show the earlier results.
   Acknowledge and dismiss on a card apply to every result of that test; a later
   out-of-range result for that test makes the card new again.
2. In the Timeline, a test's name in a lab result's table opens Trends on that test
   at that result's date, the way an alert does.

## Alerts: model

Alert detection (`useAlerts`) is unchanged: out-of-range alerts per value, at most
one trend alert and one improvement alert per test, both about its latest value.

A pure service function, `groupAlerts(alerts, acknowledgedThrough, dismissedThrough)`
in `src/services/alerts/`, builds the cards:

- **Card per test** with every alert of that test.
- **Headline:** the latest out-of-range or improvement alert (the test's current
  state). A trend alert is attached to the card, not a headline of its own.
- **Results:** the test's out-of-range results, newest first. "N results" counts
  them all, including acknowledged ones; "M new" counts those dated after the
  test's acknowledgement date. The expansion lists every result except the
  headline, each marked "New" when it is.
- **Visible** when the card has something new (an alert dated after the
  acknowledgement) and its latest alert is dated after any dismissal.
- **Severity and order:** a card's severity is its most severe new alert, so a
  new critical earlier result keeps the card critical (badge, border colour and
  width, announced severity) even when its latest result is only a warning or an
  improvement; that earlier result carries its own "Critical" badge. Cards are
  ordered by that severity, then by latest date.
- **Current state:** when an old out-of-range result heads the card because the
  test's latest value raised no alert, the card says "Latest result within range"
  (or "Latest result has no reference range"), so an old result never reads as
  the current state. On a day with several values for the test, an out-of-range
  one counts as that day's value.

Acknowledging and dismissing work on dates, so a result imported later but dated
on or before the acknowledgement or dismissal stays hidden; only a result dated
later brings the card back.

Acknowledging a card stores the test's latest alert date, exactly as today's
per-biomarker `acknowledgedThrough` does, so a later result shows as new again with
no storage change. Dismissal becomes per test as well: an in-memory
`dismissedThrough` record replaces `dismissedIds`, so a later result brings the
card back too. Dismissals last for the page load and the unlocked session, and a
backup restore clears them.

The nav badge and the header's "N new" count the new out-of-range results on the
visible cards (the sum of M), so they keep their meaning.

## Alerts: UI

`AlertGroupCard` (one per test) keeps today's card anatomy: `role="article"`,
accessible name "Alert for <test>: <severity>, <state>. <message>", coloured left
border plus icon and text badges (never colour alone). Clicking the card, or Enter
or Space on it, opens Trends at the headline's date. It adds:

- "N results · M new" text (the "· M new" part is left out when M is 0, which only
  happens for an improvement after acknowledged results).
- A trend line ("Trend" badge and message) when the test has a trend alert.
- A "Show earlier results" toggle (`aria-expanded`, `aria-controls`) when there
  are earlier results. Each earlier result is a button that opens Trends at its own
  date.
- Acknowledge and Dismiss buttons that act on the whole test.

The category filter and "Show N more" now work on cards.

## Timeline link

`TestValuesList` gets the lab result's date and an optional `onOpenTrend(key, date)`,
passed down from `AppShell` through `TimelineView` and `LabResultCard`. A numeric
value's test name becomes a link-styled button ("<name>, open trend") that calls it.
Trends only charts numeric values (`isTrendable`, shared by Trends, alerts and the
Timeline), so other values keep plain text. The description tooltip stays and also
opens on keyboard focus; a plain name with a description is focusable for that,
and screen readers get the description through `aria-describedby`.

## Testing

Gherkin first (`features/alerts.feature`, `features/timeline-view.feature`), then
E2E (`e2e/alerts.spec.ts`, `e2e/timeline-view.spec.ts`), unit tests for
`groupAlerts`, `useAlerts`, `AlertStateContext`, `AlertGroupCard`,
`OutOfRangeAlerts` and `TestValuesList`, then the implementation.
