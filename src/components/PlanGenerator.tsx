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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { jsPDF } from "jspdf";
import type { ParsedGpxData } from "../utils/xml_gpx_parser";
import {
  calculate_arrival_eta_string,
  calculate_checkpoint_estimates,
  calculate_elapsed_minutes_at_point,
  find_closest_track_point,
  type CalculatedCheckpointDetails,
  type CutoffStatus,
  type PlanSettings,
  type UserCheckpoint,
} from "../utils/elevation_pace_engine";
import {
  draw_elevation_profile,
  elevation_profile_padding_left_pixels,
  elevation_profile_padding_right_pixels,
  type ElevationProfileCheckpointMarker,
} from "../utils/elevation_profile_renderer";
import {
  apply_theme_to_document,
  get_initial_theme_preference,
  save_theme_preference,
} from "../utils/theme_preference";
import {
  clear_saved_data,
  create_default_plan_settings,
  load_plan_state,
  load_saved_track,
  save_plan_state,
  type SavedPlanState,
} from "../utils/plan_storage";
import {
  climb_unit_label,
  display_distance_to_kilometres,
  display_pace_to_per_kilometre,
  display_to_minutes_per_100m,
  distance_unit_label,
  elevation_unit_label,
  kilometres_to_display_distance,
  metres_to_display_elevation,
  minutes_per_100m_to_display,
  pace_per_kilometre_to_display,
  pace_unit_label,
} from "../utils/units";
import { format_number, type Language } from "../i18n/messages";
import { useSettings } from "../i18n/settings_context";
import SettingsControls from "./SettingsControls";

// Height of the on-screen elevation profile, in CSS pixels
const profile_canvas_height_pixels = 220;

// Size of the elevation profile in the PDF. 900 x 250 matches the 180 x 50 mm slot in the PDF,
// so the image is not stretched whatever the width of the screen.
const export_profile_width_pixels = 900;
const export_profile_height_pixels = 250;

const start_point_id = "start-point-id";
const finish_point_id = "finish-point-id";

// Distinguishes checkpoint ids made in different visits, so a new one never clashes with a saved one
const checkpoint_id_session_prefix = Date.now().toString(36);

// Allowed values, in metric units. Inputs are converted to and from the shown unit.
const climb_limits_per_100_metres = { minimum: 0, maximum: 45 };
const descent_limits_per_100_metres = { minimum: 0, maximum: 30 };

/**
 * What the planner starts from: the saved track and, when it matches, the saved plan.
 */
interface PlannerStartingState {
  gpx_data: ParsedGpxData;
  saved_plan: SavedPlanState | null;
}

/**
 * Chart label for a checkpoint: S for the start, F for the finish, and C1, C2 and so on in between.
 */
function get_checkpoint_label(index: number, total_checkpoint_count: number): string {
  if (index === 0) {
    return "S";
  }
  if (index === total_checkpoint_count - 1) {
    return "F";
  }
  return `C${index}`;
}

/**
 * Applies a typed number to a field. Blank or partial input is ignored, so the field keeps its
 * last valid value instead of jumping to a default. Range limits are applied on blur.
 */
function apply_typed_number(raw_value: string, set_value: (value: number) => void): void {
  const parsed_value = parseFloat(raw_value);
  if (!Number.isNaN(parsed_value)) {
    set_value(parsed_value);
  }
}

/**
 * Keeps a number within the limits of its field.
 */
