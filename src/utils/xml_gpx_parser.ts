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

/**
 * Represents a single geographical point parsed from the GPX file.
 * All variables here use full descriptive names to adhere to our style guidelines.
 */
export interface ParsedTrackPoint {
  latitude: number;
  longitude: number;
  elevation_meters: number;
  cumulative_distance_meters: number;
  cumulative_gain_meters: number;
  cumulative_loss_meters: number;
}

/**
 * Represents the summary and detail structure of the parsed GPX track.
 */
export interface ParsedGpxData {
  track_name: string;
  total_distance_meters: number;
  total_elevation_gain_meters: number;
  total_elevation_loss_meters: number;
  track_points: ParsedTrackPoint[];
}

/**
 * Altitude must move this far from the last counted level before it adds to gain or loss.
 * Smaller wobbles are GPS noise; counting them inflates the climb and every ETA with it.
 */
export const elevation_change_threshold_meters = 3;

// Version of the compact storage format. Versions before it stored the full object.
const stored_track_format_version = 2;

/**
 * Compact form of one track point for localStorage:
 * [latitude, longitude, elevation, cumulative distance, cumulative gain, cumulative loss].
 */
type StoredTrackPointTuple = [number, number, number, number, number, number];

/**
 * The payload written to localStorage. Values are rounded to the precision the planner can use
 * (about 0.1 m), which keeps long recordings well inside the browser storage limit.
 */
interface StoredTrackPayload {
  format_version: number;
  track_name: string;
  total_distance_meters: number;
  total_elevation_gain_meters: number;
  total_elevation_loss_meters: number;
  points: StoredTrackPointTuple[];
}

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 */
function calculate_haversine_distance_meters(
  start_latitude: number,
  start_longitude: number,
  end_latitude: number,
  end_longitude: number
): number {
  const earth_radius_meters = 6371000; // Average radius of the earth in meters

  // Convert degrees to radians for mathematical calculations
  const start_latitude_radians = (start_latitude * Math.PI) / 180;
  const end_latitude_radians = (end_latitude * Math.PI) / 180;

  const latitude_difference_radians = ((end_latitude - start_latitude) * Math.PI) / 180;
  const longitude_difference_radians = ((end_longitude - start_longitude) * Math.PI) / 180;

  // The Haversine formula core calculations
  const haversine_a =
    Math.sin(latitude_difference_radians / 2) * Math.sin(latitude_difference_radians / 2) +
    Math.cos(start_latitude_radians) *
      Math.cos(end_latitude_radians) *
      Math.sin(longitude_difference_radians / 2) *
      Math.sin(longitude_difference_radians / 2);

  const haversine_c = 2 * Math.atan2(Math.sqrt(haversine_a), Math.sqrt(1 - haversine_a));

  return earth_radius_meters * haversine_c;
}

/**
 * Reads the <ele> child of a point. Returns null when the tag is missing or not a number.
 */
function read_elevation_meters(point_node: Element): number | null {
  const elevation_node = point_node.querySelector("ele");
  if (!elevation_node || !elevation_node.textContent) {
    return null;
  }
  const elevation_meters = parseFloat(elevation_node.textContent);
  return Number.isNaN(elevation_meters) ? null : elevation_meters;
}

/**
 * Why a GPX file could not be read. The interface turns the reason into a translated message.
 */
export type GpxFormatErrorReason = "invalid_xml" | "no_points" | "no_coordinates";

export class GpxFormatError extends Error {
  readonly reason: GpxFormatErrorReason;

  constructor(reason: GpxFormatErrorReason) {
    super(reason);
    this.name = "GpxFormatError";
    this.reason = reason;
  }
}

/**
 * Parses a raw GPX XML string into a structured JSON dataset.
 * Uses the browser's built-in DOMParser to avoid external parsing library dependencies.
 */
