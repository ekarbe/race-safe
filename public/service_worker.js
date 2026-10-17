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

// This file is plain JavaScript served as-is from public/. It is not compiled by
// TypeScript or Vite, so it must not contain type annotations or casts.

// Bump this version whenever the precache list or caching strategy changes.
// Old caches are removed during activation.
const cache_name_string = "racesafe-cache-v2";

// List of static root assets to precache immediately during service worker installation
const assets_to_precache_array = [
  "/race-safe/",
  "/race-safe/index.html",
  "/race-safe/favicon.svg"
];

// The service worker global scope
const service_worker_scope = self;

// The hashed JavaScript and CSS files change on every build, so they are read from index.html
// at install time instead of being listed by hand.
async function find_build_asset_urls() {
  try {
    const shell_response = await fetch("/race-safe/index.html", { cache: "no-store" });
    const shell_html_string = await shell_response.text();
    return Array.from(
      shell_html_string.matchAll(/(?:src|href)="(\/race-safe\/assets\/[^"]+)"/g),
      (match) => match[1]
    );
  } catch (shell_error) {
    console.warn("RaceSafe service worker: Could not read index.html for build assets", shell_error);
    return [];
  }
}

// The install event handler: caches the initial layout shell and the build assets it loads
service_worker_scope.addEventListener("install", (install_event) => {
  install_event.waitUntil(
    caches.open(cache_name_string).then(async (cache_object) => {
      console.log("RaceSafe service worker: Caching shell assets...");
      const asset_urls_array = assets_to_precache_array.concat(await find_build_asset_urls());
      // Each URL is cached on its own, so one missing asset does not abort the whole install
      return Promise.all(
        asset_urls_array.map((asset_url) =>
          cache_object.add(asset_url).catch((precache_error) => {
            console.warn("RaceSafe service worker: Could not precache " + asset_url, precache_error);
          })
        )
      );
    })
  );

  // Force the waiting service worker to become the active service worker immediately
  service_worker_scope.skipWaiting();
});

// The activate event handler: cleans up obsolete caches from previous builds
service_worker_scope.addEventListener("activate", (activate_event) => {
  activate_event.waitUntil(
    caches.keys().then((cache_keys_array) => {
      return Promise.all(
        cache_keys_array.map((key) => {
          if (key !== cache_name_string) {
            console.log("RaceSafe service worker: Removing old cache: ", key);
            return caches.delete(key);
          }
        })
      );
    })
  );

  // Claim control of all open clients immediately
  service_worker_scope.clients.claim();
});

// The fetch event handler: implements the Stale-While-Revalidate caching pattern
service_worker_scope.addEventListener("fetch", (fetch_event) => {
  const request_url_object = new URL(fetch_event.request.url);

  // Only intercept GET requests over HTTP/HTTPS (ignores chrome extensions, data URLs, POSTs, etc.)
  if (
    fetch_event.request.method !== "GET" ||
    (request_url_object.protocol !== "http:" && request_url_object.protocol !== "https:")
  ) {
    return;
  }

  fetch_event.respondWith(
    // ignoreVary: the cached copy of a same-origin asset can carry "Vary: Origin" from the server,
    // and a crossorigin module request sends an Origin header that the precached copy never had
    caches.match(fetch_event.request, { ignoreVary: true }).then((cached_response_object) => {
      // Create a network fetch promise that updates the cache in the background
      const fetch_promise = fetch(fetch_event.request)
        .then((network_response_object) => {
          // Only cache complete, successful responses; opaque (cross-origin no-cors) responses are skipped
          if (network_response_object && network_response_object.status === 200) {
            // Clone the response because the stream can only be read once
            const cloned_response_object = network_response_object.clone();

            caches.open(cache_name_string).then((cache_object) => {
              cache_object.put(fetch_event.request, cloned_response_object);
            });
          }
          return network_response_object;
        })
        .catch(() => {
          // If the network fails, do nothing. A cached version is used below if one exists.
          return undefined;
        });

      // Return the cached response immediately if it exists, otherwise wait for the network
      return cached_response_object || fetch_promise;
    })
  );
});
