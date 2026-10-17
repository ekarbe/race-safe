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

import type { Language } from "../i18n/messages";
import type { PlanSettings, UserCheckpoint } from "./elevation_pace_engine";
import { decode_track_from_storage, encode_track_for_storage, type ParsedGpxData } from "./xml_gpx_parser";
import type { UnitSystem } from "./units";

const parsed_track_storage_key = "race_safe_parsed_data";
const plan_state_storage_key = "race_safe_plan_state";
const language_storage_key = "race_safe_language";
const units_storage_key = "race_safe_units";

// Written by version 1 of the uploader. Nothing reads it, so it is removed when a track is saved.
const legacy_raw_gpx_storage_key = "race_safe_raw_gpx";

/**
 * The part of the plan that persists between visits: settings, contacts and checkpoints.
 * It is tied to one track, so a different upload never picks up an old plan.
 */
export interface SavedPlanState {
  track_name: string;
  total_distance_meters: number;
  settings: PlanSettings;
  emergency_contacts_text: string;
  checkpoints: UserCheckpoint[];
}

/**
 * Formats a date as the YYYY-MM-DD value that date inputs use.
 */
export function format_date_input_value(date: Date): string {
  const month_text = (date.getMonth() + 1).toString().padStart(2, "0");
  const day_text = date.getDate().toString().padStart(2, "0");
  return `${date.getFullYear()}-${month_text}-${day_text}`;
}

/**
 * The planner's starting values: the usual 6 min/km flat pace, Naismith's climb allowance, no descent allowance.
 */
export function create_default_plan_settings(): PlanSettings {
  return {
    base_pace_minutes_per_kilometer: 6.0,
    ascent_penalty_minutes_per_hundred_meters: 10.0,
    descent_time_minutes_per_hundred_meters: 0,
    start_time_string: "08:00",
    race_date_string: format_date_input_value(new Date()),
  };
}

/**
 * Reads a string from localStorage. Storage can be blocked or unavailable, so it never throws.
 */
function read_storage_string(storage_key: string): string | null {
  try {
    return localStorage.getItem(storage_key);
  } catch {
    return null;
  }
}

/**
 * Removes a key from localStorage, ignoring storage that is unavailable.
 */
function remove_storage_key(storage_key: string): void {
  try {
    localStorage.removeItem(storage_key);
  } catch {
    // Storage is unavailable, so there is nothing to remove
  }
}

/**
 * Loads the track saved by the uploader, or null when there is none or it cannot be read.
 */
export function load_saved_track(): ParsedGpxData | null {
  const stored_track_string = read_storage_string(parsed_track_storage_key);
  return stored_track_string ? decode_track_from_storage(stored_track_string) : null;
}

/**
 * Whether a track is saved. A cheap check that does not decode the track.
 */
export function has_saved_track(): boolean {
  return read_storage_string(parsed_track_storage_key) !== null;
}

/**
 * Saves a new track and forgets the plan that belonged to the previous one.
 * Throws the storage error when the track does not fit, after removing the partial value.
 */
export function save_track_for_planner(gpx_data: ParsedGpxData): void {
  remove_storage_key(parsed_track_storage_key);
  remove_storage_key(legacy_raw_gpx_storage_key);
  remove_storage_key(plan_state_storage_key);

  try {
    localStorage.setItem(parsed_track_storage_key, encode_track_for_storage(gpx_data));
  } catch (storage_error) {
    remove_storage_key(parsed_track_storage_key);
    throw storage_error;
  }
}

/**
 * Turns a stored number into a usable one, falling back when it is missing or not finite.
 */
function read_finite_number(value: unknown, fallback_value: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback_value;
}

/**
 * Keeps only checkpoints with the fields the planner needs.
 */
