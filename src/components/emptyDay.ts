/** What an empty day says, depending on whether a flight shaped it. */
export function emptyDayText(hasFlight: boolean): string {
  return hasFlight
    ? 'A travel day. Nothing is scheduled around your flight — settle in near where you are staying.'
    : 'No stops fit this day. Try another plan option, or a different way of getting around.'
}
