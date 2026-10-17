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
 * Languages the interface can be shown in.
 */
export type Language = "en" | "de";

const english_messages = {
  app_footer_license: "RaceSafe © 2026. Free Software under the GNU GPL v3 License.",
  app_footer_local: "Running 100% locally in browser memory. Works offline after the first visit.",
  app_loading_planner: "Loading GPX track planner...",

  dash_subtitle: "Provide trail and ultra-runners with an offline-accessible, GPX-driven safety planner. Calculate elevation-adjusted ETAs and generate instantly shareable emergency communications without cell service.",
  dash_feature_elevation_title: "Adjusts for Elevation",
  dash_feature_elevation_body: "Uses Naismith's Rule to automatically adjust flat pacing templates based on slope gains.",
  dash_feature_offline_title: "Offline-First Design",
  dash_feature_offline_body: "Runs entirely in the browser using HTML5 local structures, meaning it requires zero cell service.",
  dash_feature_copy_title: "Instant Copy Payloads",
  dash_feature_copy_body: "Generates tight, character-dense SMS messages with route summaries and ETAs for emergency use.",
  dash_upload_heading: "Upload GPX Route File",
  dash_drop_text: "Drag and drop your GPX file here",
  dash_drop_hint: "or click, or press Enter, to browse your local device",
  dash_drop_aria: "Choose a GPX file to upload, or drop one here",
  dash_error_extension: "Please upload a file with the .gpx extension. Other formats are not supported.",
  dash_error_read: "Failed to read the file from disk. Please try uploading it again.",
  dash_error_too_large: "This GPX file is too large to save in this browser for offline use. Try a shorter file, or one exported with fewer points.",
  dash_error_invalid_xml: "Failed to parse the GPX file. The file does not appear to be valid XML.",
  dash_error_no_points: "No track or route points found in the GPX file. Make sure it contains a track (trkpt) or a route (rtept).",
  dash_error_no_coordinates: "The GPX file has track points, but none of them have usable latitude and longitude values.",
  dash_error_parse_default: "An error occurred while parsing the GPX track. Please ensure the file is valid.",

  clear_button: "Clear saved track and plan",
  clear_confirm: "Delete the saved track, checkpoints and emergency contacts from this browser?",
  clear_done: "Saved track and plan removed.",

  settings_language: "Language",
  settings_units: "Units",
  language_english: "English",
  language_german: "Deutsch",
  units_metric: "Metric (km, m)",
  units_imperial: "Imperial (mi, ft)",

  planner_back_to_uploader: "Back to Uploader",
  planner_toggle_to_light: "Switch to light theme",
  planner_toggle_to_dark: "Switch to dark theme",
  planner_export_pdf: "Export PDF",
  planner_pacing_heading: "Pacing Parameters",
  planner_base_pace_label: "Base Pace ({unit})",
  planner_base_pace_slider_aria: "Base pace slider",
  planner_ascent_label: "Ascent Penalty ({unit} climb)",
  planner_ascent_slider_aria: "Ascent penalty slider",
  planner_naismith_note: "Naismith's Rule standard is {value} {unit}.",
  planner_descent_label: "Descent Time ({unit} descent)",
  planner_descent_slider_aria: "Descent time slider",
  planner_descent_note: "Extra time for each descent. 0 keeps the classic model.",
  planner_start_time_label: "Run Start Time",
  planner_race_date_label: "Race Date",
  planner_contacts_label: "Emergency Contacts / Notes",
  planner_contacts_placeholder: "e.g. SAR: +15551234, Crew: +15555678, medical info...",
  planner_contacts_aria: "Emergency contacts and notes",
  planner_route_details: "Route Details",
  planner_stat_distance: "Distance",
  planner_stat_gain: "Elevation Gain",
  planner_stat_loss: "Elevation Loss",
  planner_stat_checkpoints: "Checkpoints",
  planner_profile_heading: "Elevation Profile",
  planner_profile_hint: "Click graph to place new checkpoint at distance",
  planner_profile_aria: "Elevation profile of the planned route. Hover or touch for distance and ETA. Click to place a checkpoint.",
  planner_tooltip_distance: "Dist:",
  planner_tooltip_elevation: "Elev:",
  planner_tooltip_gain: "Gain:",
  planner_tooltip_eta: "ETA:",
  planner_checkpoint_heading: "Checkpoint Planner",
  planner_name_placeholder: "Checkpoint Name (e.g. Aid Station 1)",
  planner_name_aria: "Checkpoint name",
  planner_distance_placeholder: "Distance",
  planner_distance_aria: "Checkpoint distance in {unit}",
  planner_add_button: "Add",
  planner_table_number: "#",
  planner_table_name: "Name",
  planner_table_distance: "Distance",
  planner_table_elevation: "Elevation",
  planner_table_gain: "Gain",
  planner_table_eta: "ETA",
  planner_table_elapsed: "Elapsed",
  planner_table_stop: "Stop (min)",
  planner_table_cutoff: "Cut-off",
  planner_table_slack: "Slack",
  planner_table_actions: "Actions",
  planner_stop_aria: "Stop time at {name} in minutes",
  planner_cutoff_aria: "Cut-off at {name}",
  planner_slack_missed: "Missed by {minutes} min",
  planner_slack_tight: "Tight: {minutes} min",
  planner_slack_ok: "{minutes} min spare",
  planner_slack_none: "-",
  planner_delete_aria: "Delete checkpoint {name}",
  planner_start_name: "Start",
  planner_finish_name: "Finish",
  planner_default_checkpoint_name: "Checkpoint {number}",
  planner_elapsed_hours_minutes: "{hours}h {minutes}m",
  planner_elapsed_minutes: "{minutes}m",
  planner_sms_heading: "Emergency SMS Payload",
  planner_sms_copy: "Copy Payload",
  planner_sms_copied: "Copied!",
  planner_sms_copy_failed: "Copy failed. Select the text below instead.",
  planner_sms_send: "Send SMS",
  planner_sms_hint: "Character-dense SMS structures are designed to send in low signal environments. Verify text content before copying or sending.",

  pdf_title: "RaceSafe Route Plan",
  pdf_route_name: "Route Name: {name}",
  pdf_created: "Created on: {date}",
  pdf_route_summary: "Route Summary:",
  pdf_summary_line: "Distance: {distance} {distance_unit}  |  Gain: +{gain} {elevation_unit}  |  Loss: -{loss} {elevation_unit}",
  pdf_settings_line: "Base Pace: {pace} {pace_unit}  |  Ascent: {climb} {climb_unit}  |  Descent: {descent} {climb_unit}  |  Race date: {race_date}  |  Start: {start}",
  pdf_schedule_heading: "Checkpoint Schedule",
  pdf_col_name: "Checkpoint Name",
  pdf_col_distance: "Dist",
  pdf_col_elevation: "Elev",
  pdf_col_gain: "Gain",
  pdf_col_eta: "ETA",
  pdf_col_elapsed: "Elapsed",
  pdf_col_reserve: "Slack",
  pdf_contacts_heading: "Emergency Contacts & Instructions:",

  sms_title: "RaceSafe Plan: {name}",
  sms_totals: "Dist: {distance}{distance_unit} | Gain: +{gain}{elevation_unit}",
  sms_start: "Start: {start} | Pace: {pace}{pace_unit}",
  sms_etas_heading: "ETAs:",
  sms_eta_line: "- {name}: {eta} ({distance_unit} {distance}, +{elapsed})",
  sms_contacts: "Contacts: {contacts}",
  sms_footer: "Generated with RaceSafe",
} as const;