function sanitize_checkpoints(value: unknown): UserCheckpoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): UserCheckpoint[] => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as UserCheckpoint).id !== "string" ||
      typeof (item as UserCheckpoint).name !== "string" ||
      !Number.isFinite((item as UserCheckpoint).distance_kilometers)
    ) {
      return [];
    }
    const checkpoint = item as UserCheckpoint;
    return [
      {
        id: checkpoint.id,
        name: checkpoint.name,
        distance_kilometers: checkpoint.distance_kilometers,
        stop_minutes: Math.max(0, read_finite_number(checkpoint.stop_minutes, 0)),
        cutoff_datetime_string: typeof checkpoint.cutoff_datetime_string === "string" ? checkpoint.cutoff_datetime_string : "",
      },
    ];
  });
}

/**
 * Loads the saved plan for this track. Returns null when there is none, or when it belongs to another track.
 */
export function load_plan_state(gpx_data: ParsedGpxData): SavedPlanState | null {
  const stored_plan_string = read_storage_string(plan_state_storage_key);
  if (!stored_plan_string) {
    return null;
  }

  try {
    const stored_plan = JSON.parse(stored_plan_string) as Partial<SavedPlanState>;
    const belongs_to_this_track =
      stored_plan.track_name === gpx_data.track_name &&
      Math.abs(read_finite_number(stored_plan.total_distance_meters, -1) - gpx_data.total_distance_meters) < 1;
    if (!belongs_to_this_track || typeof stored_plan.settings !== "object" || stored_plan.settings === null) {
      return null;
    }

    const defaults = create_default_plan_settings();
    const stored_settings = stored_plan.settings as Partial<PlanSettings>;
    return {
      track_name: gpx_data.track_name,
      total_distance_meters: gpx_data.total_distance_meters,
      settings: {
        base_pace_minutes_per_kilometer: read_finite_number(stored_settings.base_pace_minutes_per_kilometer, defaults.base_pace_minutes_per_kilometer),
        ascent_penalty_minutes_per_hundred_meters: read_finite_number(stored_settings.ascent_penalty_minutes_per_hundred_meters, defaults.ascent_penalty_minutes_per_hundred_meters),
        descent_time_minutes_per_hundred_meters: read_finite_number(stored_settings.descent_time_minutes_per_hundred_meters, defaults.descent_time_minutes_per_hundred_meters),
        start_time_string: typeof stored_settings.start_time_string === "string" ? stored_settings.start_time_string : defaults.start_time_string,
        race_date_string: typeof stored_settings.race_date_string === "string" ? stored_settings.race_date_string : defaults.race_date_string,
      },
      emergency_contacts_text: typeof stored_plan.emergency_contacts_text === "string" ? stored_plan.emergency_contacts_text : "",
      checkpoints: sanitize_checkpoints(stored_plan.checkpoints),
    };
  } catch {
    return null;
  }
}

/**
 * Saves the plan. Returns false when storage is full or unavailable, so the planner can keep working without it.
 */
export function save_plan_state(plan_state: SavedPlanState): boolean {
  try {
    localStorage.setItem(plan_state_storage_key, JSON.stringify(plan_state));
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes the saved track and plan. Language and theme choices are kept.
 */
export function clear_saved_data(): void {
  remove_storage_key(parsed_track_storage_key);
  remove_storage_key(plan_state_storage_key);
  remove_storage_key(legacy_raw_gpx_storage_key);
}

/**
 * Reads the saved language, or null when the user has not chosen one.
 */
export function load_language_preference(): Language | null {
  const stored_language = read_storage_string(language_storage_key);
  return stored_language === "en" || stored_language === "de" ? stored_language : null;
}

/**
 * Saves the language choice.
 */
export function save_language_preference(language: Language): void {
  try {
    localStorage.setItem(language_storage_key, language);
  } catch {
    // Storage is unavailable, so the choice lasts only for this page view
  }
}

/**
 * Reads the saved unit system, or null when the user has not chosen one.
 */
export function load_units_preference(): UnitSystem | null {
  const stored_units = read_storage_string(units_storage_key);
  return stored_units === "metric" || stored_units === "imperial" ? stored_units : null;
}

/**
 * Saves the unit choice.
 */
export function save_units_preference(units: UnitSystem): void {
  try {
    localStorage.setItem(units_storage_key, units);
  } catch {
    // Storage is unavailable, so the choice lasts only for this page view
  }
}
