import { createRoot } from 'react-dom/client';
import { AppRouter } from './src/main';
import './src/index.css';
import { ErrorBoundary } from './src/main/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AppRouter />
  </ErrorBoundary>,
);
