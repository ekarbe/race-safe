/*  RaceSafe - Offline-accessible trail & ultra-run safety planner with GPX analysis & emergency SMS generator
    Copyright (C) 2026  Eike Christian Karbe

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>. */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { apply_theme_to_document, get_initial_theme_preference } from './utils/theme_preference';

// Apply the saved or system theme before the first render, so every page starts in the right theme
apply_theme_to_document(get_initial_theme_preference());

// Find the target mount node in index.html
const target_root_element = document.getElementById('root');

if (target_root_element) {
  createRoot(target_root_element).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// Register the offline Service Worker if supported by the browser engine.
// Production only: in development the cache would serve stale modules during hot reload.
// This executes during window load to avoid blocking critical initial page render assets.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const service_worker_url = `${import.meta.env.BASE_URL}service_worker.js`;

    navigator.serviceWorker.register(service_worker_url)
      .then((registration_object) => {
        // Service worker registered successfully
        console.log('RaceSafe offline cache active: ', registration_object.scope);
      })
      .catch((registration_error) => {
        // Failed to install the service worker
        console.error('RaceSafe offline registration failed: ', registration_error);
      });
  });
}
