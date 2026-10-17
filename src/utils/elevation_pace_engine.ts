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

import type { ParsedGpxData, ParsedTrackPoint } from "./xml_gpx_parser";

/**
 * Represents a checkpoint defined by the user.
 */
export interface UserCheckpoint {
  id: string;
  name: string;
  distance_kilometers: number;
  // Time spent at this checkpoint. Every later ETA moves back by this amount.
  stop_minutes?: number;
  // Local cut-off in the form "YYYY-MM-DDTHH:MM". Empty or missing means no cut-off.
  cutoff_datetime_string?: string;
}

/**
 * How a checkpoint compares with its cut-off.
 */
export type CutoffStatus = "none" | "ok" | "tight" | "missed";

/**
 * Represents a checkpoint populated with calculated pace and elevation statistics.
 */
export interface CalculatedCheckpointDetails {
  id: string;
  name: string;
  distance_kilometers: number;
  elevation_meters: number;
  cumulative_gain_meters: number;
  cumulative_loss_meters: number;
  elapsed_time_minutes: number;
  stop_minutes: number;
  eta_time_string: string;
  cutoff_status: CutoffStatus;
  slack_minutes: number | null;
}

/**
 * The settings every calculation depends on, in metric units.
 */
export interface PlanSettings {
  base_pace_minutes_per_kilometer: number;
  ascent_penalty_minutes_per_hundred_meters: number;
  descent_time_minutes_per_hundred_meters: number;
  start_time_string: string;
  race_date_string: string;
}

// A checkpoint with less slack than this is flagged as tight
export const tight_cutoff_margin_minutes = 30;

/**
 * Formats a Date object into a readable time string.
 * If the time rolls over to a subsequent day relative to the start date,
 * it appends a day marker (e.g. "+1d" or "+2d") to make it clear to the runner.
 */
function format_timestamp_to_eta_string(
  start_time_date: Date,
  current_time_date: Date
): string {
  const current_hours = current_time_date.getHours().toString().padStart(2, "0");
  const current_minutes = current_time_date.getMinutes().toString().padStart(2, "0");

  // Calculate the difference in calendar days between start date and current date
  const start_date_midnight = new Date(start_time_date.getFullYear(), start_time_date.getMonth(), start_time_date.getDate());
  const current_date_midnight = new Date(current_time_date.getFullYear(), current_time_date.getMonth(), current_time_date.getDate());

  const milliseconds_difference = current_date_midnight.getTime() - start_date_midnight.getTime();
  const milliseconds_per_day = 1000 * 60 * 60 * 24;
  const calendar_days_difference = Math.round(milliseconds_difference / milliseconds_per_day);

  if (calendar_days_difference > 0) {
    return `${current_hours}:${current_minutes} (+${calendar_days_difference}d)`;
  }

  return `${current_hours}:${current_minutes}`;
}

/**
 * Reads a "HH:MM" start time. Blank or unreadable input falls back to 08:00,
 * so every calculation in the planner uses the same start time.
 */
function parse_start_time_parts(start_time_string: string): { hours: number; minutes: number } {
  const default_start_time = { hours: 8, minutes: 0 };
  const start_time_match = /^(\d{1,2}):(\d{2})$/.exec(start_time_string.trim());
  if (!start_time_match) {
    return default_start_time;
  }

  const hours = parseInt(start_time_match[1], 10);
  const minutes = parseInt(start_time_match[2], 10);
  if (hours > 23 || minutes > 59) {
    return default_start_time;
  }

  return { hours, minutes };
}

/**
 * Builds the local start moment from the race date and start time. A missing or unreadable
 * race date means today.
 */
export function build_run_start_date(settings: PlanSettings): Date {
  const race_date_match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(settings.race_date_string.trim());
  const today = new Date();
  const year = race_date_match ? parseInt(race_date_match[1], 10) : today.getFullYear();
  const month_index = race_date_match ? parseInt(race_date_match[2], 10) - 1 : today.getMonth();
  const day_of_month = race_date_match ? parseInt(race_date_match[3], 10) : today.getDate();

  const start_time_parts = parse_start_time_parts(settings.start_time_string);
  return new Date(year, month_index, day_of_month, start_time_parts.hours, start_time_parts.minutes, 0, 0);
}

/**
 * Reads a "YYYY-MM-DDTHH:MM" cut-off into a local Date. Returns null when it is blank or unreadable.
 */
export function parse_cutoff_datetime(cutoff_datetime_string: string | undefined): Date | null {
  if (!cutoff_datetime_string) {
    return null;
  }
  const cutoff_match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(cutoff_datetime_string.trim());
  if (!cutoff_match) {
    return null;
  }
  return new Date(
    parseInt(cutoff_match[1], 10),
    parseInt(cutoff_match[2], 10) - 1,
    parseInt(cutoff_match[3], 10),
    parseInt(cutoff_match[4], 10),
    parseInt(cutoff_match[5], 10),
    0,
    0
  );
}

/**
 * Traverses the track points array to find the closest point matching the target distance.
 */
