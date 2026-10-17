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
 * The unit system shown in the planner. All calculations stay metric internally;
 * conversion happens only at the edges, for display and for typed input.
 */
export type UnitSystem = "metric" | "imperial";

const kilometres_per_mile = 1.609344;
const metres_per_foot = 0.3048;

/**
 * Converts kilometres into the distance unit shown to the user.
 */
export function kilometres_to_display_distance(kilometres: number, units: UnitSystem): number {
  return units === "imperial" ? kilometres / kilometres_per_mile : kilometres;
}

/**
 * Converts a distance typed in the shown unit back into kilometres.
 */
export function display_distance_to_kilometres(display_value: number, units: UnitSystem): number {
  return units === "imperial" ? display_value * kilometres_per_mile : display_value;
}

/**
 * Short label for the distance unit.
 */
export function distance_unit_label(units: UnitSystem): string {
  return units === "imperial" ? "mi" : "km";
}

/**
 * Converts metres into the elevation unit shown to the user.
 */
export function metres_to_display_elevation(metres: number, units: UnitSystem): number {
  return units === "imperial" ? metres / metres_per_foot : metres;
}

/**
 * Short label for the elevation unit.
 */
export function elevation_unit_label(units: UnitSystem): string {
  return units === "imperial" ? "ft" : "m";
}

/**
 * Converts a pace in minutes per kilometre into the shown pace (minutes per mile when imperial).
 */
export function pace_per_kilometre_to_display(minutes_per_kilometre: number, units: UnitSystem): number {
  return units === "imperial" ? minutes_per_kilometre * kilometres_per_mile : minutes_per_kilometre;
}

/**
 * Converts a typed pace back into minutes per kilometre.
 */
export function display_pace_to_per_kilometre(display_value: number, units: UnitSystem): number {
  return units === "imperial" ? display_value / kilometres_per_mile : display_value;
}

/**
 * Short label for the pace unit.
 */
export function pace_unit_label(units: UnitSystem): string {
  return units === "imperial" ? "min/mi" : "min/km";
}

/**
 * Converts a climb or descent allowance from minutes per 100 m into the shown unit (per 100 ft when imperial).
 */
export function minutes_per_100m_to_display(minutes_per_100_metres: number, units: UnitSystem): number {
  // 100 ft is 30.48 m, so a climb of 100 ft costs 0.3048 times the allowance for 100 m
  return units === "imperial" ? minutes_per_100_metres * metres_per_foot : minutes_per_100_metres;
}

/**
 * Converts a typed climb or descent allowance back into minutes per 100 m.
 */
export function display_to_minutes_per_100m(display_value: number, units: UnitSystem): number {
  return units === "imperial" ? display_value / metres_per_foot : display_value;
}

/**
 * Short label for the climb and descent allowance unit.
 */
export function climb_unit_label(units: UnitSystem): string {
  return units === "imperial" ? "min/100 ft" : "min/100 m";
}
