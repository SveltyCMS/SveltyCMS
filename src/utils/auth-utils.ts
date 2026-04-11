/**
 * @file src/utils/auth-utils.ts
 * @description Shared authentication and session management utilities
 */

/**
 * Parses a session duration string and returns the duration in milliseconds
 * @param duration String representation (e.g., '1h', '7d')
 * @returns Duration in milliseconds
 */
export function parseSessionDuration(duration: string): number {
  const durationMap: Record<string, number> = {
    "1h": 60 * 60 * 1000, // 1 hour
    "1d": 24 * 60 * 60 * 1000, // 1 day
    "7d": 7 * 24 * 60 * 60 * 1000, // 7 days
    "14d": 14 * 24 * 60 * 60 * 1000, // 14 days
    "30d": 30 * 24 * 60 * 60 * 1000, // 30 days
    "90d": 90 * 24 * 60 * 60 * 1000, // 90 days
  };

  return durationMap[duration] || durationMap["1d"]; // Default to 1 day for standard logins
}
