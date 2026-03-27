import DevcordApp from './DevcordApp';
import LandingPage from '../landing/LandingPage';

function shouldRenderApp(pathname: string): boolean {
  if (/^\/app(\/|$)/i.test(pathname)) return true;
  if (/^\/channels(\/|$)/i.test(pathname)) return true;
  if (/^\/(join|invite)\//i.test(pathname)) return true;
  return false;
}

export function AppRouter() {
  const path = typeof window === 'undefined' ? '/' : window.location.pathname || '/';
  return shouldRenderApp(path) ? <DevcordApp /> : <LandingPage />;
}
