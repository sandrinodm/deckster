/**
 * Seconds per minute.
 */
const SECONDS_PER_MINUTE = 60;

/**
 * Minutes per hour.
 */
const MINUTES_PER_HOUR = 60;

/**
 * Formats a duration as `m:ss`, or `h:mm:ss` from an hour on.
 *
 * @param totalSeconds - A non-negative duration; fractions are dropped and negative values read as
 *   zero.
 */
export function formatDuration(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const seconds = whole % SECONDS_PER_MINUTE;
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const hours = Math.floor(whole / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  if (hours === 0) {
    return `${minutes}:${twoDigits(seconds)}`;
  }

  return `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

/**
 * Formats a signed offset such as `+1:05` or `-0:20`.
 *
 * @param seconds - A duration that may be negative.
 */
export function formatSigned(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  return `${sign}${formatDuration(Math.abs(seconds))}`;
}

/**
 * Formats time left: `4:08` while there is some, `-0:20` once it has run out.
 *
 * @param seconds - A duration that is negative when overrun.
 */
export function formatRemaining(seconds: number): string {
  return seconds < 0 ? `-${formatDuration(-seconds)}` : formatDuration(seconds);
}

/**
 * Writes a whole number with at least two digits, so minutes and seconds line up as `05`.
 *
 * @param value - A non-negative whole number below 100.
 */
function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}