export function find_closest_track_point(
  track_points: ParsedTrackPoint[],
  target_distance_meters: number
): ParsedTrackPoint {
  if (track_points.length === 0) {
    throw new Error("Cannot query empty track points array.");
  }

  // Iterate to find the first point where cumulative distance is greater than or equal to target
  for (let index = 0; index < track_points.length; index++) {
    if (track_points[index].cumulative_distance_meters >= target_distance_meters) {
      return track_points[index];
    }
  }

  // Fallback to returning the final track point if target distance exceeds route length
  return track_points[track_points.length - 1];
}

/**
 * Works out the elapsed minutes at a track point: flat pace, then the climb and descent allowances,
 * then any stops at checkpoints passed before it. The table, hover readout and SMS payload all use this.
 */
export function calculate_elapsed_minutes_at_point(
  track_point: ParsedTrackPoint,
  settings: PlanSettings,
  stop_minutes_before_point: number
): number {
  const flat_terrain_minutes = (track_point.cumulative_distance_meters / 1000) * settings.base_pace_minutes_per_kilometer;
  const ascent_delay_minutes = (track_point.cumulative_gain_meters / 100) * settings.ascent_penalty_minutes_per_hundred_meters;
  const descent_delay_minutes = (track_point.cumulative_loss_meters / 100) * settings.descent_time_minutes_per_hundred_meters;
  return flat_terrain_minutes + ascent_delay_minutes + descent_delay_minutes + stop_minutes_before_point;
}

/**
 * Converts elapsed minutes into the runner's clock time. Minutes are rounded first, so the ETA
 * and the elapsed time shown next to it always agree. A "(+Nd)" marker is added past midnight.
 */
export function calculate_arrival_eta_string(settings: PlanSettings, elapsed_minutes: number): string {
  const run_start_date_object = build_run_start_date(settings);
  const arrival_date_object = new Date(run_start_date_object.getTime() + Math.round(elapsed_minutes) * 60 * 1000);
  return format_timestamp_to_eta_string(run_start_date_object, arrival_date_object);
}

/**
 * Compares an arrival with a cut-off. Slack is minutes to spare, negative when the cut-off was missed.
 */
export function evaluate_cutoff(
  arrival_date_object: Date,
  cutoff_datetime_string: string | undefined
): { cutoff_status: CutoffStatus; slack_minutes: number | null } {
  const cutoff_date_object = parse_cutoff_datetime(cutoff_datetime_string);
  if (!cutoff_date_object) {
    return { cutoff_status: "none", slack_minutes: null };
  }

  const slack_minutes = Math.round((cutoff_date_object.getTime() - arrival_date_object.getTime()) / 60000);
  if (slack_minutes < 0) {
    return { cutoff_status: "missed", slack_minutes };
  }
  if (slack_minutes <= tight_cutoff_margin_minutes) {
    return { cutoff_status: "tight", slack_minutes };
  }
  return { cutoff_status: "ok", slack_minutes };
}

/**
 * Calculates safety estimations, arrival windows and cut-off slack for a list of checkpoints.
 * Stops are applied in distance order, so each checkpoint's ETA includes the stops before it.
 */
export function calculate_checkpoint_estimates(
  parsed_gpx_data: ParsedGpxData,
  user_checkpoints: UserCheckpoint[],
  settings: PlanSettings
): CalculatedCheckpointDetails[] {
  const sorted_checkpoints = [...user_checkpoints].sort(
    (first, second) => first.distance_kilometers - second.distance_kilometers
  );

  const run_start_date_object = build_run_start_date(settings);
  const calculated_details_list: CalculatedCheckpointDetails[] = [];
  let stop_minutes_before_checkpoint = 0;

  for (let index = 0; index < sorted_checkpoints.length; index++) {
    const checkpoint = sorted_checkpoints[index];
    const target_distance_meters = checkpoint.distance_kilometers * 1000;

    // Retrieve geographical parameters at this distance checkpoint
    const matching_point = find_closest_track_point(parsed_gpx_data.track_points, target_distance_meters);

    const elapsed_minutes_at_arrival = calculate_elapsed_minutes_at_point(
      matching_point,
      settings,
      stop_minutes_before_checkpoint
    );
    const arrival_date_object = new Date(
      run_start_date_object.getTime() + Math.round(elapsed_minutes_at_arrival) * 60 * 1000
    );
    const { cutoff_status, slack_minutes } = evaluate_cutoff(arrival_date_object, checkpoint.cutoff_datetime_string);

    const stop_minutes = Math.max(0, checkpoint.stop_minutes ?? 0);

    calculated_details_list.push({
      id: checkpoint.id,
      name: checkpoint.name,
      distance_kilometers: checkpoint.distance_kilometers,
      elevation_meters: Math.round(matching_point.elevation_meters),
      cumulative_gain_meters: Math.round(matching_point.cumulative_gain_meters),
      cumulative_loss_meters: Math.round(matching_point.cumulative_loss_meters),
      elapsed_time_minutes: Math.round(elapsed_minutes_at_arrival),
      stop_minutes,
      eta_time_string: calculate_arrival_eta_string(settings, elapsed_minutes_at_arrival),
      cutoff_status,
      slack_minutes,
    });

    // The stop happens after arrival, so it moves only the checkpoints that come later
    stop_minutes_before_checkpoint += stop_minutes;
  }

  return calculated_details_list;
}
