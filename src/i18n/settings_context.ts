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

import { createContext, useContext } from "react";
import type { Language, MessageKey } from "./messages";
import type { UnitSystem } from "../utils/units";

/**
 * The language, unit system and translation function shared by every screen.
 */
export interface SettingsContextValue {
  language: Language;
  units: UnitSystem;
  set_language: (language: Language) => void;
  set_units: (units: UnitSystem) => void;
  t: (message_key: MessageKey, parameters?: Record<string, string | number>) => string;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Reads the shared settings. Must be used inside SettingsProvider.
 */
export function useSettings(): SettingsContextValue {
  const settings_value = useContext(SettingsContext);
  if (!settings_value) {
    throw new Error("useSettings must be used inside SettingsProvider.");
  }
  return settings_value;
}