function clamp_number(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Start and Finish checkpoints that every plan begins with.
 */
function build_default_checkpoints(gpx_data: ParsedGpxData): UserCheckpoint[] {
  const total_distance_kilometers = parseFloat((gpx_data.total_distance_meters / 1000).toFixed(2));
  return [
    { id: start_point_id, name: "Start", distance_kilometers: 0, stop_minutes: 0, cutoff_datetime_string: "" },
    { id: finish_point_id, name: "Finish", distance_kilometers: total_distance_kilometers, stop_minutes: 0, cutoff_datetime_string: "" },
  ];
}

/**
 * Rebuilds the checkpoint list from a saved plan. Start and Finish always come from the track,
 * keeping only their saved stop and cut-off. Other checkpoints come from the saved plan.
 */
function build_checkpoints_from_plan(gpx_data: ParsedGpxData, saved_checkpoints: UserCheckpoint[]): UserCheckpoint[] {
  const saved_by_id = new Map(saved_checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const fixed_checkpoints = build_default_checkpoints(gpx_data).map((checkpoint) => {
    const saved_checkpoint = saved_by_id.get(checkpoint.id);
    return {
      ...checkpoint,
      stop_minutes: saved_checkpoint?.stop_minutes ?? 0,
      cutoff_datetime_string: saved_checkpoint?.cutoff_datetime_string ?? "",
    };
  });
  const user_checkpoints = saved_checkpoints.filter(
    (checkpoint) => checkpoint.id !== start_point_id && checkpoint.id !== finish_point_id
  );
  return [...fixed_checkpoints, ...user_checkpoints];
}

/**
 * Total stop time at checkpoints that come before a distance along the route.
 */
function sum_stop_minutes_before(checkpoints: UserCheckpoint[], distance_meters: number): number {
  return checkpoints.reduce((total_minutes, checkpoint) => {
    const is_before_point = checkpoint.distance_kilometers * 1000 < distance_meters;
    return is_before_point ? total_minutes + Math.max(0, checkpoint.stop_minutes ?? 0) : total_minutes;
  }, 0);
}

/**
 * Formats elapsed minutes as hours and minutes, for example "3h 05m" or "45m".
 */
function format_elapsed_hours_minutes(total_minutes: number, translate_hours_minutes: (hours: number, minutes: number) => string, translate_minutes: (minutes: number) => string): string {
  const hours = Math.floor(total_minutes / 60);
  const minutes = total_minutes % 60;
  return hours > 0 ? translate_hours_minutes(hours, minutes) : translate_minutes(minutes);
}

/**
 * Formats a race date for the PDF and the screen, for example "Sat, 17 Oct 2026".
 */
function format_race_date(race_date_string: string, language: Language): string {
  const race_date_match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(race_date_string);
  if (!race_date_match) {
    return "";
  }
  const race_date = new Date(
    parseInt(race_date_match[1], 10),
    parseInt(race_date_match[2], 10) - 1,
    parseInt(race_date_match[3], 10)
  );
  return race_date.toLocaleDateString(language === "de" ? "de-DE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Compact slack text for the PDF, for example "+25 min" or "-12 min".
 */
function format_slack_for_pdf(cutoff_status: CutoffStatus, slack_minutes: number | null): string {
  if (cutoff_status === "none" || slack_minutes === null) {
    return "-";
  }
  return `${slack_minutes >= 0 ? "+" : "-"}${Math.abs(slack_minutes)} min`;
}

export default function PlanGenerator() {
  const navigate = useNavigate();
  const { t, language, units } = useSettings();

  // The saved track and plan are read once on mount. A missing or corrupt track sends the user back to the uploader.
  const [starting_state] = useState<PlannerStartingState | null>(() => {
    const gpx_data = load_saved_track();
    return gpx_data ? { gpx_data, saved_plan: load_plan_state(gpx_data) } : null;
  });
  const parsed_gpx_data = starting_state?.gpx_data ?? null;

  // Theme state for global Dark Mode toggle
  const [is_dark_mode, set_is_dark_mode] = useState<boolean>(get_initial_theme_preference);

  // Planner configuration, kept in metric units
  const [settings, set_settings] = useState<PlanSettings>(() => starting_state?.saved_plan?.settings ?? create_default_plan_settings());
  const [emergency_contacts_text, set_emergency_contacts_text] = useState<string>(() => starting_state?.saved_plan?.emergency_contacts_text ?? "");

  // Checkpoints management state
  const [checkpoints_list, set_checkpoints_list] = useState<UserCheckpoint[]>(() => {
    if (!starting_state) {
      return [];
    }
    return starting_state.saved_plan
      ? build_checkpoints_from_plan(starting_state.gpx_data, starting_state.saved_plan.checkpoints)
      : build_default_checkpoints(starting_state.gpx_data);
  });
  const [new_checkpoint_name_string, set_new_checkpoint_name_string] = useState<string>("");
  // Entered in the shown distance unit
  const [new_checkpoint_distance_number, set_new_checkpoint_distance_number] = useState<number>(0);

  // Canvas interaction state
  const [hovered_distance_meters, set_hovered_distance_meters] = useState<number | null>(null);
  const [canvas_width_pixels, set_canvas_width_pixels] = useState<number>(800);

  // Clipboard feedback state
  const [copy_status, set_copy_status] = useState<"idle" | "copied" | "failed">("idle");

  // Element references
  const canvas_reference = useRef<HTMLCanvasElement | null>(null);
  const checkpoint_name_input_reference = useRef<HTMLInputElement | null>(null);
  const next_checkpoint_serial_reference = useRef<number>(0);

  const total_distance_kilometers = parsed_gpx_data ? parsed_gpx_data.total_distance_meters / 1000 : 0;

  // Calculate the live statistics of each checkpoint using our calculations engine
  const calculated_checkpoint_details_list = useMemo<CalculatedCheckpointDetails[]>(() => {
    if (!parsed_gpx_data) {
      return [];
    }
    return calculate_checkpoint_estimates(parsed_gpx_data, checkpoints_list, settings);
  }, [parsed_gpx_data, checkpoints_list, settings]);

  const checkpoint_markers = useMemo<ElevationProfileCheckpointMarker[]>(
    () =>
      calculated_checkpoint_details_list.map((checkpoint, index) => ({
        label: get_checkpoint_label(index, calculated_checkpoint_details_list.length),
        distance_meters: checkpoint.distance_kilometers * 1000,
      })),
    [calculated_checkpoint_details_list]
  );

  // Apply the theme to the page and remember the choice for the next visit
  useEffect(() => {
    apply_theme_to_document(is_dark_mode);
    save_theme_preference(is_dark_mode);
  }, [is_dark_mode]);

  // Save the plan whenever it changes, so settings, contacts and checkpoints survive a reload
  useEffect(() => {
    if (!parsed_gpx_data) {
      return;
    }
    save_plan_state({
      track_name: parsed_gpx_data.track_name,
      total_distance_meters: parsed_gpx_data.total_distance_meters,
      settings,
      emergency_contacts_text,
      checkpoints: checkpoints_list,
    });
  }, [parsed_gpx_data, settings, emergency_contacts_text, checkpoints_list]);

  // Send the user back to the uploader when there is no usable track
  useEffect(() => {
    if (!parsed_gpx_data) {
      navigate("/");
    }
  }, [navigate, parsed_gpx_data]);

  // Size the drawing buffer from the canvas itself, so the pointer maths and the drawing use the same width.
  // The observer reports the size as soon as it starts watching.
  useEffect(() => {
    const canvas_element = canvas_reference.current;
    if (!canvas_element) {
      return;
    }

    const resize_observer = new ResizeObserver(() => {
      set_canvas_width_pixels(canvas_element.clientWidth);
    });
    resize_observer.observe(canvas_element);

    return () => {
      resize_observer.disconnect();
    };
  }, [parsed_gpx_data]);

  // Redraw the on-screen elevation profile whenever its inputs change
  useEffect(() => {
    const canvas_element = canvas_reference.current;
    if (!canvas_element || !parsed_gpx_data) {
      return;
    }

    const canvas_context = canvas_element.getContext("2d");
    if (!canvas_context) {
      return;
    }

    // Set device pixel ratio for super high-resolution canvas drawing on retina screens
    const pixel_ratio = window.devicePixelRatio || 1;
    canvas_element.width = canvas_width_pixels * pixel_ratio;
    canvas_element.height = profile_canvas_height_pixels * pixel_ratio;
    canvas_context.setTransform(pixel_ratio, 0, 0, pixel_ratio, 0, 0);
    canvas_context.clearRect(0, 0, canvas_width_pixels, profile_canvas_height_pixels);

    draw_elevation_profile(canvas_context, {
      width_pixels: canvas_width_pixels,
      height_pixels: profile_canvas_height_pixels,
      is_dark_mode,
      track_points: parsed_gpx_data.track_points,
      total_distance_meters: parsed_gpx_data.total_distance_meters,
      checkpoint_markers,
      hovered_distance_meters,
    });
  }, [canvas_width_pixels, parsed_gpx_data, checkpoint_markers, hovered_distance_meters, is_dark_mode]);

  // Hide the clipboard message again after a short delay
  useEffect(() => {
    if (copy_status === "idle") {
      return;
    }
    const reset_timer = window.setTimeout(() => set_copy_status("idle"), 2000);
    return () => window.clearTimeout(reset_timer);
  }, [copy_status]);

  // Shown-unit helpers. They keep the table, tooltip, PDF and SMS consistent.
  const format_distance_kilometres = (kilometres: number, decimal_places: number): string =>
    format_number(kilometres_to_display_distance(kilometres, units), decimal_places, language);
  const format_elevation_metres = (metres: number): string =>
    format_number(Math.round(metres_to_display_elevation(metres, units)), 0, language);
  const format_pace = (minutes_per_kilometre: number, decimal_places: number): string =>
    format_number(pace_per_kilometre_to_display(minutes_per_kilometre, units), decimal_places, language);
  const format_climb_allowance = (minutes_per_100_metres: number): string =>
    format_number(minutes_per_100m_to_display(minutes_per_100_metres, units), 1, language);

  /**
   * The name shown for a checkpoint. Start and Finish are translated; typed names are kept as entered.
   */
  const display_checkpoint_name = (checkpoint_id: string, checkpoint_name: string): string => {
    if (checkpoint_id === start_point_id) {
      return t("planner_start_name");
    }
    if (checkpoint_id === finish_point_id) {
      return t("planner_finish_name");
    }
    return checkpoint_name;
  };

  /**
   * Updates one checkpoint's stop time or cut-off.
   */
  const update_checkpoint = (checkpoint_id: string, changes: Partial<UserCheckpoint>) => {
    set_checkpoints_list((previous_list) =>
      previous_list.map((checkpoint) => (checkpoint.id === checkpoint_id ? { ...checkpoint, ...changes } : checkpoint))
    );
  };

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

    // Limit distances to the total route length, converting from the shown unit first
    const requested_kilometres = display_distance_to_kilometres(new_checkpoint_distance_number, units);
    const constrained_kilometres = Math.max(0, Math.min(total_distance_kilometers, requested_kilometres));

    next_checkpoint_serial_reference.current += 1;
    const new_checkpoint: UserCheckpoint = {
      id: `${checkpoint_id_session_prefix}-${next_checkpoint_serial_reference.current}`,
      name: new_checkpoint_name_string.trim(),
      distance_kilometers: parseFloat(constrained_kilometres.toFixed(2)),
      stop_minutes: 0,
      cutoff_datetime_string: "",
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
   * Converts a pointer x position into a route distance. Returns null when the pointer is
   * outside the plotted area. The border is subtracted so the origin matches the drawing.
   */
  const get_distance_meters_at_pointer = (client_x: number): number | null => {
    const canvas_element = canvas_reference.current;
    if (!canvas_element || !parsed_gpx_data) {
      return null;
    }

    const bounding_rectangle = canvas_element.getBoundingClientRect();
    const pointer_x = client_x - bounding_rectangle.left - canvas_element.clientLeft;

    const chart_width = canvas_width_pixels - elevation_profile_padding_left_pixels - elevation_profile_padding_right_pixels;
    const relative_x = pointer_x - elevation_profile_padding_left_pixels;

    if (relative_x < 0 || relative_x > chart_width) {
      return null;
    }

    return (relative_x / chart_width) * parsed_gpx_data.total_distance_meters;
  };

  /**
   * Updates the hover readout as the pointer or finger moves over the profile.
   */
  const handle_canvas_pointer_move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    set_hovered_distance_meters(get_distance_meters_at_pointer(event.clientX));
  };

  /**
   * Clears the hover readout when the pointer leaves the profile.
   */
  const handle_canvas_pointer_leave = () => {
    set_hovered_distance_meters(null);
  };

  /**
   * Places a checkpoint at the clicked distance. Clicks and taps are read directly from the event,
   * so touch input works without a prior hover.
   */
  const handle_canvas_click = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const clicked_distance_meters = get_distance_meters_at_pointer(event.clientX);
    if (clicked_distance_meters === null) {
      return;
    }

    const distance_in_shown_unit = kilometres_to_display_distance(clicked_distance_meters / 1000, units);
    set_new_checkpoint_distance_number(parseFloat(distance_in_shown_unit.toFixed(2)));
    set_new_checkpoint_name_string(t("planner_default_checkpoint_name", { number: checkpoints_list.length - 1 }));

    // Focus on name input field to let user instantly type its name
    checkpoint_name_input_reference.current?.focus();
  };

  /**
   * Draws the elevation profile for the PDF on a white background in light colours.
   * JPEG has no transparency, so a transparent canvas would otherwise export as black.
   */
  const build_profile_image_data_url = (): string => {
    if (!parsed_gpx_data) {
      return "";
    }

    const export_canvas = document.createElement("canvas");
    const export_pixel_ratio = 2;
    export_canvas.width = export_profile_width_pixels * export_pixel_ratio;
    export_canvas.height = export_profile_height_pixels * export_pixel_ratio;

    const export_context = export_canvas.getContext("2d");
    if (!export_context) {
      return "";
    }

    export_context.setTransform(export_pixel_ratio, 0, 0, export_pixel_ratio, 0, 0);
    export_context.fillStyle = "#ffffff";
    export_context.fillRect(0, 0, export_profile_width_pixels, export_profile_height_pixels);

    draw_elevation_profile(export_context, {
      width_pixels: export_profile_width_pixels,
      height_pixels: export_profile_height_pixels,
      is_dark_mode: false,
      track_points: parsed_gpx_data.track_points,
      total_distance_meters: parsed_gpx_data.total_distance_meters,
      checkpoint_markers,
      hovered_distance_meters: null,
    });

    return export_canvas.toDataURL("image/jpeg", 0.92);
  };

  /**
   * Generates and downloads the plan report as a PDF document.
   */
  const export_pdf_report = () => {
    if (!parsed_gpx_data) {
      return;
    }
    const pdf_document = new jsPDF("p", "mm", "a4");
    const distance_unit = distance_unit_label(units);
    const elevation_unit = elevation_unit_label(units);
    const pace_unit = pace_unit_label(units);
    const climb_unit = climb_unit_label(units);

    // Title and route characteristics header
    pdf_document.setFont("helvetica", "bold");
    pdf_document.setFontSize(22);
    pdf_document.text(t("pdf_title"), 15, 20);

    pdf_document.setFont("helvetica", "normal");
    pdf_document.setFontSize(10);
    pdf_document.setTextColor(100, 100, 100);
    pdf_document.text(t("pdf_route_name", { name: parsed_gpx_data.track_name }), 15, 26);
    pdf_document.text(t("pdf_created", { date: new Date().toLocaleDateString(language === "de" ? "de-DE" : "en-GB") }), 15, 31);

    // Summary specifications line
    pdf_document.setDrawColor(220, 220, 220);
    pdf_document.line(15, 35, 195, 35);

    // Dynamic stats blocks
    pdf_document.setFont("helvetica", "bold");
    pdf_document.setFontSize(10);
    pdf_document.setTextColor(0, 0, 0);
    pdf_document.text(t("pdf_route_summary"), 15, 42);

    pdf_document.setFont("helvetica", "normal");
    pdf_document.text(
      t("pdf_summary_line", {
        distance: format_distance_kilometres(total_distance_kilometers, 2),
        distance_unit,
        gain: format_elevation_metres(parsed_gpx_data.total_elevation_gain_meters),
        loss: format_elevation_metres(parsed_gpx_data.total_elevation_loss_meters),
        elevation_unit,
      }),
      15,
      47
    );
    pdf_document.text(
      t("pdf_settings_line", {
        pace: format_pace(settings.base_pace_minutes_per_kilometer, 1),
        pace_unit,
        climb: format_climb_allowance(settings.ascent_penalty_minutes_per_hundred_meters),
        descent: format_climb_allowance(settings.descent_time_minutes_per_hundred_meters),
        climb_unit,
        race_date: format_race_date(settings.race_date_string, language),
        start: settings.start_time_string,
      }),
      15,
      52
    );

    // Embed the elevation profile, drawn for print
    const profile_image_data_url = build_profile_image_data_url();
    if (profile_image_data_url) {
      // addImage parameters: image, type, x, y, width, height
      pdf_document.addImage(profile_image_data_url, "JPEG", 15, 58, 180, 50);
    }

    // Draw the Checkpoint schedule list
    let vertical_offset_y = 118;

    pdf_document.setFont("helvetica", "bold");
    pdf_document.setFontSize(11);
    pdf_document.text(t("pdf_schedule_heading"), 15, vertical_offset_y);
    vertical_offset_y += 6;

    // Draw table headers
    pdf_document.setDrawColor(200, 200, 200);
    pdf_document.setFillColor(245, 245, 245);
    pdf_document.rect(15, vertical_offset_y, 180, 8, "F");

    pdf_document.setFont("helvetica", "bold");
    pdf_document.setFontSize(9);
    pdf_document.text(t("pdf_col_name"), 18, vertical_offset_y + 5.5);
    pdf_document.text(`${t("pdf_col_distance")} (${distance_unit})`, 62, vertical_offset_y + 5.5);
    pdf_document.text(`${t("pdf_col_elevation")} (${elevation_unit})`, 84, vertical_offset_y + 5.5);
    pdf_document.text(`${t("pdf_col_gain")} (+${elevation_unit})`, 106, vertical_offset_y + 5.5);
    pdf_document.text(t("pdf_col_eta"), 126, vertical_offset_y + 5.5);
    pdf_document.text(t("pdf_col_elapsed"), 146, vertical_offset_y + 5.5);
    pdf_document.text(t("pdf_col_reserve"), 168, vertical_offset_y + 5.5);

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

      pdf_document.text(display_checkpoint_name(checkpoint.id, checkpoint.name), 18, vertical_offset_y + 5.5);
      pdf_document.text(format_distance_kilometres(checkpoint.distance_kilometers, 2), 62, vertical_offset_y + 5.5);
      pdf_document.text(format_elevation_metres(checkpoint.elevation_meters), 84, vertical_offset_y + 5.5);
      pdf_document.text(`+${format_elevation_metres(checkpoint.cumulative_gain_meters)}`, 106, vertical_offset_y + 5.5);
      pdf_document.text(checkpoint.eta_time_string, 126, vertical_offset_y + 5.5);
      pdf_document.text(
        format_elapsed_hours_minutes(checkpoint.elapsed_time_minutes, (hours, minutes) => t("planner_elapsed_hours_minutes", { hours, minutes }), (minutes) => t("planner_elapsed_minutes", { minutes })),
        146,
        vertical_offset_y + 5.5
      );
      pdf_document.text(format_slack_for_pdf(checkpoint.cutoff_status, checkpoint.slack_minutes), 168, vertical_offset_y + 5.5);

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

      pdf_document.setFont("helvetica", "italic");
      pdf_document.setFontSize(9);
      const contact_lines = pdf_document.splitTextToSize(emergency_contacts_text.trim(), 175);

      // Start the contacts on a new page when the block would run past the bottom margin
      const contacts_block_height_mm = 5 + contact_lines.length * 4.5;
      if (vertical_offset_y + contacts_block_height_mm > 280) {
        pdf_document.addPage();
        vertical_offset_y = 20;
      }

      pdf_document.setFont("helvetica", "bold");
      pdf_document.setFontSize(10);
      pdf_document.text(t("pdf_contacts_heading"), 15, vertical_offset_y);
      vertical_offset_y += 5;

      pdf_document.setFont("helvetica", "italic");
      pdf_document.setFontSize(9);
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
    const distance_unit = distance_unit_label(units);
    const elevation_unit = elevation_unit_label(units);
    const pace_unit = pace_unit_label(units);

    const lines: string[] = [
      t("sms_title", { name: parsed_gpx_data.track_name }),
      t("sms_totals", {
        distance: format_distance_kilometres(total_distance_kilometers, 1),
        distance_unit,
        gain: format_elevation_metres(parsed_gpx_data.total_elevation_gain_meters),
        elevation_unit,
      }),
      t("sms_start", { start: settings.start_time_string, pace: format_pace(settings.base_pace_minutes_per_kilometer, 1), pace_unit }),
      t("sms_etas_heading"),
    ];

    for (const checkpoint of calculated_checkpoint_details_list) {
      const elapsed_hours = Math.floor(checkpoint.elapsed_time_minutes / 60);
      const elapsed_minutes = checkpoint.elapsed_time_minutes % 60;
      lines.push(
        t("sms_eta_line", {
          name: display_checkpoint_name(checkpoint.id, checkpoint.name),
          eta: checkpoint.eta_time_string,
          distance: format_distance_kilometres(checkpoint.distance_kilometers, 1),
          distance_unit,
          elapsed: `${elapsed_hours.toString().padStart(2, "0")}:${elapsed_minutes.toString().padStart(2, "0")}`,
        })
      );
    }

    if (emergency_contacts_text.trim()) {
      lines.push(t("sms_contacts", { contacts: emergency_contacts_text.trim() }));
    }

    lines.push(t("sms_footer"));
    return lines.join("\n");
  };

  /**
   * Copy the emergency SMS string directly to the clipboard.
   */
  const handle_copy_sms_payload = () => {
    const payload = build_sms_payload_string();
    if (!navigator.clipboard) {
      set_copy_status("failed");
      return;
    }
    navigator.clipboard.writeText(payload).then(
      () => set_copy_status("copied"),
      () => set_copy_status("failed")
    );
  };

  /**
   * Removes the saved track and plan from this browser after the user confirms, then returns to the uploader.
   */
  const handle_clear_saved_data = () => {
    if (!window.confirm(t("clear_confirm"))) {
      return;
    }
    clear_saved_data();
    navigate("/");
  };

  // Find information of the hovered point to display a floating glass card tooltip
  let hovered_point_info: { distance: string; elevation: string; gain: string; eta: string } | null = null;
  if (hovered_distance_meters !== null && parsed_gpx_data) {
    const point = find_closest_track_point(parsed_gpx_data.track_points, hovered_distance_meters);
    const stop_minutes_before_point = sum_stop_minutes_before(checkpoints_list, hovered_distance_meters);
    const elapsed_total_minutes = calculate_elapsed_minutes_at_point(point, settings, stop_minutes_before_point);

    hovered_point_info = {
      distance: format_distance_kilometres(point.cumulative_distance_meters / 1000, 2),
      elevation: format_elevation_metres(point.elevation_meters),
      gain: format_elevation_metres(point.cumulative_gain_meters),
      eta: calculate_arrival_eta_string(settings, elapsed_total_minutes),
    };
  }

  // Return empty container while GPX is loading/redirecting
  if (!parsed_gpx_data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-lg text-zinc-500 dark:text-zinc-400">{t("app_loading_planner")}</div>
      </div>
    );
  }

  const distance_unit = distance_unit_label(units);
  const elevation_unit = elevation_unit_label(units);
  const pace_unit = pace_unit_label(units);
  const climb_unit = climb_unit_label(units);

  // Slider and input limits in the shown unit
  const pace_slider_minimum = pace_per_kilometre_to_display(3, units);
  const pace_slider_maximum = pace_per_kilometre_to_display(15, units);
  const climb_slider_maximum = minutes_per_100m_to_display(30, units);
  const climb_input_maximum = minutes_per_100m_to_display(climb_limits_per_100_metres.maximum, units);
  const descent_input_maximum = minutes_per_100m_to_display(descent_limits_per_100_metres.maximum, units);
  const base_pace_display = pace_per_kilometre_to_display(settings.base_pace_minutes_per_kilometer, units);
  const ascent_display = minutes_per_100m_to_display(settings.ascent_penalty_minutes_per_hundred_meters, units);
  const descent_display = minutes_per_100m_to_display(settings.descent_time_minutes_per_hundred_meters, units);

  const update_settings = (changes: Partial<PlanSettings>) => {
    set_settings((previous_settings) => ({ ...previous_settings, ...changes }));
  };

  const cutoff_status_classes: Record<CutoffStatus, string> = {
    none: "text-zinc-400 dark:text-zinc-500",
    ok: "text-emerald-700 dark:text-emerald-400",
    tight: "text-amber-700 dark:text-amber-400",
    missed: "text-red-700 dark:text-red-400 font-semibold",
  };

  const slack_text_for = (checkpoint: CalculatedCheckpointDetails): string => {
    if (checkpoint.slack_minutes === null) {
      return t("planner_slack_none");
    }
    if (checkpoint.cutoff_status === "missed") {
      return t("planner_slack_missed", { minutes: Math.abs(checkpoint.slack_minutes) });
    }
    if (checkpoint.cutoff_status === "tight") {
      return t("planner_slack_tight", { minutes: checkpoint.slack_minutes });
    }
    return t("planner_slack_ok", { minutes: checkpoint.slack_minutes });
  };

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
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t("planner_back_to_uploader")}
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
            {parsed_gpx_data.track_name}
          </h1>
        </div>

        {/* Action button bar */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <SettingsControls />

          {/* Dark Mode toggle */}
          <button
            onClick={() => set_is_dark_mode(!is_dark_mode)}
            className="p-2.5 rounded-xl glass-panel glass-panel-hover text-zinc-700 dark:text-zinc-300 cursor-pointer"
            title={is_dark_mode ? t("planner_toggle_to_light") : t("planner_toggle_to_dark")}
            aria-label={is_dark_mode ? t("planner_toggle_to_light") : t("planner_toggle_to_dark")}
          >
            {is_dark_mode ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {t("planner_export_pdf")}
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Hand: Settings form and parameters panel */}
        <div className="space-y-6 lg:col-span-1">
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-semibold mb-5 text-zinc-900 dark:text-white border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
              {t("planner_pacing_heading")}
            </h2>
            <div className="space-y-4">

              {/* Base Pace Input */}
              <div>
                <label htmlFor="base-pace-number" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  {t("planner_base_pace_label", { unit: pace_unit })}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={pace_slider_minimum}
                    max={pace_slider_maximum}
                    step="0.1"
                    value={base_pace_display}
                    onChange={(event) =>
                      update_settings({ base_pace_minutes_per_kilometer: display_pace_to_per_kilometre(parseFloat(event.target.value), units) })
                    }
                    className="flex-1 accent-zinc-900 dark:accent-white"
                    aria-label={t("planner_base_pace_slider_aria")}
                  />
                  <input
                    id="base-pace-number"
                    type="number"
                    step="0.1"
                    value={parseFloat(base_pace_display.toFixed(2))}
                    onChange={(event) =>
                      apply_typed_number(event.target.value, (display_value) =>
                        update_settings({ base_pace_minutes_per_kilometer: display_pace_to_per_kilometre(display_value, units) })
                      )
                    }
                    onBlur={() =>
                      update_settings({
                        base_pace_minutes_per_kilometer: display_pace_to_per_kilometre(
                          clamp_number(base_pace_display, pace_slider_minimum, pace_slider_maximum),
                          units
                        ),
                      })
                    }
                    className="w-16 text-center text-sm font-semibold glass-input"
                    aria-label={t("planner_base_pace_label", { unit: pace_unit })}
                  />
                </div>
              </div>

              {/* Ascent Delay Penalty Input */}
              <div>
                <label htmlFor="ascent-penalty-number" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  {t("planner_ascent_label", { unit: climb_unit })}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={climb_slider_maximum}
                    step="0.1"
                    value={ascent_display}
                    onChange={(event) =>
                      update_settings({ ascent_penalty_minutes_per_hundred_meters: display_to_minutes_per_100m(parseFloat(event.target.value), units) })
                    }
                    className="flex-1 accent-zinc-900 dark:accent-white"
                    aria-label={t("planner_ascent_slider_aria")}
                  />
                  <input
                    id="ascent-penalty-number"
                    type="number"
                    min="0"
                    max={climb_input_maximum}
                    step="0.1"
                    value={parseFloat(ascent_display.toFixed(2))}
                    onChange={(event) =>
                      apply_typed_number(event.target.value, (display_value) =>
                        update_settings({ ascent_penalty_minutes_per_hundred_meters: display_to_minutes_per_100m(display_value, units) })
                      )
                    }
                    onBlur={() =>
                      update_settings({
                        ascent_penalty_minutes_per_hundred_meters: display_to_minutes_per_100m(
                          clamp_number(ascent_display, 0, climb_input_maximum),
                          units
                        ),
                      })
                    }
                    className="w-16 text-center text-sm font-semibold glass-input"
                    aria-label={t("planner_ascent_label", { unit: climb_unit })}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block mt-1">
                  {t("planner_naismith_note", { value: format_climb_allowance(10), unit: climb_unit })}
                </span>
              </div>

              {/* Descent Time Input */}
              <div>
                <label htmlFor="descent-time-number" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  {t("planner_descent_label", { unit: climb_unit })}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={minutes_per_100m_to_display(descent_limits_per_100_metres.maximum, units)}
                    step="0.1"
                    value={descent_display}
                    onChange={(event) =>
                      update_settings({ descent_time_minutes_per_hundred_meters: display_to_minutes_per_100m(parseFloat(event.target.value), units) })
                    }
                    className="flex-1 accent-zinc-900 dark:accent-white"
                    aria-label={t("planner_descent_slider_aria")}
                  />
                  <input
                    id="descent-time-number"
                    type="number"
                    min="0"
                    max={descent_input_maximum}
                    step="0.1"
                    value={parseFloat(descent_display.toFixed(2))}
                    onChange={(event) =>
                      apply_typed_number(event.target.value, (display_value) =>
                        update_settings({ descent_time_minutes_per_hundred_meters: display_to_minutes_per_100m(display_value, units) })
                      )
                    }
                    onBlur={() =>
                      update_settings({
                        descent_time_minutes_per_hundred_meters: display_to_minutes_per_100m(
                          clamp_number(descent_display, 0, descent_input_maximum),
                          units
                        ),
                      })
                    }
                    className="w-16 text-center text-sm font-semibold glass-input"
                    aria-label={t("planner_descent_label", { unit: climb_unit })}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block mt-1">
                  {t("planner_descent_note")}
                </span>
              </div>

              {/* Start Time Input */}
              <div>
                <label htmlFor="start-time-input" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  {t("planner_start_time_label")}
                </label>
                <input
                  id="start-time-input"
                  type="time"
                  value={settings.start_time_string}
                  onChange={(event) => {
                    // Ignore a cleared field so the planner keeps the last valid start time
                    if (event.target.value) {
                      update_settings({ start_time_string: event.target.value });
                    }
                  }}
                  className="w-full text-sm font-semibold glass-input"
                />
              </div>

              {/* Race Date Input */}
              <div>
                <label htmlFor="race-date-input" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  {t("planner_race_date_label")}
                </label>
                <input
                  id="race-date-input"
                  type="date"
                  value={settings.race_date_string}
                  onChange={(event) => {
                    if (event.target.value) {
                      update_settings({ race_date_string: event.target.value });
                    }
                  }}
                  className="w-full text-sm font-semibold glass-input"
                />
              </div>

              {/* Emergency Safety Contacts Input */}
              <div>
                <label htmlFor="emergency-contacts-input" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  {t("planner_contacts_label")}
                </label>
                <textarea
                  id="emergency-contacts-input"
                  value={emergency_contacts_text}
                  onChange={(event) => set_emergency_contacts_text(event.target.value)}
                  placeholder={t("planner_contacts_placeholder")}
                  aria-label={t("planner_contacts_aria")}
                  rows={3}
                  className="w-full text-sm glass-input resize-none"
                />
              </div>

            </div>
          </div>

          {/* Quick summary statistics */}
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-white border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
              {t("planner_route_details")}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">{t("planner_stat_distance")}</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  {format_distance_kilometres(total_distance_kilometers, 2)} {distance_unit}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">{t("planner_stat_gain")}</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  +{format_elevation_metres(parsed_gpx_data.total_elevation_gain_meters)} {elevation_unit}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">{t("planner_stat_loss")}</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  -{format_elevation_metres(parsed_gpx_data.total_elevation_loss_meters)} {elevation_unit}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">{t("planner_stat_checkpoints")}</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  {calculated_checkpoint_details_list.length}
                </span>
              </div>
            </div>

            {/* Removes the saved track and plan from this browser */}
            <div className="mt-6 text-right">
              <button
                type="button"
                onClick={handle_clear_saved_data}
                className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                {t("clear_button")}
              </button>
            </div>
          </div>
        </div>

        {/* Right Hand: Canvas profile, checkpoint scheduler and SMS exporters */}
        <div className="space-y-6 lg:col-span-2">

          {/* Interactive HTML5 Elevation Profile Canvas Container */}
          <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {t("planner_profile_heading")}
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("planner_profile_hint")}
              </span>
            </div>

            <div className="relative">
              <canvas
                ref={canvas_reference}
                role="img"
                aria-label={t("planner_profile_aria")}
                onPointerMove={handle_canvas_pointer_move}
                onPointerLeave={handle_canvas_pointer_leave}
                onClick={handle_canvas_click}
                className="w-full block bg-zinc-50/50 dark:bg-zinc-900/30 rounded-xl cursor-crosshair border border-zinc-200/50 dark:border-zinc-800/50 touch-pan-y"
                style={{ height: `${profile_canvas_height_pixels}px` }}
              />

              {/* Floating Tooltip displaying details on canvas hover */}
              {hovered_point_info && (
                <div className="absolute top-4 left-16 glass-panel px-3 py-2 rounded-xl text-xs space-y-1 z-10 shadow-lg border border-zinc-200/80 dark:border-zinc-800/80 pointer-events-none">
                  <div><span className="text-zinc-500 dark:text-zinc-400">{t("planner_tooltip_distance")}</span> <span className="font-bold">{hovered_point_info.distance} {distance_unit}</span></div>
                  <div><span className="text-zinc-500 dark:text-zinc-400">{t("planner_tooltip_elevation")}</span> <span className="font-bold">{hovered_point_info.elevation} {elevation_unit}</span></div>
                  <div><span className="text-zinc-500 dark:text-zinc-400">{t("planner_tooltip_gain")}</span> <span className="font-bold">+{hovered_point_info.gain} {elevation_unit}</span></div>
                  <div><span className="text-zinc-500 dark:text-zinc-400">{t("planner_tooltip_eta")}</span> <span className="font-bold text-zinc-900 dark:text-white">{hovered_point_info.eta}</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Checkpoint Table list planner */}
          <div className="glass-panel p-6 rounded-2xl">
            <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-white border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
              {t("planner_checkpoint_heading")}
            </h2>

            {/* Checkpoint manual addition form. Range limits are applied by the handler, not by native validation. */}
            <form onSubmit={handle_add_checkpoint} noValidate className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  ref={checkpoint_name_input_reference}
                  placeholder={t("planner_name_placeholder")}
                  aria-label={t("planner_name_aria")}
                  value={new_checkpoint_name_string}
                  onChange={(event) => set_new_checkpoint_name_string(event.target.value)}
                  className="w-full text-sm glass-input"
                />
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder={t("planner_distance_placeholder")}
                    aria-label={t("planner_distance_aria", { unit: distance_unit })}
                    value={new_checkpoint_distance_number || ""}
                    onChange={(event) => set_new_checkpoint_distance_number(parseFloat(event.target.value) || 0)}
                    className="w-full text-sm glass-input pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 dark:text-zinc-400 font-semibold" aria-hidden="true">
                    {distance_unit}
                  </span>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 rounded-lg text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors flex items-center justify-center cursor-pointer"
                >
                  {t("planner_add_button")}
                </button>
              </div>
            </form>

            {/* Scrollable checklist container */}
            <div className="overflow-x-auto border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 border-b border-zinc-200/80 dark:border-zinc-800/80">
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_number")}</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_name")}</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_distance")} ({distance_unit})</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_elevation")} ({elevation_unit})</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_gain")}</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_eta")}</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_elapsed")}</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_stop")}</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_cutoff")}</th>
                    <th className="p-3 font-semibold text-xs uppercase tracking-wider">{t("planner_table_slack")}</th>
                    <th className="p-3 text-right"><span className="sr-only">{t("planner_table_actions")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
                  {calculated_checkpoint_details_list.map((checkpoint, index) => {
                    const label = get_checkpoint_label(index, calculated_checkpoint_details_list.length);
                    const source_checkpoint = checkpoints_list.find((candidate) => candidate.id === checkpoint.id);
                    const name_for_display = display_checkpoint_name(checkpoint.id, checkpoint.name);
                    const is_user_checkpoint = checkpoint.id !== start_point_id && checkpoint.id !== finish_point_id;

                    return (
                      <tr key={checkpoint.id} className="hover:bg-zinc-50/40 dark:hover:bg-zinc-900/20 transition-colors">
                        <td className="p-3 font-bold text-zinc-500 dark:text-zinc-500">{label}</td>
                        <td className="p-3 font-medium text-zinc-900 dark:text-white">{name_for_display}</td>
                        <td className="p-3">{format_distance_kilometres(checkpoint.distance_kilometers, 2)} {distance_unit}</td>
                        <td className="p-3">{format_elevation_metres(checkpoint.elevation_meters)} {elevation_unit}</td>
                        <td className="p-3 text-zinc-600 dark:text-zinc-400">+{format_elevation_metres(checkpoint.cumulative_gain_meters)} {elevation_unit}</td>
                        <td className="p-3 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{checkpoint.eta_time_string}</td>
                        <td className="p-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {format_elapsed_hours_minutes(checkpoint.elapsed_time_minutes, (hours, minutes) => t("planner_elapsed_hours_minutes", { hours, minutes }), (minutes) => t("planner_elapsed_minutes", { minutes }))}
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={source_checkpoint?.stop_minutes ?? 0}
                            onChange={(event) =>
                              apply_typed_number(event.target.value, (minutes) =>
                                update_checkpoint(checkpoint.id, { stop_minutes: Math.max(0, minutes) })
                              )
                            }
                            aria-label={t("planner_stop_aria", { name: name_for_display })}
                            className="w-16 text-center text-sm glass-input"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="datetime-local"
                            value={source_checkpoint?.cutoff_datetime_string ?? ""}
                            onChange={(event) => update_checkpoint(checkpoint.id, { cutoff_datetime_string: event.target.value })}
                            aria-label={t("planner_cutoff_aria", { name: name_for_display })}
                            className="text-xs glass-input"
                          />
                        </td>
                        <td className={`p-3 whitespace-nowrap text-xs ${cutoff_status_classes[checkpoint.cutoff_status]}`}>
                          {slack_text_for(checkpoint)}
                        </td>
                        <td className="p-3 text-right">
                          {is_user_checkpoint && (
                            <button
                              onClick={() => handle_delete_checkpoint(checkpoint.id)}
                              className="text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                              title={t("planner_delete_aria", { name: name_for_display })}
                              aria-label={t("planner_delete_aria", { name: name_for_display })}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
                {t("planner_sms_heading")}
              </h2>
              <div className="flex gap-2">
                {/* Copy Button */}
                <button
                  onClick={handle_copy_sms_payload}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold glass-panel glass-panel-hover flex items-center gap-1.5 cursor-pointer text-zinc-800 dark:text-zinc-200"
                >
                  {copy_status === "copied" && t("planner_sms_copied")}
                  {copy_status === "failed" && t("planner_sms_copy_failed")}
                  {copy_status === "idle" && (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      {t("planner_sms_copy")}
                    </>
                  )}
                </button>
                {/* Native Launch SMS Button */}
                <a
                  href={`sms:?body=${encodeURIComponent(build_sms_payload_string())}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {t("planner_sms_send")}
                </a>
              </div>
            </div>

            {/* Displaying raw text density layout */}
            <div className="bg-zinc-100/50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 font-mono text-xs whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed overflow-y-auto max-h-[160px]">
              {build_sms_payload_string()}
            </div>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block mt-2">
              {t("planner_sms_hint")}
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
