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

import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { GpxFormatError, parse_gpx_xml_string } from "../utils/xml_gpx_parser";
import { clear_saved_data, has_saved_track, save_track_for_planner } from "../utils/plan_storage";
import { useSettings } from "../i18n/settings_context";
import type { MessageKey } from "../i18n/messages";
import SettingsControls from "./SettingsControls";

/**
 * Returns true when the browser refused to store the track because its storage is full.
 */
function is_storage_quota_error(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}

/**
 * The MainDashboard component renders the welcome screen and handle file uploads.
 */
export default function MainDashboard() {
  const navigate = useNavigate();
  const { t } = useSettings();

  // Track dragging state to style the drag-and-drop zone dynamically
  const [is_dragging, set_is_dragging] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [status_message, set_status_message] = useState<string | null>(null);
  const [track_is_saved, set_track_is_saved] = useState<boolean>(has_saved_track);

  // Reference to the hidden file input element to trigger clicks manually
  const file_input_reference = useRef<HTMLInputElement>(null);

  // A file dropped outside the drop zone would otherwise make the browser open it and leave the app
  useEffect(() => {
    const prevent_default_file_drop = (event: DragEvent) => {
      event.preventDefault();
    };
    window.addEventListener("dragover", prevent_default_file_drop);
    window.addEventListener("drop", prevent_default_file_drop);
    return () => {
      window.removeEventListener("dragover", prevent_default_file_drop);
      window.removeEventListener("drop", prevent_default_file_drop);
    };
  }, []);

  /**
   * Maps a parsing failure to a message in the current language.
   */
  const describe_upload_error = (error: unknown): string => {
    if (is_storage_quota_error(error)) {
      return t("dash_error_too_large");
    }
    if (error instanceof GpxFormatError) {
      const message_key_by_reason: Record<GpxFormatError["reason"], MessageKey> = {
        invalid_xml: "dash_error_invalid_xml",
        no_points: "dash_error_no_points",
        no_coordinates: "dash_error_no_coordinates",
      };
      return t(message_key_by_reason[error.reason]);
    }
    return t("dash_error_parse_default");
  };

  /**
   * Processes a single GPX file by reading its contents, parsing the XML,
   * saving to local storage for offline retrieval, and navigating to the planner.
   */
  const process_gpx_file = (selected_file: File) => {
    set_error_message(null);
    set_status_message(null);

    // Make sure the file uploaded ends with a .gpx extension
    if (!selected_file.name.toLowerCase().endsWith(".gpx")) {
      set_error_message(t("dash_error_extension"));
      return;
    }

    const file_reader = new FileReader();

    // Set up the event handler for when the file has been successfully read
    file_reader.onload = (event) => {
      const gpx_content_string = typeof event.target?.result === "string" ? event.target.result : "";

      try {
        // Parse the GPX XML string into our structured JSON schema, then save it for the planner
        const parsed_gpx_data = parse_gpx_xml_string(gpx_content_string);
        save_track_for_planner(parsed_gpx_data);

        // Navigate the runner to the plan generator view
        navigate("/planner");
      } catch (error) {
        // Parsing and storage errors are shown in the current language
        set_error_message(describe_upload_error(error));
        set_track_is_saved(has_saved_track());
      }
    };

    file_reader.onerror = () => {
      set_error_message(t("dash_error_read"));
    };

    // Begin reading the file as text
    file_reader.readAsText(selected_file);
  };

  /**
   * Triggers when files are dragged over the drop zone.
   */
  const handle_drag_over = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    set_is_dragging(true);
  };

  /**
   * Triggers when the dragged files leave the drop zone area.
   */
  const handle_drag_leave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    set_is_dragging(false);
  };

  /**
   * Triggers when files are dropped into the drag-and-drop box.
   */
  const handle_drop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    set_is_dragging(false);

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const dropped_file = event.dataTransfer.files[0];
      process_gpx_file(dropped_file);
    }
  };

  /**
   * Triggers when the user selects a file using the native file browser.
   */
  const handle_file_select = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const selected_file = event.target.files[0];
      process_gpx_file(selected_file);
    }
    // Clear the input so selecting the same file again still fires a change event
    event.target.value = "";
  };

  /**
   * Simulates a click on the hidden file input element when the user clicks the drop zone.
   */
  const handle_zone_click = () => {
    file_input_reference.current?.click();
  };

  /**
   * Lets keyboard users open the file picker with Enter or Space.
   */
  const handle_zone_key_down = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handle_zone_click();
    }
  };

  /**
   * Removes the saved track, checkpoints and contacts after the user confirms.
   */
  const handle_clear_saved_data = () => {
    if (!window.confirm(t("clear_confirm"))) {
      return;
    }
    clear_saved_data();
    set_track_is_saved(false);
    set_error_message(null);
    set_status_message(t("clear_done"));
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-12">
      {/* Language and unit choices */}
      <div className="self-end mb-6">
        <SettingsControls />
      </div>

      {/* Top Welcome Title & Subtitle */}
      <div className="text-center max-w-2xl mb-12">
        <div className="flex justify-center mb-6">
          {/* A beautiful minimalist shield icon */}
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-zinc-950 shadow-lg">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-zinc-900 dark:text-white">
          RaceSafe
        </h1>
        <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 font-light leading-relaxed">
          {t("dash_subtitle")}
        </p>
      </div>

      {/* Main Glassmorphic Upload Container */}
      <div className="w-full max-w-lg glass-panel p-8 rounded-3xl mb-12">
        <h2 className="text-xl font-semibold mb-6 text-center text-zinc-900 dark:text-white">
          {t("dash_upload_heading")}
        </h2>

        {/* Hidden native input for files, opened from the drop zone */}
        <input
          type="file"
          ref={file_input_reference}
          onChange={handle_file_select}
          accept=".gpx"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />

        {/* Drag & Drop Visual Area */}
        <div
          role="button"
          tabIndex={0}
          aria-label={t("dash_drop_aria")}
          onDragOver={handle_drag_over}
          onDragLeave={handle_drag_leave}
          onDrop={handle_drop}
          onClick={handle_zone_click}
          onKeyDown={handle_zone_key_down}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[200px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-white ${
            is_dragging
              ? "border-zinc-900 dark:border-white bg-zinc-100/50 dark:bg-zinc-800/30"
              : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-500"
          }`}
        >
          <svg
            className="w-12 h-12 text-zinc-400 dark:text-zinc-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span className="text-zinc-700 dark:text-zinc-300 font-medium mb-1">
            {t("dash_drop_text")}
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("dash_drop_hint")}
          </span>
        </div>

        {/* Error Message Box */}
        {error_message && (
          <div
            role="alert"
            className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-sm text-center"
          >
            {error_message}
          </div>
        )}

        {/* Status message after clearing the saved data */}
        {status_message && !error_message && (
          <div role="status" className="mt-6 text-sm text-center text-zinc-600 dark:text-zinc-400">
            {status_message}
          </div>
        )}

        {/* Removes the saved track and plan from this browser */}
        {track_is_saved && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handle_clear_saved_data}
              className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              {t("clear_button")}
            </button>
          </div>
        )}
      </div>

      {/* Feature Grid showing benefits */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        <div className="glass-panel p-6 rounded-2xl text-center">
          <div className="text-2xl mb-3" aria-hidden="true">🏔️</div>
          <h3 className="font-semibold mb-2 text-zinc-900 dark:text-white">{t("dash_feature_elevation_title")}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("dash_feature_elevation_body")}
          </p>
        </div>
        <div className="glass-panel p-6 rounded-2xl text-center">
          <div className="text-2xl mb-3" aria-hidden="true">📶</div>
          <h3 className="font-semibold mb-2 text-zinc-900 dark:text-white">{t("dash_feature_offline_title")}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("dash_feature_offline_body")}
          </p>
        </div>
        <div className="glass-panel p-6 rounded-2xl text-center">
          <div className="text-2xl mb-3" aria-hidden="true">💬</div>
          <h3 className="font-semibold mb-2 text-zinc-900 dark:text-white">{t("dash_feature_copy_title")}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("dash_feature_copy_body")}
          </p>
        </div>
      </div>
    </div>
  );
}
