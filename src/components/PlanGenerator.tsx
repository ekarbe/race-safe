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

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import type { ParsedGpxData } from "../utils/xml_gpx_parser";
import type { UserCheckpoint } from "../utils/elevation_pace_engine";
import {
  calculate_checkpoint_estimates,
  find_closest_track_point,
} from "../utils/elevation_pace_engine";

/**
 * Custom hook to detect the initial theme and handle theme updates.
 */
function get_initial_theme_preference(): boolean {
  const saved_theme = localStorage.getItem("race_safe_dark_theme");
  if (saved_theme) {
    return saved_theme === "true";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function PlanGenerator() {
  const navigate = useNavigate();

  // Theme state for global Dark Mode toggle
  const [is_dark_mode, set_is_dark_mode] = useState<boolean>(get_initial_theme_preference);

  // Core GPX Data state
  const [parsed_gpx_data, set_parsed_gpx_data] = useState<ParsedGpxData | null>(null);

  // Planner configurations state
  const [base_pace_minutes_per_kilometer, set_base_pace_minutes_per_kilometer] = useState<number>(6.0);
  const [ascent_penalty_minutes_per_hundred_meters, set_ascent_penalty_minutes_per_hundred_meters] = useState<number>(10.0);
  const [start_time_string, set_start_time_string] = useState<string>("08:00");
  const [emergency_contacts_text, set_emergency_contacts_text] = useState<string>("");

  // Checkpoints management state
  const [checkpoints_list, set_checkpoints_list] = useState<UserCheckpoint[]>([]);
  const [new_checkpoint_name_string, set_new_checkpoint_name_string] = useState<string>("");
  const [new_checkpoint_distance_number, set_new_checkpoint_distance_number] = useState<number>(0);

  // Canvas interaction state
  const [hovered_distance_meters, set_hovered_distance_meters] = useState<number | null>(null);
  const [canvas_width_pixels, set_canvas_width_pixels] = useState<number>(800);

  // Copy indicator state
  const [is_copied, set_is_copied] = useState<boolean>(false);

  // Element references
  const canvas_reference = useRef<HTMLCanvasElement | null>(null);
  const container_reference = useRef<HTMLDivElement | null>(null);
  const checkpoint_name_input_reference = useRef<HTMLInputElement | null>(null);

  // Sync theme class with document element
  useEffect(() => {
    if (is_dark_mode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("race_safe_dark_theme", is_dark_mode.toString());
  }, [is_dark_mode]);

  // Load GPX data from Local Storage on mount
  useEffect(() => {
    const cached_data_string = localStorage.getItem("race_safe_parsed_data");
    if (!cached_data_string) {
      // If no track data exists, redirect to home page
      navigate("/");
      return;
    }

    try {
      const gpx_data: ParsedGpxData = JSON.parse(cached_data_string);
      set_parsed_gpx_data(gpx_data);
      
      // Initialize default checkpoints: Start and Finish
      const total_distance_kilometers = parseFloat((gpx_data.total_distance_meters / 1000).toFixed(2));
      set_checkpoints_list([
        { id: "start-point-id", name: "Start", distance_kilometers: 0 },
        { id: "finish-point-id", name: "Finish", distance_kilometers: total_distance_kilometers },
      ]);
    } catch (error) {
      navigate("/");
    }
  }, [navigate]);

  // Handle window resizing to make the elevation profile canvas fully responsive
  useEffect(() => {
    const handle_resize = () => {
      if (container_reference.current) {
        set_canvas_width_pixels(container_reference.current.clientWidth);
      }
    };

    window.addEventListener("resize", handle_resize);
    // Call handler immediately on mount to establish width
    handle_resize();

    return () => {
      window.removeEventListener("resize", handle_resize);
    };
  }, [parsed_gpx_data]);

  // Calculate the live statistics of each checkpoint using our calculations engine
  const calculated_checkpoint_details_list = parsed_gpx_data
    ? calculate_checkpoint_estimates(
        parsed_gpx_data,
        checkpoints_list,
        base_pace_minutes_per_kilometer,
        ascent_penalty_minutes_per_hundred_meters,
        start_time_string
      )
    : [];

  const total_distance_kilometers = parsed_gpx_data
    ? parsed_gpx_data.total_distance_meters / 1000
    : 0;

  /**
   * Add a new checkpoint manually or from canvas click.
   */
  const handle_add_checkpoint = (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }

    if (!new_checkpoint_name_string.trim()) {
      return;
    }

    // Limit distances to the total route length
    const constrained_distance = Math.max(
      0,
      Math.min(total_distance_kilometers, new_checkpoint_distance_number)
    );

    const new_checkpoint: UserCheckpoint = {
      id: Date.now().toString(),
      name: new_checkpoint_name_string.trim(),
      distance_kilometers: parseFloat(constrained_distance.toFixed(2)),
    };

    set_checkpoints_list((previous_list) => [...previous_list, new_checkpoint]);
    set_new_checkpoint_name_string("");
    set_new_checkpoint_distance_number(0);
  };

  /**
   * Removes a checkpoint from the planning array.
   */
  const handle_delete_checkpoint = (checkpoint_id_to_remove: string) => {
    set_checkpoints_list((previous_list) =>
      previous_list.filter((checkpoint) => checkpoint.id !== checkpoint_id_to_remove)
    );
  };

  /**
   * Draw the elevation profile and checkpoint indicators on the HTML5 Canvas.
   */
  const render_elevation_canvas = () => {
    const canvas_element = canvas_reference.current;
    if (!canvas_element || !parsed_gpx_data) {
      return;
    }

    const canvas_context = canvas_element.getContext("2d");
    if (!canvas_context) {
      return;
    }

    const canvas_height_pixels = 220;
    
    // Set device pixel ratio for super high-resolution canvas drawing on retina screens
    const pixel_ratio = window.devicePixelRatio || 1;
    canvas_element.width = canvas_width_pixels * pixel_ratio;
    canvas_element.height = canvas_height_pixels * pixel_ratio;
    canvas_context.scale(pixel_ratio, pixel_ratio);

    // Padding margins inside the canvas
    const padding_left = 60;
    const padding_right = 30;
    const padding_top = 40;
    const padding_bottom = 30;

    const chart_width = canvas_width_pixels - padding_left - padding_right;
    const chart_height = canvas_height_pixels - padding_top - padding_bottom;

    // Clear previous drawings
    canvas_context.clearRect(0, 0, canvas_width_pixels, canvas_height_pixels);

    const track_points_array = parsed_gpx_data.track_points;
    const total_distance_meters = parsed_gpx_data.total_distance_meters;

    // Find min and max elevation values to scale the vertical Y-axis
    let min_elevation_meters = Infinity;
    let max_elevation_meters = -Infinity;
    for (let index = 0; index < track_points_array.length; index++) {
      const elevation = track_points_array[index].elevation_meters;
      if (elevation < min_elevation_meters) {
        min_elevation_meters = elevation;
      }
      if (elevation > max_elevation_meters) {
        max_elevation_meters = elevation;
      }
    }

    // Add padding to elevation limits to prevent line from touching top/bottom borders
    const elevation_range = max_elevation_meters - min_elevation_meters || 100;
    const y_axis_min = Math.max(0, min_elevation_meters - elevation_range * 0.15);
    const y_axis_max = max_elevation_meters + elevation_range * 0.15;

    // helper function to project track coordinates to canvas pixels
    const get_canvas_coordinates = (distance_meters: number, elevation_meters: number) => {
      const x = padding_left + (distance_meters / total_distance_meters) * chart_width;
      const y = padding_top + chart_height - ((elevation_meters - y_axis_min) / (y_axis_max - y_axis_min)) * chart_height;
      return { x, y };
    };

    // Style colors depending on dark mode state
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

    // Draw Grid Lines (Y-Axis Elevation Markers)
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
      
      // Draw grid line
      canvas_context.beginPath();
      canvas_context.moveTo(padding_left, coordinates.y);
      canvas_context.lineTo(canvas_width_pixels - padding_right, coordinates.y);
      canvas_context.stroke();

      // Draw text label
      canvas_context.fillText(`${Math.round(target_elevation)}m`, padding_left - 10, coordinates.y);
    }

    // Draw X-Axis Distance Labels
    canvas_context.textAlign = "center";
    canvas_context.textBaseline = "top";
    const distance_steps = 5;
    for (let index = 0; index <= distance_steps; index++) {
      const target_distance = (index / distance_steps) * total_distance_meters;
      const coordinates = get_canvas_coordinates(target_distance, y_axis_min);

      // Draw distance labels
      canvas_context.fillText(
        `${(target_distance / 1000).toFixed(0)} km`,
        coordinates.x,
        padding_top + chart_height + 8
      );
    }

    // Draw the main route fill shape
    canvas_context.beginPath();
    const initial_coordinates = get_canvas_coordinates(0, track_points_array[0].elevation_meters);
    canvas_context.moveTo(initial_coordinates.x, padding_top + chart_height);
    canvas_context.lineTo(initial_coordinates.x, initial_coordinates.y);

    for (let index = 1; index < track_points_array.length; index++) {
      const point = track_points_array[index];
      const coordinates = get_canvas_coordinates(point.cumulative_distance_meters, point.elevation_meters);
      canvas_context.lineTo(coordinates.x, coordinates.y);
    }

    const final_coordinates = get_canvas_coordinates(total_distance_meters, track_points_array[track_points_array.length - 1].elevation_meters);
    canvas_context.lineTo(final_coordinates.x, padding_top + chart_height);
    canvas_context.closePath();
    canvas_context.fillStyle = route_fill_gradient;
    canvas_context.fill();

    // Draw the main route line
    canvas_context.beginPath();
    canvas_context.moveTo(initial_coordinates.x, initial_coordinates.y);
    for (let index = 1; index < track_points_array.length; index++) {
      const point = track_points_array[index];
      const coordinates = get_canvas_coordinates(point.cumulative_distance_meters, point.elevation_meters);
      canvas_context.lineTo(coordinates.x, coordinates.y);
    }
    canvas_context.strokeStyle = route_stroke_color;
    canvas_context.lineWidth = 2;
    canvas_context.stroke();

    // Draw checkpoint marker flag pins
    for (let index = 0; index < calculated_checkpoint_details_list.length; index++) {
      const checkpoint = calculated_checkpoint_details_list[index];
      const target_meters = checkpoint.distance_kilometers * 1000;
      const point = find_closest_track_point(track_points_array, target_meters);
      const coordinates = get_canvas_coordinates(point.cumulative_distance_meters, point.elevation_meters);

      // Draw vertical line from checkpoint dot to top of profile chart
      canvas_context.strokeStyle = is_dark_mode ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)";
      canvas_context.setLineDash([3, 3]);
      canvas_context.beginPath();
      canvas_context.moveTo(coordinates.x, coordinates.y);
      canvas_context.lineTo(coordinates.x, padding_top);
      canvas_context.stroke();
      canvas_context.setLineDash([]); // Reset dash array

      // Draw a circular dot on the route profile path
      canvas_context.fillStyle = route_stroke_color;
      canvas_context.beginPath();
      canvas_context.arc(coordinates.x, coordinates.y, 4, 0, 2 * Math.PI);
      canvas_context.fill();
      
      canvas_context.strokeStyle = is_dark_mode ? "#09090b" : "#ffffff";
      canvas_context.lineWidth = 1;
      canvas_context.stroke();

      // Draw the flag title at the top
      canvas_context.fillStyle = route_stroke_color;
      canvas_context.font = "bold 9px Inter";
      canvas_context.textAlign = "center";
      
      // Print index labels like "C1", "C2" etc
      const label = index === 0 ? "S" : index === calculated_checkpoint_details_list.length - 1 ? "F" : `C${index}`;
      canvas_context.fillText(label, coordinates.x, padding_top - 18);

      // Draw a tiny flag pole
      canvas_context.strokeStyle = route_stroke_color;
      canvas_context.lineWidth = 1;
      canvas_context.beginPath();
      canvas_context.moveTo(coordinates.x, padding_top - 14);
      canvas_context.lineTo(coordinates.x, padding_top - 6);
      canvas_context.stroke();
    }

    // Draw interactive hover coordinate guidelines
    if (hovered_distance_meters !== null) {
      const point = find_closest_track_point(track_points_array, hovered_distance_meters);
      const coordinates = get_canvas_coordinates(point.cumulative_distance_meters, point.elevation_meters);

      // Draw full vertical guideline across graph
      canvas_context.strokeStyle = is_dark_mode ? "rgba(255,255,255,0.4)" : "rgba(24, 24, 27, 0.4)";
      canvas_context.lineWidth = 1;
      canvas_context.beginPath();
      canvas_context.moveTo(coordinates.x, padding_top);
      canvas_context.lineTo(coordinates.x, padding_top + chart_height);
      canvas_context.stroke();

      // Draw high-visibility dot on curve
      canvas_context.fillStyle = route_stroke_color;
      canvas_context.beginPath();
      canvas_context.arc(coordinates.x, coordinates.y, 6, 0, 2 * Math.PI);
      canvas_context.fill();
    }
  };

  // Re-run canvas renderer when parameters or dependencies modify
  useEffect(() => {
    render_elevation_canvas();
  }, [canvas_width_pixels, calculated_checkpoint_details_list, hovered_distance_meters, is_dark_mode]);

  /**
   * Handle mouse moves inside the canvas to compute distance intersections.
   */
  const handle_canvas_mouse_move = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas_element = canvas_reference.current;
    if (!canvas_element || !parsed_gpx_data) {
      return;
    }

    const bounding_rectangle = canvas_element.getBoundingClientRect();
    const mouse_x = event.clientX - bounding_rectangle.left;

    const padding_left = 60;
    const padding_right = 30;
    const chart_width = canvas_width_pixels - padding_left - padding_right;

    // Calculate mouse position relative to chart graph horizontal plane
    const relative_x = mouse_x - padding_left;

    if (relative_x >= 0 && relative_x <= chart_width) {
      const ratio = relative_x / chart_width;
      const target_distance = ratio * parsed_gpx_data.total_distance_meters;
      set_hovered_distance_meters(target_distance);
    } else {
      set_hovered_distance_meters(null);
    }
  };

  /**
   * Handle mouse leaving the canvas to reset hover states.
   */
  const handle_canvas_mouse_leave = () => {
    set_hovered_distance_meters(null);
  };

  /**
   * Handles clicking on the canvas to select a distance point and focus inputs.
   */
  const handle_canvas_click = () => {
    if (hovered_distance_meters !== null) {
      const distance_kilometers = parseFloat((hovered_distance_meters / 1000).toFixed(2));
      set_new_checkpoint_distance_number(distance_kilometers);
      set_new_checkpoint_name_string(`Checkpoint ${checkpoints_list.length - 1}`);
      
      // Focus on name input field to let user instantly type its name
      checkpoint_name_input_reference.current?.focus();
    }
  };

  /**
   * Generates and downloads the plan report as a PDF document.
   */
  const export_pdf_report = () => {
    if (!parsed_gpx_data) {
      return;
    }
    const pdf_document = new jsPDF("p", "mm", "a4");

    // Title and route characteristics header
    pdf_document.setFont("helvetica", "bold");
    pdf_document.setFontSize(22);
    pdf_document.text("RaceSafe Route Plan", 15, 20);

    pdf_document.setFont("helvetica", "normal");
    pdf_document.setFontSize(10);
    pdf_document.setTextColor(100, 100, 100);
    pdf_document.text(`Route Name: ${parsed_gpx_data.track_name}`, 15, 26);
    pdf_document.text(`Created on: ${new Date().toLocaleDateString()}`, 15, 31);

    // Summary specifications line
    pdf_document.setDrawColor(220, 220, 220);
    pdf_document.line(15, 35, 195, 35);

    // Dynamic stats blocks
    pdf_document.setFont("helvetica", "bold");
    pdf_document.setFontSize(10);
    pdf_document.setTextColor(0, 0, 0);
    pdf_document.text("Route Summary:", 15, 42);

    pdf_document.setFont("helvetica", "normal");
    const total_gain = Math.round(parsed_gpx_data.total_elevation_gain_meters);
    const total_loss = Math.round(parsed_gpx_data.total_elevation_loss_meters);
    pdf_document.text(
      `Distance: ${total_distance_kilometers.toFixed(2)} km  |  Gain: +${total_gain} m  |  Loss: -${total_loss} m`,
      15,
      47
    );
    pdf_document.text(
      `Base Pace: ${base_pace_minutes_per_kilometer} min/km  |  Ascent Penalty: ${ascent_penalty_minutes_per_hundred_meters} min/100m  |  Start Time: ${start_time_string}`,
      15,
      52
    );

    // Embed captured canvas image
    const canvas_element = canvas_reference.current;
    if (canvas_element) {
      const canvas_image_data_url = canvas_element.toDataURL("image/jpeg", 1.0);
      // addImage parameters: image, type, x, y, width, height
      pdf_document.addImage(canvas_image_data_url, "JPEG", 15, 58, 180, 50);
    }

    // Draw the Checkpoint schedule list
    let vertical_offset_y = 118;
    
    pdf_document.setFont("helvetica", "bold");
    pdf_document.setFontSize(11);
    pdf_document.text("Checkpoint Schedule", 15, vertical_offset_y);
    vertical_offset_y += 6;

    // Draw table headers
    pdf_document.setDrawColor(200, 200, 200);
    pdf_document.setFillColor(245, 245, 245);
    pdf_document.rect(15, vertical_offset_y, 180, 8, "F");
    
    pdf_document.setFont("helvetica", "bold");
    pdf_document.setFontSize(9);
    pdf_document.text("Checkpoint Name", 18, vertical_offset_y + 5.5);
    pdf_document.text("Dist (km)", 65, vertical_offset_y + 5.5);
    pdf_document.text("Elev (m)", 90, vertical_offset_y + 5.5);
    pdf_document.text("Gain (+m)", 115, vertical_offset_y + 5.5);
    pdf_document.text("ETA", 145, vertical_offset_y + 5.5);
    pdf_document.text("Elapsed Time", 168, vertical_offset_y + 5.5);

    vertical_offset_y += 8;

    // Draw table rows
    pdf_document.setFont("helvetica", "normal");
    for (let index = 0; index < calculated_checkpoint_details_list.length; index++) {
      const checkpoint = calculated_checkpoint_details_list[index];
      
      // Alternating row colors for better structure readability
      if (index % 2 === 1) {
        pdf_document.setFillColor(250, 250, 250);
        pdf_document.rect(15, vertical_offset_y, 180, 8, "F");
      }

      pdf_document.text(checkpoint.name, 18, vertical_offset_y + 5.5);
      pdf_document.text(`${checkpoint.distance_kilometers.toFixed(2)} km`, 65, vertical_offset_y + 5.5);
      pdf_document.text(`${checkpoint.elevation_meters} m`, 90, vertical_offset_y + 5.5);
      pdf_document.text(`+${checkpoint.cumulative_gain_meters} m`, 115, vertical_offset_y + 5.5);
      pdf_document.text(checkpoint.eta_time_string, 145, vertical_offset_y + 5.5);
      
      const hours = Math.floor(checkpoint.elapsed_time_minutes / 60);
      const minutes = checkpoint.elapsed_time_minutes % 60;
      const duration_string = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      pdf_document.text(duration_string, 168, vertical_offset_y + 5.5);

      pdf_document.line(15, vertical_offset_y + 8, 195, vertical_offset_y + 8);
      vertical_offset_y += 8;

      // Handle page breaking if checkpoints extend past page size limits
      if (vertical_offset_y > 270) {
        pdf_document.addPage();
        vertical_offset_y = 20;
      }
    }

    // Emergency contacts box
    if (emergency_contacts_text.trim()) {
      vertical_offset_y += 6;
      pdf_document.setFont("helvetica", "bold");
      pdf_document.setFontSize(10);
      pdf_document.text("Emergency Contacts & Instructions:", 15, vertical_offset_y);
      vertical_offset_y += 5;

      pdf_document.setFont("helvetica", "italic");
      pdf_document.setFontSize(9);
      const contact_lines = pdf_document.splitTextToSize(emergency_contacts_text.trim(), 175);
      pdf_document.text(contact_lines, 15, vertical_offset_y);
    }

    // Save document
    const file_slug = parsed_gpx_data.track_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    pdf_document.save(`racesafe-${file_slug}-plan.pdf`);
  };

  /**
   * Compiles the text safety summary message string.
   */
  const build_sms_payload_string = (): string => {
    if (!parsed_gpx_data) {
      return "";
    }
    const total_gain = Math.round(parsed_gpx_data.total_elevation_gain_meters);
    
    let template = `RaceSafe Plan: ${parsed_gpx_data.track_name}\n`;
    template += `Dist: ${total_distance_kilometers.toFixed(1)}km | Gain: +${total_gain}m\n`;
    template += `Start: ${start_time_string} | Pace: ${base_pace_minutes_per_kilometer}min/km\n`;
    template += `ETAs:\n`;

    for (let index = 0; index < calculated_checkpoint_details_list.length; index++) {
      const checkpoint = calculated_checkpoint_details_list[index];
      const hours = Math.floor(checkpoint.elapsed_time_minutes / 60);
      const minutes = checkpoint.elapsed_time_minutes % 60;
      const hours_formatted = hours.toString().padStart(2, "0");
      const minutes_formatted = minutes.toString().padStart(2, "0");
      
      template += `- ${checkpoint.name}: ${checkpoint.eta_time_string} (km ${checkpoint.distance_kilometers.toFixed(1)}, +${hours_formatted}:${minutes_formatted})\n`;
    }

    if (emergency_contacts_text.trim()) {
      template += `Contacts: ${emergency_contacts_text.trim()}\n`;
    }

    template += `Generated with RaceSafe`;
    return template;
  };

  /**
   * Copy the emergency SMS string directly to the clipboard.
   */
  const handle_copy_sms_payload = () => {
    const payload = build_sms_payload_string();
    navigator.clipboard.writeText(payload).then(() => {
      set_is_copied(true);
      setTimeout(() => set_is_copied(false), 2000);
    });
  };

  // Find information of the hovered point to display a floating glass card tooltip
  let hovered_point_info = null;
  if (hovered_distance_meters !== null && parsed_gpx_data) {
    const point = find_closest_track_point(parsed_gpx_data.track_points, hovered_distance_meters);
    
    // Estimate elapsed minutes and ETA for the hovered distance
    const flat_minutes = (point.cumulative_distance_meters / 1000) * base_pace_minutes_per_kilometer;
    const gain_hundreds = point.cumulative_gain_meters / 100;
    const delay_minutes = gain_hundreds * ascent_penalty_minutes_per_hundred_meters;
    const elapsed_total = flat_minutes + delay_minutes;

    const current_date = new Date();
    const parts = start_time_string.split(":");
    const hours = parts[0] ? parseInt(parts[0], 10) : 8;
    const minutes = parts[1] ? parseInt(parts[1], 10) : 0;
    const run_start = new Date(current_date.getFullYear(), current_date.getMonth(), current_date.getDate(), hours, minutes, 0, 0);
    const arrival = new Date(run_start.getTime() + elapsed_total * 60 * 1000);
    
    const formatted_hours = arrival.getHours().toString().padStart(2, "0");
    const formatted_minutes = arrival.getMinutes().toString().padStart(2, "0");

    hovered_point_info = {
      distance: (point.cumulative_distance_meters / 1000).toFixed(2),
      elevation: Math.round(point.elevation_meters),
      gain: Math.round(point.cumulative_gain_meters),
      eta: `${formatted_hours}:${formatted_minutes}`,
    };
  }

  // Return empty container while GPX is loading/redirecting
  if (!parsed_gpx_data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-lg text-zinc-500 dark:text-zinc-400">Loading GPX track planner...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Upper Navigation Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-4 border-b border-zinc-200 dark:border-zinc-800 gap-4">
        <div>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors mb-2 cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Uploader
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
            {parsed_gpx_data.track_name}
          </h1>
        </div>

        {/* Action button bar */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Dark Mode toggle */}
          <button
            onClick={() => set_is_dark_mode(!is_dark_mode)}
            className="p-2.5 rounded-xl glass-panel glass-panel-hover text-zinc-700 dark:text-zinc-300 cursor-pointer"
            title="Toggle theme"
          >
            {is_dark_mode ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Export PDF Button */}
          <button
            onClick={export_pdf_report}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-medium text-sm hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Hand: Settings form and parameters panel */}
        <div className="space-y-6 lg:col-span-1">
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-semibold mb-5 text-zinc-900 dark:text-white border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
              Pacing Parameters
            </h2>
            <div className="space-y-4">
              
              {/* Base Pace Input */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Base Pace (min/km)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="3"
                    max="15"
                    step="0.1"
                    value={base_pace_minutes_per_kilometer}
                    onChange={(event) => set_base_pace_minutes_per_kilometer(parseFloat(event.target.value))}
                    className="flex-1 accent-zinc-900 dark:accent-white"
                  />
                  <input
                    type="number"
                    min="3"
                    max="20"
                    step="0.1"
                    value={base_pace_minutes_per_kilometer}
                    onChange={(event) => set_base_pace_minutes_per_kilometer(parseFloat(event.target.value) || 6)}
                    className="w-16 text-center text-sm font-semibold glass-input"
                  />
                </div>
              </div>

              {/* Ascent Delay Penalty Input */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Ascent Penalty (min/100m climb)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="0.5"
                    value={ascent_penalty_minutes_per_hundred_meters}
                    onChange={(event) => set_ascent_penalty_minutes_per_hundred_meters(parseFloat(event.target.value))}
                    className="flex-1 accent-zinc-900 dark:accent-white"
                  />
                  <input
                    type="number"
                    min="0"
                    max="45"
                    step="0.5"
                    value={ascent_penalty_minutes_per_hundred_meters}
                    onChange={(event) => set_ascent_penalty_minutes_per_hundred_meters(parseFloat(event.target.value) || 10)}
                    className="w-16 text-center text-sm font-semibold glass-input"
                  />
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block mt-1">
                  Naismith's Rule standard is 10.0 minutes per 100m.
                </span>
              </div>

              {/* Start Time Input */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Run Start Time
                </label>
                <input
                  type="time"
                  value={start_time_string}
                  onChange={(event) => set_start_time_string(event.target.value)}
                  className="w-full text-sm font-semibold glass-input"
                />
              </div>

              {/* Emergency Safety Contacts Input */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Emergency Contacts / Notes
                </label>
                <textarea
                  value={emergency_contacts_text}
                  onChange={(event) => set_emergency_contacts_text(event.target.value)}
                  placeholder="e.g. SAR: +15551234, Crew: +15555678, medical info..."
                  rows={3}
                  className="w-full text-sm glass-input resize-none"
                />
              </div>

            </div>
          </div>

          {/* Quick summary statistics */}
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-white border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
              Route Details
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 block">Distance</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  {total_distance_kilometers.toFixed(2)} km
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 block">Elevation Gain</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  +{Math.round(parsed_gpx_data.total_elevation_gain_meters)} m
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 block">Elevation Loss</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  -{Math.round(parsed_gpx_data.total_elevation_loss_meters)} m
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 block">Checkpoints</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  {calculated_checkpoint_details_list.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Hand: Canvas profile, checkpoint scheduler and SMS exporters */}
        <div className="space-y-6 lg:col-span-2">
          
          {/* Interactive HTML5 Elevation Profile Canvas Container */}
          <div ref={container_reference} className="glass-panel p-6 rounded-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Elevation Profile
              </h2>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Click graph to place new checkpoint at distance
              </span>
            </div>

            <div className="relative">
              <canvas
                ref={canvas_reference}
                onMouseMove={handle_canvas_mouse_move}
                onMouseLeave={handle_canvas_mouse_leave}
                onClick={handle_canvas_click}
                className="w-full block bg-zinc-50/50 dark:bg-zinc-900/30 rounded-xl cursor-crosshair border border-zinc-200/50 dark:border-zinc-800/50"
                style={{ height: "220px" }}
              />

              {/* Floating Tooltip displaying details on canvas hover */}
              {hovered_point_info && (
                <div className="absolute top-4 left-16 glass-panel px-3 py-2 rounded-xl text-xs space-y-1 z-10 shadow-lg border border-zinc-200/80 dark:border-zinc-800/80 pointer-events-none">
                  <div><span className="text-zinc-400">Dist:</span> <span className="font-bold">{hovered_point_info.distance} km</span></div>
                  <div><span className="text-zinc-400">Elev:</span> <span className="font-bold">{hovered_point_info.elevation} m</span></div>
                  <div><span className="text-zinc-400">Gain:</span> <span className="font-bold">+{hovered_point_info.gain} m</span></div>
                  <div><span className="text-zinc-400">ETA:</span> <span className="font-bold text-zinc-900 dark:text-white">{hovered_point_info.eta}</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Checkpoint Table list planner */}
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-white border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
              Checkpoint Planner
            </h2>

            {/* Checkpoint manual addition form */}
            <form onSubmit={handle_add_checkpoint} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  ref={checkpoint_name_input_reference}
                  placeholder="Checkpoint Name (e.g. Aid Station 1)"
                  value={new_checkpoint_name_string}
                  onChange={(event) => set_new_checkpoint_name_string(event.target.value)}
                  className="w-full text-sm glass-input"
                />
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    max={total_distance_kilometers}
                    step="0.01"
                    placeholder="Distance"
                    value={new_checkpoint_distance_number || ""}
                    onChange={(event) => set_new_checkpoint_distance_number(parseFloat(event.target.value) || 0)}
                    className="w-full text-sm glass-input pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-semibold">
                    km
                  </span>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 rounded-lg text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors flex items-center justify-center cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>

            {/* Scrollable checklist container */}
            <div className="overflow-x-auto border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200/80 dark:border-zinc-800/80">
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">#</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">Name</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">Distance</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">Elevation</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">Gain</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">ETA</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">Elapsed</th>
                    <th className="p-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
                  {calculated_checkpoint_details_list.map((checkpoint, index) => {
                    const elapsed_hours = Math.floor(checkpoint.elapsed_time_minutes / 60);
                    const elapsed_minutes = checkpoint.elapsed_time_minutes % 60;
                    
                    const label = index === 0 ? "S" : index === calculated_checkpoint_details_list.length - 1 ? "F" : `C${index}`;
                    
                    return (
                      <tr key={checkpoint.id} className="hover:bg-zinc-50/40 dark:hover:bg-zinc-900/20 transition-colors">
                        <td className="p-3 font-bold text-zinc-400 dark:text-zinc-600">{label}</td>
                        <td className="p-3 font-medium text-zinc-900 dark:text-white">{checkpoint.name}</td>
                        <td className="p-3">{checkpoint.distance_kilometers.toFixed(2)} km</td>
                        <td className="p-3">{checkpoint.elevation_meters}m</td>
                        <td className="p-3 text-zinc-500">+{checkpoint.cumulative_gain_meters}m</td>
                        <td className="p-3 font-semibold text-zinc-900 dark:text-white">{checkpoint.eta_time_string}</td>
                        <td className="p-3 text-zinc-500">
                          {elapsed_hours > 0 ? `${elapsed_hours}h ${elapsed_minutes}m` : `${elapsed_minutes}m`}
                        </td>
                        <td className="p-3 text-right">
                          {checkpoint.id !== "start-point-id" && checkpoint.id !== "finish-point-id" && (
                            <button
                              onClick={() => handle_delete_checkpoint(checkpoint.id)}
                              className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                              title="Delete checkpoint"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SMS Emergency Payload Card Generator */}
          <div className="glass-panel p-6 rounded-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Emergency SMS Payload
              </h2>
              <div className="flex gap-2">
                {/* Copy Button */}
                <button
                  onClick={handle_copy_sms_payload}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold glass-panel glass-panel-hover flex items-center gap-1.5 cursor-pointer text-zinc-800 dark:text-zinc-200"
                >
                  {is_copied ? "Copied!" : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy Payload
                    </>
                  )}
                </button>
                {/* Native Launch SMS Button */}
                <a
                  href={`sms:?body=${encodeURIComponent(build_sms_payload_string())}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Send SMS
                </a>
              </div>
            </div>

            {/* Displaying raw text density layout */}
            <div className="bg-zinc-100/50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 font-mono text-xs whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed overflow-y-auto max-h-[160px]">
              {build_sms_payload_string()}
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block mt-2">
              Character-dense SMS structures are designed to send in low signal environments. Verify text content before copying or sending.
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
