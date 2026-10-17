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

import type { ParsedTrackPoint } from "./xml_gpx_parser";
import { find_closest_track_point } from "./elevation_pace_engine";

/**
 * Horizontal padding, in CSS pixels, around the plotted area. The planner maps pointer positions
 * to distances with the same values, so the hover and click readouts line up with the drawing.
 */
export const elevation_profile_padding_left_pixels = 60;
export const elevation_profile_padding_right_pixels = 30;

/**
 * A flag to draw on the elevation profile, such as "S", "C1" or "F".
 */
export interface ElevationProfileCheckpointMarker {
  label: string;
  distance_meters: number;
}

/**
 * Everything needed to paint one elevation profile onto a 2D canvas context.
 * The caller owns canvas sizing, device pixel ratio and background colour, so
 * the same drawing code serves the on-screen chart and the PDF export.
 */
export interface ElevationProfileOptions {
  width_pixels: number;
  height_pixels: number;
  is_dark_mode: boolean;
  track_points: ParsedTrackPoint[];
  total_distance_meters: number;
  checkpoint_markers: ElevationProfileCheckpointMarker[];
  hovered_distance_meters: number | null;
}

/**
 * Draws the elevation profile, its axes, checkpoint flags and the hover guide.
 * It does not clear or paint a background, so the caller clears the canvas and
 * fills any background it needs before calling this.
 */
