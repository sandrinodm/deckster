import { createRoot } from 'react-dom/client';

import { App } from './app.tsx';
import './app.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('index.html has no #root element.');
}

createRoot(root).render(<App />);
