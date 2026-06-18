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

// We define a unique cache name for this version of the application
const cache_name_string = "racesafe-cache-v1";

// List of static root assets to precache immediately during service worker installation
const assets_to_precache_array = [
  "/race-safe/",
  "/race-safe/index.html",
  "/race-safe/favicon.svg"
];

// Extend the service worker scope type helper to avoid typescript warnings
const service_worker_scope = (self as unknown) as ServiceWorkerGlobalScope;

// The install event handler: caches the initial layout shell
service_worker_scope.addEventListener("install", (install_event) => {
  // Wait until the caching promise completes before finishing installation
  install_event.waitUntil(
    caches.open(cache_name_string).then((cache_object) => {
      console.log("RaceSafe service worker: Caching shell assets...");
      return cache_object.addAll(assets_to_precache_array);
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

  // Only intercept HTTP/HTTPS protocols (ignores chrome extensions, data URLs, etc.)
  if (
    request_url_object.protocol !== "http:" &&
    request_url_object.protocol !== "https:"
  ) {
    return;
  }

  fetch_event.respondWith(
    caches.match(fetch_event.request).then((cached_response_object) => {
      // Create a network fetch promise that updates the cache in the background
      const fetch_promise = fetch(fetch_event.request)
        .then((network_response_object) => {
          // Verify we received a valid response before caching it
          if (
            network_response_object &&
            network_response_object.status === 200
          ) {
            // Clone the response because the stream can only be read once
            const cloned_response_object = network_response_object.clone();
            
            caches.open(cache_name_string).then((cache_object) => {
              cache_object.put(fetch_event.request, cloned_response_object);
            });
          }
          return network_response_object;
        })
        .catch(() => {
          // If network fails, do nothing. If there is a cached version, it will be used.
        });

      // Return the cached response immediately if it exists, otherwise wait for the network
      return cached_response_object || fetch_promise as Promise<Response>;
    })
  );
});
