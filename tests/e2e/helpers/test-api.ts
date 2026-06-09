export const TEST_API_SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

export const TEST_API_HEADERS = {
  "x-test-mode": "true",
  "x-test-secret": TEST_API_SECRET,
};
