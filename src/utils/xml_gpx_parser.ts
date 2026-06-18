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
    throw new Error("Failed to parse the GPX file. The file does not appear to be valid XML.");
  }

  // Extract the name of the track, or use a default if it isn't specified
  const name_element = xml_document.querySelector("trk > name") || xml_document.querySelector("name");
  const track_name = name_element && name_element.textContent
    ? name_element.textContent.trim()
    : "Unnamed Trail Run";

  // Find all track points in the GPX file
  const track_point_nodes = xml_document.querySelectorAll("trkpt");
  if (track_point_nodes.length === 0) {
    throw new Error("No track points found in the GPX file. Make sure it contains a valid activity or route.");
  }

  const track_points: ParsedTrackPoint[] = [];
  
  let total_distance_meters = 0;
  let total_elevation_gain_meters = 0;
  let total_elevation_loss_meters = 0;

  // Iterate over each track point node and extract its data
  for (let index = 0; index < track_point_nodes.length; index++) {
    const current_point_node = track_point_nodes[index];
    
    // Read the latitude and longitude attributes from the node
    const latitude_attribute = current_point_node.getAttribute("lat");
    const longitude_attribute = current_point_node.getAttribute("lon");

    if (!latitude_attribute || !longitude_attribute) {
      // Skip points that don't have valid coordinate attributes
      continue;
    }

    const latitude = parseFloat(latitude_attribute);
    const longitude = parseFloat(longitude_attribute);

    // Look for the elevation child tag
    const elevation_node = current_point_node.querySelector("ele");
    let elevation_meters = 0;
    if (elevation_node && elevation_node.textContent) {
      elevation_meters = parseFloat(elevation_node.textContent);
    } else {
      // If elevation is missing, inherit from the previous point to prevent calculation gaps
      elevation_meters = track_points.length > 0 ? track_points[track_points.length - 1].elevation_meters : 0;
    }

    let cumulative_distance_meters = 0;
    let cumulative_gain_meters = 0;
    let cumulative_loss_meters = 0;

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

      // Calculate elevation delta from the previous point
      const elevation_delta_meters = elevation_meters - previous_point.elevation_meters;
      
      if (elevation_delta_meters > 0) {
        total_elevation_gain_meters += elevation_delta_meters;
      } else {
        total_elevation_loss_meters += Math.abs(elevation_delta_meters);
      }

      cumulative_gain_meters = total_elevation_gain_meters;
      cumulative_loss_meters = total_elevation_loss_meters;
    }

    // Append the newly parsed and calculated track point to our points list
    track_points.push({
      latitude,
      longitude,
      elevation_meters,
      cumulative_distance_meters,
      cumulative_gain_meters,
      cumulative_loss_meters,
    });
  }

  return {
    track_name,
    total_distance_meters,
    total_elevation_gain_meters,
    total_elevation_loss_meters,
    track_points,
  };
}