/**
 * Every message key the app uses.
 */
export type MessageKey = keyof typeof english_messages;

const german_messages: Record<MessageKey, string> = {
  app_footer_license: "RaceSafe © 2026. Freie Software unter der GNU GPL v3.",
  app_footer_local: "Läuft zu 100 % lokal im Browserspeicher. Funktioniert offline nach dem ersten Besuch.",
  app_loading_planner: "Planer wird geladen ...",

  dash_subtitle: "Ein offline nutzbarer, GPX-basierter Sicherheitsplaner für Trail- und Ultraläufer. Berechnet höhenangepasste Ankunftszeiten und erstellt sofort teilbare Notfallnachrichten ohne Mobilfunkempfang.",
  dash_feature_elevation_title: "Berücksichtigt Höhenmeter",
  dash_feature_elevation_body: "Passt die Tempovorlage für Flachstücke nach Naismith automatisch an die Steigungen an.",
  dash_feature_offline_title: "Offline zuerst",
  dash_feature_offline_body: "Läuft vollständig im Browser mit lokalem Speicher und braucht keinen Mobilfunkempfang.",
  dash_feature_copy_title: "Sofort kopierbare Nachrichten",
  dash_feature_copy_body: "Erstellt kompakte SMS mit Streckenübersicht und Ankunftszeiten für Notfälle.",
  dash_upload_heading: "GPX-Routendatei hochladen",
  dash_drop_text: "GPX-Datei hierher ziehen und ablegen",
  dash_drop_hint: "oder klicken bzw. Enter drücken, um auf dem Gerät zu suchen",
  dash_drop_aria: "GPX-Datei zum Hochladen auswählen oder hier ablegen",
  dash_error_extension: "Bitte lade eine Datei mit der Endung .gpx hoch. Andere Formate werden nicht unterstützt.",
  dash_error_read: "Die Datei konnte nicht gelesen werden. Bitte versuche es erneut.",
  dash_error_too_large: "Diese GPX-Datei ist zu groß, um sie für die Offline-Nutzung in diesem Browser zu speichern. Versuche eine kürzere Datei oder eine mit weniger Punkten.",
  dash_error_invalid_xml: "Die GPX-Datei konnte nicht gelesen werden. Sie scheint kein gültiges XML zu sein.",
  dash_error_no_points: "In der GPX-Datei wurden keine Strecken- oder Routenpunkte gefunden. Sie muss einen Track (trkpt) oder eine Route (rtept) enthalten.",
  dash_error_no_coordinates: "Die GPX-Datei hat Punkte, aber keiner davon hat gültige Breiten- und Längengrade.",
  dash_error_parse_default: "Beim Lesen der GPX-Strecke ist ein Fehler aufgetreten. Bitte prüfe, ob die Datei gültig ist.",

  clear_button: "Gespeicherte Strecke und Plan löschen",
  clear_confirm: "Gespeicherte Strecke, Checkpoints und Notfallkontakte aus diesem Browser löschen?",
  clear_done: "Gespeicherte Strecke und Plan wurden entfernt.",

  settings_language: "Sprache",
  settings_units: "Einheiten",
  language_english: "English",
  language_german: "Deutsch",
  units_metric: "Metrisch (km, m)",
  units_imperial: "Imperial (mi, ft)",

  planner_back_to_uploader: "Zurück zum Hochladen",
  planner_toggle_to_light: "Zu hellem Design wechseln",
  planner_toggle_to_dark: "Zu dunklem Design wechseln",
  planner_export_pdf: "PDF exportieren",
  planner_pacing_heading: "Tempo-Einstellungen",
  planner_base_pace_label: "Grundtempo ({unit})",
  planner_base_pace_slider_aria: "Grundtempo-Regler",
  planner_ascent_label: "Zeitzuschlag Anstieg ({unit})",
  planner_ascent_slider_aria: "Regler Zeitzuschlag Anstieg",
  planner_naismith_note: "Der Standardwert nach Naismith liegt bei {value} {unit}.",
  planner_descent_label: "Zeitzuschlag Abstieg ({unit})",
  planner_descent_slider_aria: "Regler Zeitzuschlag Abstieg",
  planner_descent_note: "Zusätzliche Zeit für jeden Abstieg. 0 entspricht dem klassischen Modell.",
  planner_start_time_label: "Startzeit",
  planner_race_date_label: "Renndatum",
  planner_contacts_label: "Notfallkontakte / Notizen",
  planner_contacts_placeholder: "z. B. Bergwacht: +49 …, Crew: +49 …, medizinische Hinweise …",
  planner_contacts_aria: "Notfallkontakte und Notizen",
  planner_route_details: "Streckendetails",
  planner_stat_distance: "Strecke",
  planner_stat_gain: "Anstieg",
  planner_stat_loss: "Abstieg",
  planner_stat_checkpoints: "Checkpoints",
  planner_profile_heading: "Höhenprofil",
  planner_profile_hint: "Ins Profil klicken, um einen Checkpoint an dieser Stelle zu setzen",
  planner_profile_aria: "Höhenprofil der geplanten Strecke. Mit Maus oder Finger Strecke und Ankunft ablesen. Klicken setzt einen Checkpoint.",
  planner_tooltip_distance: "Strecke:",
  planner_tooltip_elevation: "Höhe:",
  planner_tooltip_gain: "Anstieg:",
  planner_tooltip_eta: "Ankunft:",
  planner_checkpoint_heading: "Checkpoint-Planer",
  planner_name_placeholder: "Checkpoint-Name (z. B. Verpflegung 1)",
  planner_name_aria: "Checkpoint-Name",
  planner_distance_placeholder: "Strecke",
  planner_distance_aria: "Checkpoint-Strecke in {unit}",
  planner_add_button: "Hinzufügen",
  planner_table_number: "#",
  planner_table_name: "Name",
  planner_table_distance: "Strecke",
  planner_table_elevation: "Höhe",
  planner_table_gain: "Anstieg",
  planner_table_eta: "Ankunft",
  planner_table_elapsed: "Dauer",
  planner_table_stop: "Pause (min)",
  planner_table_cutoff: "Cut-off",
  planner_table_slack: "Reserve",
  planner_table_actions: "Aktionen",
  planner_stop_aria: "Pausenzeit bei {name} in Minuten",
  planner_cutoff_aria: "Cut-off bei {name}",
  planner_slack_missed: "Um {minutes} Min. verpasst",
  planner_slack_tight: "Knapp: {minutes} Min.",
  planner_slack_ok: "{minutes} Min. Reserve",
  planner_slack_none: "-",
  planner_delete_aria: "Checkpoint {name} löschen",
  planner_start_name: "Start",
  planner_finish_name: "Ziel",
  planner_default_checkpoint_name: "Checkpoint {number}",
  planner_elapsed_hours_minutes: "{hours} h {minutes} min",
  planner_elapsed_minutes: "{minutes} min",
  planner_sms_heading: "Notfall-SMS",
  planner_sms_copy: "Text kopieren",
  planner_sms_copied: "Kopiert!",
  planner_sms_copy_failed: "Kopieren fehlgeschlagen. Markiere stattdessen den Text unten.",
  planner_sms_send: "SMS senden",
  planner_sms_hint: "Kompakte SMS sind für schwachen Empfang gedacht. Prüfe den Text vor dem Kopieren oder Senden.",

  pdf_title: "RaceSafe Streckenplan",
  pdf_route_name: "Streckenname: {name}",
  pdf_created: "Erstellt am: {date}",
  pdf_route_summary: "Streckenübersicht:",
  pdf_summary_line: "Strecke: {distance} {distance_unit}  |  Anstieg: +{gain} {elevation_unit}  |  Abstieg: -{loss} {elevation_unit}",
  pdf_settings_line: "Grundtempo: {pace} {pace_unit}  |  Anstieg: {climb} {climb_unit}  |  Abstieg: {descent} {climb_unit}  |  Renndatum: {race_date}  |  Start: {start}",
  pdf_schedule_heading: "Checkpoint-Zeitplan",
  pdf_col_name: "Checkpoint",
  pdf_col_distance: "Strecke",
  pdf_col_elevation: "Höhe",
  pdf_col_gain: "Anstieg",
  pdf_col_eta: "Ankunft",
  pdf_col_elapsed: "Dauer",
  pdf_col_reserve: "Reserve",
  pdf_contacts_heading: "Notfallkontakte und Hinweise:",

  sms_title: "RaceSafe-Plan: {name}",
  sms_totals: "Strecke: {distance}{distance_unit} | Anstieg: +{gain}{elevation_unit}",
  sms_start: "Start: {start} | Tempo: {pace}{pace_unit}",
  sms_etas_heading: "Ankünfte:",
  sms_eta_line: "- {name}: {eta} ({distance_unit} {distance}, +{elapsed})",
  sms_contacts: "Kontakte: {contacts}",
  sms_footer: "Erstellt mit RaceSafe",
};

/**
 * The dictionary for each language. Both must contain every key.
 */
export const message_dictionaries: Record<Language, Record<MessageKey, string>> = {
  en: english_messages,
  de: german_messages,
};

/**
 * Returns the message in the given language, replacing {placeholders} with the given values.
 */
export function translate(
  language: Language,
  message_key: MessageKey,
  parameters: Record<string, string | number> = {}
): string {
  const message_template = message_dictionaries[language][message_key];
  return message_template.replace(/\{(\w+)\}/g, (placeholder, parameter_name: string) =>
    parameter_name in parameters ? String(parameters[parameter_name]) : placeholder
  );
}

/**
 * Picks German when the browser prefers it, and English otherwise.
 */
export function detect_language_from_browser(): Language {
  const browser_language = typeof navigator !== "undefined" ? navigator.language : "";
  return browser_language.toLowerCase().startsWith("de") ? "de" : "en";
}

/**
 * Formats a number with the decimal separator of the language.
 */
export function format_number(value: number, decimal_places: number, language: Language): string {
  return value.toLocaleString(language === "de" ? "de-DE" : "en-GB", {
    minimumFractionDigits: decimal_places,
    maximumFractionDigits: decimal_places,
  });
}
