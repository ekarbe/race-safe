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

const theme_storage_key_string = "race_safe_dark_theme";

/**
 * Returns the saved theme choice, or the operating system preference when the user has not chosen one yet.
 * localStorage can throw in private windows or with blocked site data, so the read is guarded.
 */
export function get_initial_theme_preference(): boolean {
  try {
    const saved_theme_string = localStorage.getItem(theme_storage_key_string);
    if (saved_theme_string !== null) {
      return saved_theme_string === "true";
    }
  } catch {
    // Storage is unavailable, so fall back to the system preference below
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Saves the theme choice so every page uses the same theme on the next visit.
 */
export function save_theme_preference(is_dark_mode: boolean): void {
  try {
    localStorage.setItem(theme_storage_key_string, is_dark_mode.toString());
  } catch {
    // Storage is unavailable, so the choice only lasts for this page view
  }
}

/**
 * Applies the theme to the document root. The "dark" class drives both the custom
 * glass-panel rules in index.css and the Tailwind dark: utilities.
 */
export function apply_theme_to_document(is_dark_mode: boolean): void {
  document.documentElement.classList.toggle("dark", is_dark_mode);
}
