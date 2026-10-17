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

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { detect_language_from_browser, translate, type Language } from "./messages";
import { SettingsContext, type SettingsContextValue } from "./settings_context";
import type { UnitSystem } from "../utils/units";
import {
  load_language_preference,
  load_units_preference,
  save_language_preference,
  save_units_preference,
} from "../utils/plan_storage";

/**
 * Provides the language and unit choices to the whole app. Both are remembered between visits.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, set_language] = useState<Language>(() => load_language_preference() ?? detect_language_from_browser());
  const [units, set_units] = useState<UnitSystem>(() => load_units_preference() ?? "metric");

  // Keep the document language accurate for screen readers and hyphenation, and remember the choices
  useEffect(() => {
    document.documentElement.lang = language;
    save_language_preference(language);
  }, [language]);

  useEffect(() => {
    save_units_preference(units);
  }, [units]);

  const settings_value = useMemo<SettingsContextValue>(
    () => ({
      language,
      units,
      set_language,
      set_units,
      t: (message_key, parameters) => translate(language, message_key, parameters),
    }),
    [language, units]
  );

  return <SettingsContext.Provider value={settings_value}>{children}</SettingsContext.Provider>;
}