export function draw_elevation_profile(
  canvas_context: CanvasRenderingContext2D,
  options: ElevationProfileOptions
): void {
  const {
    width_pixels,
    height_pixels,
    is_dark_mode,
    track_points,
    total_distance_meters,
    checkpoint_markers,
    hovered_distance_meters,
  } = options;

  if (track_points.length === 0) {
    return;
  }

  // Padding margins inside the canvas
  const padding_left = elevation_profile_padding_left_pixels;
  const padding_right = elevation_profile_padding_right_pixels;
  const padding_top = 40;
  const padding_bottom = 30;

  const chart_width = width_pixels - padding_left - padding_right;
  const chart_height = height_pixels - padding_top - padding_bottom;

  // Find min and max elevation values to scale the vertical Y-axis
  let min_elevation_meters = Infinity;
  let max_elevation_meters = -Infinity;
  for (let index = 0; index < track_points.length; index++) {
    const elevation = track_points[index].elevation_meters;
    if (elevation < min_elevation_meters) {
      min_elevation_meters = elevation;
    }
    if (elevation > max_elevation_meters) {
      max_elevation_meters = elevation;
    }
  }

  // Add padding to elevation limits to prevent line from touching top/bottom borders.
  // The axis is not clamped at zero, so routes below sea level still fit.
  const elevation_range = max_elevation_meters - min_elevation_meters || 100;
  const y_axis_min = min_elevation_meters - elevation_range * 0.15;
  const y_axis_max = max_elevation_meters + elevation_range * 0.15;

  // Helper function to project track coordinates to canvas pixels
  const get_canvas_coordinates = (distance_meters: number, elevation_meters: number) => {
    const x = padding_left + (distance_meters / total_distance_meters) * chart_width;
    const y = padding_top + chart_height - ((elevation_meters - y_axis_min) / (y_axis_max - y_axis_min)) * chart_height;
    return { x, y };
  };

  // Style colours depending on the theme
  const text_color = is_dark_mode ? "#a1a1aa" : "#71717a"; // zinc-400 / zinc-500
  const grid_color = is_dark_mode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const route_stroke_color = is_dark_mode ? "#f4f4f5" : "#18181b"; // zinc-100 / zinc-900
  const route_fill_gradient = canvas_context.createLinearGradient(0, padding_top, 0, padding_top + chart_height);

  if (is_dark_mode) {
    route_fill_gradient.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    route_fill_gradient.addColorStop(1, "rgba(255, 255, 255, 0.01)");
  } else {
    route_fill_gradient.addColorStop(0, "rgba(24, 24, 27, 0.08)");
    route_fill_gradient.addColorStop(1, "rgba(24, 24, 27, 0.01)");
  }

  // Draw grid lines (Y-axis elevation markers)
  canvas_context.strokeStyle = grid_color;
  canvas_context.lineWidth = 1;
  canvas_context.fillStyle = text_color;
  canvas_context.font = "10px Inter";
  canvas_context.textAlign = "right";
  canvas_context.textBaseline = "middle";

  const elevation_steps = 4;
  for (let index = 0; index <= elevation_steps; index++) {
    const target_elevation = y_axis_min + (index / elevation_steps) * (y_axis_max - y_axis_min);
    const coordinates = get_canvas_coordinates(0, target_elevation);

    canvas_context.beginPath();
    canvas_context.moveTo(padding_left, coordinates.y);
    canvas_context.lineTo(width_pixels - padding_right, coordinates.y);
    canvas_context.stroke();

    canvas_context.fillText(`${Math.round(target_elevation)}m`, padding_left - 10, coordinates.y);
  }

  // Draw X-axis distance labels
  canvas_context.textAlign = "center";
  canvas_context.textBaseline = "top";
  const distance_steps = 5;
  for (let index = 0; index <= distance_steps; index++) {
    const target_distance = (index / distance_steps) * total_distance_meters;
    const coordinates = get_canvas_coordinates(target_distance, y_axis_min);

    canvas_context.fillText(
      `${(target_distance / 1000).toFixed(0)} km`,
      coordinates.x,
      padding_top + chart_height + 8
    );
  }

  // Draw the filled area under the route
  const initial_coordinates = get_canvas_coordinates(0, track_points[0].elevation_meters);
  canvas_context.beginPath();
  canvas_context.moveTo(initial_coordinates.x, padding_top + chart_height);
  canvas_context.lineTo(initial_coordinates.x, initial_coordinates.y);

  for (let index = 1; index < track_points.length; index++) {
    const point = track_points[index];
    const coordinates = get_canvas_coordinates(point.cumulative_distance_meters, point.elevation_meters);
    canvas_context.lineTo(coordinates.x, coordinates.y);
  }

  const final_coordinates = get_canvas_coordinates(total_distance_meters, track_points[track_points.length - 1].elevation_meters);
  canvas_context.lineTo(final_coordinates.x, padding_top + chart_height);
  canvas_context.closePath();
  canvas_context.fillStyle = route_fill_gradient;
  canvas_context.fill();

  // Draw the route line
  canvas_context.beginPath();
  canvas_context.moveTo(initial_coordinates.x, initial_coordinates.y);
  for (let index = 1; index < track_points.length; index++) {
    const point = track_points[index];
    const coordinates = get_canvas_coordinates(point.cumulative_distance_meters, point.elevation_meters);
    canvas_context.lineTo(coordinates.x, coordinates.y);
  }
  canvas_context.strokeStyle = route_stroke_color;
  canvas_context.lineWidth = 2;
  canvas_context.stroke();

  // Draw checkpoint flags
  for (let index = 0; index < checkpoint_markers.length; index++) {
    const marker = checkpoint_markers[index];
    const point = find_closest_track_point(track_points, marker.distance_meters);
    const coordinates = get_canvas_coordinates(point.cumulative_distance_meters, point.elevation_meters);

    // Vertical line from the checkpoint dot up to the top of the profile
    canvas_context.strokeStyle = is_dark_mode ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)";
    canvas_context.setLineDash([3, 3]);
    canvas_context.beginPath();
    canvas_context.moveTo(coordinates.x, coordinates.y);
    canvas_context.lineTo(coordinates.x, padding_top);
    canvas_context.stroke();
    canvas_context.setLineDash([]);

    // Dot on the route profile
    canvas_context.fillStyle = route_stroke_color;
    canvas_context.beginPath();
    canvas_context.arc(coordinates.x, coordinates.y, 4, 0, 2 * Math.PI);
    canvas_context.fill();

    canvas_context.strokeStyle = is_dark_mode ? "#09090b" : "#ffffff";
    canvas_context.lineWidth = 1;
    canvas_context.stroke();

    // Flag label at the top
    canvas_context.fillStyle = route_stroke_color;
    canvas_context.font = "bold 9px Inter";
    canvas_context.textAlign = "center";
    canvas_context.fillText(marker.label, coordinates.x, padding_top - 18);

    // Flag pole
    canvas_context.strokeStyle = route_stroke_color;
    canvas_context.lineWidth = 1;
    canvas_context.beginPath();
    canvas_context.moveTo(coordinates.x, padding_top - 14);
    canvas_context.lineTo(coordinates.x, padding_top - 6);
    canvas_context.stroke();
  }

  // Draw the hover guide
  if (hovered_distance_meters !== null) {
    const point = find_closest_track_point(track_points, hovered_distance_meters);
    const coordinates = get_canvas_coordinates(point.cumulative_distance_meters, point.elevation_meters);

    canvas_context.strokeStyle = is_dark_mode ? "rgba(255,255,255,0.4)" : "rgba(24, 24, 27, 0.4)";
    canvas_context.lineWidth = 1;
    canvas_context.beginPath();
    canvas_context.moveTo(coordinates.x, padding_top);
    canvas_context.lineTo(coordinates.x, padding_top + chart_height);
    canvas_context.stroke();

    canvas_context.fillStyle = route_stroke_color;
    canvas_context.beginPath();
    canvas_context.arc(coordinates.x, coordinates.y, 6, 0, 2 * Math.PI);
    canvas_context.fill();
  }
}
