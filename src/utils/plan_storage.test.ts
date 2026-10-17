// @vitest-environment jsdom
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

import { beforeEach, describe, expect, it } from "vitest";
import {
  clear_saved_data,
  create_default_plan_settings,
  has_saved_track,
  load_language_preference,
  load_plan_state,
  load_saved_track,
  load_units_preference,
  save_language_preference,
  save_plan_state,
  save_track_for_planner,
  save_units_preference,
  type SavedPlanState,
} from "./plan_storage";
import type { ParsedGpxData } from "./xml_gpx_parser";

const sample_track: ParsedGpxData = {
  track_name: "Sample Trail",
  total_distance_meters: 12000,
  total_elevation_gain_meters: 400,
  total_elevation_loss_meters: 380,
  track_points: [
    { latitude: 47, longitude: 11, elevation_meters: 1000, cumulative_distance_meters: 0, cumulative_gain_meters: 0, cumulative_loss_meters: 0 },
    { latitude: 47.1, longitude: 11, elevation_meters: 1400, cumulative_distance_meters: 12000, cumulative_gain_meters: 400, cumulative_loss_meters: 0 },
  ],
};

const sample_plan: SavedPlanState = {
  track_name: "Sample Trail",
  total_distance_meters: 12000,
  settings: { ...create_default_plan_settings(), start_time_string: "06:15" },
  emergency_contacts_text: "Crew: +15550000",
  checkpoints: [
    { id: "start-point-id", name: "Start", distance_kilometers: 0, stop_minutes: 0, cutoff_datetime_string: "" },
    { id: "aid-1", name: "Aid 1", distance_kilometers: 6, stop_minutes: 10, cutoff_datetime_string: "2026-10-17T10:00" },
  ],
};

describe("saved track", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a track and reports that one is saved", () => {
    expect(has_saved_track()).toBe(false);
    save_track_for_planner(sample_track);
    expect(has_saved_track()).toBe(true);
    expect(load_saved_track()?.track_name).toBe("Sample Trail");
  });

  it("removes the legacy raw copy and any plan when a new track is saved", () => {
    localStorage.setItem("race_safe_raw_gpx", "<gpx/>");
    save_plan_state(sample_plan);
    save_track_for_planner(sample_track);
    expect(localStorage.getItem("race_safe_raw_gpx")).toBeNull();
    expect(localStorage.getItem("race_safe_plan_state")).toBeNull();
  });

  it("clears the track and plan but keeps language and units", () => {
    save_track_for_planner(sample_track);
    save_plan_state(sample_plan);
    save_language_preference("de");
    save_units_preference("imperial");
    clear_saved_data();
    expect(has_saved_track()).toBe(false);
    expect(localStorage.getItem("race_safe_plan_state")).toBeNull();
    expect(load_language_preference()).toBe("de");
    expect(load_units_preference()).toBe("imperial");
  });
});

describe("saved plan", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restores settings, contacts and checkpoints for the same track", () => {
    save_plan_state(sample_plan);
    const restored = load_plan_state(sample_track);
    expect(restored?.settings.start_time_string).toBe("06:15");
    expect(restored?.emergency_contacts_text).toBe("Crew: +15550000");
    expect(restored?.checkpoints[1].stop_minutes).toBe(10);
  });

  it("ignores a plan that belongs to a different track", () => {
    save_plan_state(sample_plan);
    expect(load_plan_state({ ...sample_track, track_name: "Another Trail" })).toBeNull();
    expect(load_plan_state({ ...sample_track, total_distance_meters: 9000 })).toBeNull();
  });

  it("falls back to defaults for missing or wrong fields", () => {
    localStorage.setItem(
      "race_safe_plan_state",
      JSON.stringify({ track_name: "Sample Trail", total_distance_meters: 12000, settings: { base_pace_minutes_per_kilometer: "fast" }, checkpoints: [{ id: 1 }] })
    );
    const restored = load_plan_state(sample_track);
    expect(restored?.settings.base_pace_minutes_per_kilometer).toBe(6);
    expect(restored?.settings.ascent_penalty_minutes_per_hundred_meters).toBe(10);
    expect(restored?.checkpoints).toHaveLength(0);
  });

  it("returns null for corrupt storage", () => {
    localStorage.setItem("race_safe_plan_state", "{not json");
    expect(load_plan_state(sample_track)).toBeNull();
  });
});

describe("preferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null until a language or unit system is chosen", () => {
    expect(load_language_preference()).toBeNull();
    expect(load_units_preference()).toBeNull();
  });

  it("ignores stored values it does not recognise", () => {
    localStorage.setItem("race_safe_language", "fr");
    localStorage.setItem("race_safe_units", "furlongs");
    expect(load_language_preference()).toBeNull();
    expect(load_units_preference()).toBeNull();
  });
});
