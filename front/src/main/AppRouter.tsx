import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from '../landing/LandingPage';

const DevcordApp = lazy(() => import('./DevcordApp'));

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050a1f] text-white">
      <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold">
        Loading Devcord...
      </div>
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app/*" element={<DevcordApp />} />
          <Route path="/channels/*" element={<Navigate to="/app/channels" replace />} />
          <Route path="/join/:code" element={<Navigate to="/app" replace />} />
          <Route path="/invite/:code" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
