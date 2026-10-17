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

import { describe, expect, it } from "vitest";
import {
  build_run_start_date,
  calculate_checkpoint_estimates,
  parse_cutoff_datetime,
  type PlanSettings,
  type UserCheckpoint,
} from "./elevation_pace_engine";
import type { ParsedGpxData, ParsedTrackPoint } from "./xml_gpx_parser";

const race_date_string = "2026-10-17";

const base_settings: PlanSettings = {
  base_pace_minutes_per_kilometer: 6,
  ascent_penalty_minutes_per_hundred_meters: 10,
  descent_time_minutes_per_hundred_meters: 0,
  start_time_string: "08:00",
  race_date_string,
};

/**
 * A flat track of 10 km with a point every kilometre, plus optional cumulative gain and loss per point.
 */
function build_flat_track(gain_per_kilometre_meters = 0, loss_per_kilometre_meters = 0): ParsedGpxData {
  const track_points: ParsedTrackPoint[] = Array.from({ length: 11 }, (_, kilometre) => ({
    latitude: 47,
    longitude: 11,
    elevation_meters: 1000,
    cumulative_distance_meters: kilometre * 1000,
    cumulative_gain_meters: kilometre * gain_per_kilometre_meters,
    cumulative_loss_meters: kilometre * loss_per_kilometre_meters,
  }));
  return {
    track_name: "Flat",
    total_distance_meters: 10000,
    total_elevation_gain_meters: 10 * gain_per_kilometre_meters,
    total_elevation_loss_meters: 10 * loss_per_kilometre_meters,
    track_points,
  };
}

const finish_checkpoint: UserCheckpoint = { id: "finish", name: "Finish", distance_kilometers: 10 };

describe("calculate_checkpoint_estimates", () => {
  it("gives the flat-pace arrival time", () => {
    const [finish] = calculate_checkpoint_estimates(build_flat_track(), [finish_checkpoint], base_settings);
    expect(finish.elapsed_time_minutes).toBe(60);
    expect(finish.eta_time_string).toBe("09:00");
  });

  it("moves every later arrival back by the stops before it", () => {
    const checkpoints: UserCheckpoint[] = [
      { id: "aid", name: "Aid", distance_kilometers: 5, stop_minutes: 15 },
      finish_checkpoint,
    ];
    const [aid, finish] = calculate_checkpoint_estimates(build_flat_track(), checkpoints, base_settings);
    expect(aid.eta_time_string).toBe("08:30");
    expect(finish.eta_time_string).toBe("09:15");
    expect(finish.elapsed_time_minutes).toBe(75);
  });

  it("reports the minutes left before a cut-off, and flags tight and missed ones", () => {
    const roomy = calculate_checkpoint_estimates(
      build_flat_track(),
      [{ ...finish_checkpoint, cutoff_datetime_string: "2026-10-17T10:00" }],
      base_settings
    )[0];
    expect(roomy.cutoff_status).toBe("ok");
    expect(roomy.slack_minutes).toBe(60);

    const tight = calculate_checkpoint_estimates(
      build_flat_track(),
      [{ ...finish_checkpoint, cutoff_datetime_string: "2026-10-17T09:10" }],
      base_settings
    )[0];
    expect(tight.cutoff_status).toBe("tight");
    expect(tight.slack_minutes).toBe(10);

    const missed = calculate_checkpoint_estimates(
      build_flat_track(),
      [{ ...finish_checkpoint, cutoff_datetime_string: "2026-10-17T08:50" }],
      base_settings
    )[0];
    expect(missed.cutoff_status).toBe("missed");
    expect(missed.slack_minutes).toBe(-10);
  });

  it("reports no cut-off status when none is set", () => {
    const [finish] = calculate_checkpoint_estimates(build_flat_track(), [finish_checkpoint], base_settings);
    expect(finish.cutoff_status).toBe("none");
    expect(finish.slack_minutes).toBeNull();
  });

  it("adds time for descents from the descent setting", () => {
    const settings: PlanSettings = { ...base_settings, descent_time_minutes_per_hundred_meters: 2 };
    const [finish] = calculate_checkpoint_estimates(build_flat_track(0, 100), [finish_checkpoint], settings);
    // 1000 m of loss at 2 minutes per 100 m adds 20 minutes to the 60 minutes of flat pace
    expect(finish.elapsed_time_minutes).toBe(80);
  });

  it("adds the climb allowance from the ascent penalty", () => {
    const [finish] = calculate_checkpoint_estimates(build_flat_track(100, 0), [finish_checkpoint], base_settings);
    // 1000 m of gain at 10 minutes per 100 m adds 100 minutes
    expect(finish.elapsed_time_minutes).toBe(160);
  });

  it("rolls past midnight with a day marker", () => {
    // 10 km at 12 min/km is 120 minutes: a 23:00 start arrives at 01:00 the next day
    const settings: PlanSettings = { ...base_settings, start_time_string: "23:00", base_pace_minutes_per_kilometer: 12 };
    const [finish] = calculate_checkpoint_estimates(build_flat_track(), [finish_checkpoint], settings);
    expect(finish.eta_time_string).toBe("01:00 (+1d)");
  });
});

describe("build_run_start_date", () => {
  it("uses the race date and start time", () => {
    const start = build_run_start_date({ ...base_settings, race_date_string: "2026-10-18", start_time_string: "06:30" });
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(18);
    expect(start.getHours()).toBe(6);
    expect(start.getMinutes()).toBe(30);
  });

  it("falls back to 08:00 for an unreadable start time", () => {
    const start = build_run_start_date({ ...base_settings, start_time_string: "bogus" });
    expect(start.getHours()).toBe(8);
    expect(start.getMinutes()).toBe(0);
  });
});

describe("parse_cutoff_datetime", () => {
  it("reads a local date and time", () => {
    const cutoff = parse_cutoff_datetime("2026-10-17T14:30");
    expect(cutoff?.getHours()).toBe(14);
    expect(cutoff?.getMinutes()).toBe(30);
  });

  it("returns null for blank or unreadable values", () => {
    expect(parse_cutoff_datetime("")).toBeNull();
    expect(parse_cutoff_datetime(undefined)).toBeNull();
    expect(parse_cutoff_datetime("tomorrow")).toBeNull();
  });
});
