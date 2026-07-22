import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { HelmetProvider } from 'react-helmet-async'

const rootElement = document.getElementById("root")!;

// Clear any critical loading fallback content for smooth transition
if (rootElement.querySelector('.critical-loading')) {
  rootElement.innerHTML = '';
}

document.title = 'The VA Team Portal';

createRoot(rootElement).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
