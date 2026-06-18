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
}

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
  eta_time_string: string;
}

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
 * Calculates safety estimations and arrival windows for a list of checkpoints.
 */
export function calculate_checkpoint_estimates(
  parsed_gpx_data: ParsedGpxData,
  user_checkpoints: UserCheckpoint[],
  base_pace_minutes_per_kilometer: number,
  ascent_penalty_minutes_per_hundred_meters: number,
  start_time_string: string
): CalculatedCheckpointDetails[] {
  const sorted_checkpoints = [...user_checkpoints].sort(
    (first, second) => first.distance_kilometers - second.distance_kilometers
  );

  // Parse start time "HH:MM" into a Date object representing today
  const current_date = new Date();
  const start_time_parts = start_time_string.split(":");
  const start_hours = start_time_parts[0] ? parseInt(start_time_parts[0], 10) : 8;
  const start_minutes = start_time_parts[1] ? parseInt(start_time_parts[1], 10) : 0;

  const run_start_date_object = new Date(
    current_date.getFullYear(),
    current_date.getMonth(),
    current_date.getDate(),
    start_hours,
    start_minutes,
    0,
    0
  );

  const calculated_details_list: CalculatedCheckpointDetails[] = [];

  for (let index = 0; index < sorted_checkpoints.length; index++) {
    const checkpoint = sorted_checkpoints[index];
    const target_distance_meters = checkpoint.distance_kilometers * 1000;

    // Retrieve geographical parameters at this distance checkpoint
    const matching_point = find_closest_track_point(parsed_gpx_data.track_points, target_distance_meters);

    // Calculate duration details
    const flat_terrain_duration_minutes =
      (matching_point.cumulative_distance_meters / 1000) * base_pace_minutes_per_kilometer;

    const elevation_gain_hundreds_of_meters = matching_point.cumulative_gain_meters / 100;
    const elevation_delay_duration_minutes =
      elevation_gain_hundreds_of_meters * ascent_penalty_minutes_per_hundred_meters;

    const total_elapsed_duration_minutes = flat_terrain_duration_minutes + elevation_delay_duration_minutes;

    // Calculate the absolute arrival time date object
    const arrival_date_object = new Date(
      run_start_date_object.getTime() + total_elapsed_duration_minutes * 60 * 1000
    );

    const eta_time_string = format_timestamp_to_eta_string(run_start_date_object, arrival_date_object);

    calculated_details_list.push({
      id: checkpoint.id,
      name: checkpoint.name,
      distance_kilometers: checkpoint.distance_kilometers,
      elevation_meters: Math.round(matching_point.elevation_meters),
      cumulative_gain_meters: Math.round(matching_point.cumulative_gain_meters),
      cumulative_loss_meters: Math.round(matching_point.cumulative_loss_meters),
      elapsed_time_minutes: Math.round(total_elapsed_duration_minutes),
      eta_time_string,
    });
  }

  return calculated_details_list;
}
