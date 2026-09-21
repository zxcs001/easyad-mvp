/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import CookieConsentBanner from '../app/component/cookie-consent';
import { readCookieConsent, saveCookieConsent } from '../app/lib/cookie-consent';

const route = vi.hoisted(() => ({ pathname: '/', search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
afterEach(() => {
  cleanup();
  for (const cookie of document.cookie.split(';')) document.cookie = `${cookie.split('=')[0].trim()}=; Max-Age=0; Path=/`;
  route.pathname = '/';
  route.search = '';
});

test('asks on first visit and remembers rejection across mounts', () => {
  const view = render(<CookieConsentBanner />);
  expect(screen.getByRole('heading', { name: 'Your cookie choices' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reject optional' }));
  expect(readCookieConsent()).toBe('necessary');
  view.unmount();
  render(<CookieConsentBanner />);
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cookie settings' })).toBeVisible();
});

test('allows acceptance and withdrawal and deletes the optional cookie', () => {
  render(<CookieConsentBanner />);
  fireEvent.click(screen.getByRole('button', { name: 'Accept optional' }));
  expect(readCookieConsent()).toBe('preferences');
  document.cookie = 'ooh_intro_dismissed=1; Path=/';
  fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Save cookie choices' }));
  expect(readCookieConsent()).toBe('necessary');
  expect(document.cookie).not.toContain('ooh_intro_dismissed');
});

test('optional preferences default off and malformed consent is ignored', () => {
  document.cookie = 'easyad_cookie_consent=invalid; Path=/';
  render(<CookieConsentBanner />);
  fireEvent.click(screen.getByRole('button', { name: 'Customize cookies' }));
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

test.each([
  ['/player', ''],
  ['/devices', ''],
  ['/devices/screen-1', ''],
  ['/login', ''],
  ['/government', 'view=network'],
  ['/', 'view=discover'],
  ['/', 'role=advertiser&view=campaigns'],
])('does not render cookie controls at %s?%s', (pathname, search) => {
  route.pathname = pathname;
  route.search = search;
  const { container } = render(<CookieConsentBanner />);
  expect(container).toBeEmptyDOMElement();
});

test.each(['', 'view=portal', 'role=advertiser&view=portal'])('keeps cookie settings on the portal and its 3D starter for %s', search => {
  route.search = search;
  saveCookieConsent('necessary');
  render(<CookieConsentBanner />);
  expect(screen.getByRole('button', { name: 'Cookie settings' })).toBeVisible();
});

test('saved consent uses a versioned value', () => {
  saveCookieConsent('preferences');
  expect(document.cookie).toContain('easyad_cookie_consent=v1.preferences');
});
