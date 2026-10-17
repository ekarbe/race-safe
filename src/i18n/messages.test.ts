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
import { format_number, message_dictionaries, translate, type MessageKey } from "./messages";

describe("message dictionaries", () => {
  it("contain the same keys in English and German", () => {
    const english_keys = Object.keys(message_dictionaries.en).sort();
    const german_keys = Object.keys(message_dictionaries.de).sort();
    expect(german_keys).toEqual(english_keys);
  });

  it("have no empty translations", () => {
    for (const language of ["en", "de"] as const) {
      for (const [message_key, message_text] of Object.entries(message_dictionaries[language])) {
        expect(message_text.trim(), `${language}.${message_key}`).not.toBe("");
      }
    }
  });

  it("use the same placeholders in both languages", () => {
    const placeholders_in = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const message_key of Object.keys(message_dictionaries.en) as MessageKey[]) {
      expect(placeholders_in(message_dictionaries.de[message_key]), message_key).toEqual(placeholders_in(message_dictionaries.en[message_key]));
    }
  });
});

describe("translate", () => {
  it("fills placeholders in the chosen language", () => {
    expect(translate("en", "planner_slack_ok", { minutes: 25 })).toBe("25 min spare");
    expect(translate("de", "planner_slack_ok", { minutes: 25 })).toBe("25 Min. Reserve");
  });

  it("leaves unknown placeholders visible", () => {
    expect(translate("en", "planner_slack_ok")).toBe("{minutes} min spare");
  });
});

describe("format_number", () => {
  it("uses a decimal comma in German and a point in English", () => {
    expect(format_number(6.5, 1, "en")).toBe("6.5");
    expect(format_number(6.5, 1, "de")).toBe("6,5");
  });
});
