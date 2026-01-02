import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';

export const handleFirewall: Handle = async ({ event, resolve }) => {

  // ✅ ONLY bypass for integration API tests
  if (event.request.headers.get('x-integration-test') === 'true') {
    return resolve(event);
  }

  const { request, url } = event;
  const userAgent = request.headers.get('user-agent') || '';
  const pathname = url.pathname.toLowerCase();
  const search = url.search.toLowerCase();

  const firewallEnabled = getPrivateSettingSync('FIREWALL_ENABLED') ?? true;
  if (!firewallEnabled) return resolve(event);

  if (/HeadlessChrome|Selenium|Puppeteer|Playwright/i.test(userAgent)) {
    throw error(403, 'Forbidden: Automated access detected');
  }

  if (/[?&](password|token|secret|api_key)=/i.test(pathname + search)) {
    throw error(403, 'Forbidden: Request pattern not allowed');
  }

  return resolve(event);
};
