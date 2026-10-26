// Publish dates are rendered as UTC calendar days (YYYY-MM-DD) so the day a
// post shows never drifts with the reader's timezone.
export const formatDate = (date: Date): string => date.toISOString().slice(0, 10);
