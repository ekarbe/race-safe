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

import type { Language } from "../i18n/messages";
import { useSettings } from "../i18n/settings_context";
import type { UnitSystem } from "../utils/units";

/**
 * Language and unit selectors. They sit in the header of both screens.
 */
export default function SettingsControls() {
  const { t, language, units, set_language, set_units } = useSettings();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="language-select" className="sr-only">
        {t("settings_language")}
      </label>
      <select
        id="language-select"
        value={language}
        onChange={(event) => set_language(event.target.value as Language)}
        className="rounded-lg glass-input py-1.5 px-2 text-xs cursor-pointer"
      >
        <option value="en">{t("language_english")}</option>
        <option value="de">{t("language_german")}</option>
      </select>

      <label htmlFor="units-select" className="sr-only">
        {t("settings_units")}
      </label>
      <select
        id="units-select"
        value={units}
        onChange={(event) => set_units(event.target.value as UnitSystem)}
        className="rounded-lg glass-input py-1.5 px-2 text-xs cursor-pointer"
      >
        <option value="metric">{t("units_metric")}</option>
        <option value="imperial">{t("units_imperial")}</option>
      </select>
    </div>
  );
}
