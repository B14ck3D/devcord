import { createRoot } from 'react-dom/client';
import { AppRouter } from './src/main';
import './src/index.css';

createRoot(document.getElementById('root')!).render(<AppRouter />);
