// CSS `grid-template-columns` value for a gallery that fits as many columns as
// the available width allows, each at least `minCardWidth` wide.
//
// `min(100%, …)` keeps a single column from overflowing a viewport narrower
// than `minCardWidth`.
export const autoFillColumns = (minCardWidth: number): string =>
  `repeat(auto-fill, minmax(min(100%, ${minCardWidth}px), 1fr))`;
