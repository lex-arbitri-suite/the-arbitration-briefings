/** Keeps development card counts flat so all viewports render the same amount of content. */
export function useDevelopmentGridDensity() {
  return { latestCount: 6, historicalCount: 6 };
}
