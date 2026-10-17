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
  climb_unit_label,
  display_distance_to_kilometres,
  display_pace_to_per_kilometre,
  display_to_minutes_per_100m,
  kilometres_to_display_distance,
  metres_to_display_elevation,
  minutes_per_100m_to_display,
  pace_per_kilometre_to_display,
} from "./units";

describe("unit conversions", () => {
  it("leaves metric values unchanged", () => {
    expect(kilometres_to_display_distance(10, "metric")).toBe(10);
    expect(metres_to_display_elevation(500, "metric")).toBe(500);
    expect(pace_per_kilometre_to_display(6, "metric")).toBe(6);
    expect(minutes_per_100m_to_display(10, "metric")).toBe(10);
  });

  it("converts distance, elevation and pace to imperial", () => {
    expect(kilometres_to_display_distance(10, "imperial")).toBeCloseTo(6.2137, 3);
    expect(metres_to_display_elevation(1000, "imperial")).toBeCloseTo(3280.84, 1);
    expect(pace_per_kilometre_to_display(6, "imperial")).toBeCloseTo(9.656, 2);
  });

  it("converts a climb allowance to minutes per 100 ft", () => {
    // 100 ft is 30.48 m, so 10 minutes per 100 m becomes about 3.05 minutes per 100 ft
    expect(minutes_per_100m_to_display(10, "imperial")).toBeCloseTo(3.048, 3);
    expect(climb_unit_label("imperial")).toBe("min/100 ft");
  });

  it("round-trips typed values back to metric", () => {
    expect(display_distance_to_kilometres(kilometres_to_display_distance(12.5, "imperial"), "imperial")).toBeCloseTo(12.5, 9);
    expect(display_pace_to_per_kilometre(pace_per_kilometre_to_display(5.25, "imperial"), "imperial")).toBeCloseTo(5.25, 9);
    expect(display_to_minutes_per_100m(minutes_per_100m_to_display(7, "imperial"), "imperial")).toBeCloseTo(7, 9);
  });
});
