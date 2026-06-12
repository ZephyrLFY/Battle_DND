import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { LangProvider } from './i18n.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
);