export function parse_gpx_xml_string(raw_gpx_string: string): ParsedGpxData {
  // Let's create a new DOMParser instance to parse the XML string
  const document_object_model_parser = new DOMParser();
  const xml_document = document_object_model_parser.parseFromString(raw_gpx_string, "application/xml");

  // Check if there was a parsing error reported by the browser's parser
  const parser_error_node = xml_document.querySelector("parsererror");
  if (parser_error_node) {
    throw new GpxFormatError("invalid_xml");
  }

  // Extract the name of the track, or use a default if it isn't specified
  const name_element = xml_document.querySelector("trk > name") || xml_document.querySelector("name");
  const track_name = name_element && name_element.textContent
    ? name_element.textContent.trim()
    : "Unnamed Trail Run";

  // Prefer recorded tracks. Planned routes (rte/rtept) are used when the file has no track points.
  let track_point_nodes = xml_document.querySelectorAll("trkpt");
  if (track_point_nodes.length === 0) {
    track_point_nodes = xml_document.querySelectorAll("rtept");
  }
  if (track_point_nodes.length === 0) {
    throw new GpxFormatError("no_points");
  }

  const track_points: ParsedTrackPoint[] = [];

  let total_distance_meters = 0;
  let total_elevation_gain_meters = 0;
  let total_elevation_loss_meters = 0;

  // The last elevation read from the file, and the points that appeared before the first one
  let last_known_elevation_meters: number | null = null;
  const indices_waiting_for_elevation: number[] = [];

  // The level that gain and loss were last counted from. It only moves when the change passes the threshold.
  let elevation_reference_meters: number | null = null;

  // Iterate over each track point node and extract its data
  for (let index = 0; index < track_point_nodes.length; index++) {
    const current_point_node = track_point_nodes[index];

    // Read the latitude and longitude attributes from the node
    const latitude_attribute = current_point_node.getAttribute("lat");
    const longitude_attribute = current_point_node.getAttribute("lon");

    if (!latitude_attribute || !longitude_attribute) {
      // Skip points that don't have coordinate attributes
      continue;
    }

    const latitude = parseFloat(latitude_attribute);
    const longitude = parseFloat(longitude_attribute);

    // Skip points whose coordinates are not numbers, so one bad value cannot turn every distance into NaN
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      continue;
    }

    const elevation_from_file_meters = read_elevation_meters(current_point_node);

    let elevation_meters: number;
    if (elevation_from_file_meters !== null) {
      elevation_meters = elevation_from_file_meters;
      if (last_known_elevation_meters === null) {
        // Points before the first real elevation take its value, so they do not count as a climb from 0 m
        for (const waiting_index of indices_waiting_for_elevation) {
          track_points[waiting_index].elevation_meters = elevation_from_file_meters;
        }
        indices_waiting_for_elevation.length = 0;
        elevation_reference_meters = elevation_from_file_meters;
      }
      last_known_elevation_meters = elevation_from_file_meters;
    } else if (last_known_elevation_meters !== null) {
      // If elevation is missing, inherit from the previous point to prevent calculation gaps
      elevation_meters = last_known_elevation_meters;
    } else {
      // No elevation yet: a placeholder that is filled in once the first real value is read
      elevation_meters = 0;
      indices_waiting_for_elevation.push(track_points.length);
    }

    // Gain and loss count only once the altitude has moved past the threshold since the last counted level
    if (elevation_reference_meters !== null) {
      const elevation_change_meters = elevation_meters - elevation_reference_meters;
      if (Math.abs(elevation_change_meters) >= elevation_change_threshold_meters) {
        if (elevation_change_meters > 0) {
          total_elevation_gain_meters += elevation_change_meters;
        } else {
          total_elevation_loss_meters += Math.abs(elevation_change_meters);
        }
        elevation_reference_meters = elevation_meters;
      }
    }

    let cumulative_distance_meters = 0;

    if (track_points.length > 0) {
      const previous_point = track_points[track_points.length - 1];

      // Calculate the distance from the previous point using our Haversine helper
      const distance_from_previous_meters = calculate_haversine_distance_meters(
        previous_point.latitude,
        previous_point.longitude,
        latitude,
        longitude
      );

      // Accumulate the overall distance
      total_distance_meters += distance_from_previous_meters;
      cumulative_distance_meters = total_distance_meters;
    }

    // Append the newly parsed and calculated track point to our points list
    track_points.push({
      latitude,
      longitude,
      elevation_meters,
      cumulative_distance_meters,
      cumulative_gain_meters: total_elevation_gain_meters,
      cumulative_loss_meters: total_elevation_loss_meters,
    });
  }

  if (track_points.length === 0) {
    throw new GpxFormatError("no_coordinates");
  }

  return {
    track_name,
    total_distance_meters,
    total_elevation_gain_meters,
    total_elevation_loss_meters,
    track_points,
  };
}

/**
 * Rounds a value to a fixed number of decimal places.
 */
function round_to_decimal_places(value: number, decimal_places: number): number {
  const factor = Math.pow(10, decimal_places);
  return Math.round(value * factor) / factor;
}

/**
 * Converts parsed track data into the compact string saved to localStorage.
 */
export function encode_track_for_storage(gpx_data: ParsedGpxData): string {
  const payload: StoredTrackPayload = {
    format_version: stored_track_format_version,
    track_name: gpx_data.track_name,
    total_distance_meters: round_to_decimal_places(gpx_data.total_distance_meters, 1),
    total_elevation_gain_meters: round_to_decimal_places(gpx_data.total_elevation_gain_meters, 1),
    total_elevation_loss_meters: round_to_decimal_places(gpx_data.total_elevation_loss_meters, 1),
    points: gpx_data.track_points.map((point): StoredTrackPointTuple => [
      round_to_decimal_places(point.latitude, 6),
      round_to_decimal_places(point.longitude, 6),
      round_to_decimal_places(point.elevation_meters, 1),
      round_to_decimal_places(point.cumulative_distance_meters, 1),
      round_to_decimal_places(point.cumulative_gain_meters, 1),
      round_to_decimal_places(point.cumulative_loss_meters, 1),
    ]),
  };
  return JSON.stringify(payload);
}

/**
 * Reads a track saved by encode_track_for_storage. It also accepts the full object saved by earlier
 * versions. Returns null when the stored value is missing, corrupt, or has no usable points.
 */
export function decode_track_from_storage(stored_string: string): ParsedGpxData | null {
  try {
    const stored_value = JSON.parse(stored_string) as Partial<StoredTrackPayload & ParsedGpxData>;

    if (stored_value.format_version === stored_track_format_version && Array.isArray(stored_value.points)) {
      const track_points = stored_value.points.map((tuple): ParsedTrackPoint => ({
        latitude: tuple[0],
        longitude: tuple[1],
        elevation_meters: tuple[2],
        cumulative_distance_meters: tuple[3],
        cumulative_gain_meters: tuple[4],
        cumulative_loss_meters: tuple[5],
      }));
      return track_points.length > 0
        ? {
            track_name: stored_value.track_name ?? "Unnamed Trail Run",
            total_distance_meters: stored_value.total_distance_meters ?? 0,
            total_elevation_gain_meters: stored_value.total_elevation_gain_meters ?? 0,
            total_elevation_loss_meters: stored_value.total_elevation_loss_meters ?? 0,
            track_points,
          }
        : null;
    }

    // Earlier versions saved the full ParsedGpxData object
    if (Array.isArray(stored_value.track_points) && stored_value.track_points.length > 0) {
      return stored_value as ParsedGpxData;
    }

    return null;
  } catch {
    return null;
  }
}
