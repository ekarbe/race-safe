// @vitest-environment jsdom
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
  GpxFormatError,
  decode_track_from_storage,
  encode_track_for_storage,
  parse_gpx_xml_string,
} from "./xml_gpx_parser";

type FixturePoint = { latitude: number; longitude: number; elevation_meters?: number };

/**
 * Builds a GPX document with one track of points. Points without an elevation omit the <ele> tag.
 */
function build_track_gpx(points: FixturePoint[], tag_name = "trkpt"): string {
  const point_xml = points
    .map((point) => {
      const elevation_xml = point.elevation_meters === undefined ? "" : `<ele>${point.elevation_meters}</ele>`;
      return `<${tag_name} lat="${point.latitude}" lon="${point.longitude}">${elevation_xml}</${tag_name}>`;
    })
    .join("");
  const container_xml = tag_name === "trkpt" ? `<trk><name>Test Track</name><trkseg>${point_xml}</trkseg></trk>` : `<rte><name>Test Route</name>${point_xml}</rte>`;
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${container_xml}</gpx>`;
}

/**
 * Points spaced 0.001 degrees of latitude apart, with the given elevations.
 */
function points_with_elevations(elevations: number[]): FixturePoint[] {
  return elevations.map((elevation, index) => ({
    latitude: 47 + index * 0.001,
    longitude: 11,
    elevation_meters: elevation,
  }));
}

describe("parse_gpx_xml_string", () => {
  it("ignores altitude jitter below the 3 m threshold", () => {
    const jitter_elevations = Array.from({ length: 200 }, (_, index) => (index % 2 === 0 ? 1000 : 1002));
    const parsed = parse_gpx_xml_string(build_track_gpx(points_with_elevations(jitter_elevations)));
    expect(parsed.total_elevation_gain_meters).toBe(0);
    expect(parsed.total_elevation_loss_meters).toBe(0);
  });

  it("counts a steady climb almost in full", () => {
    const climb_elevations = Array.from({ length: 101 }, (_, index) => 1000 + index);
    const parsed = parse_gpx_xml_string(build_track_gpx(points_with_elevations(climb_elevations)));
    expect(parsed.total_elevation_gain_meters).toBeGreaterThan(96);
    expect(parsed.total_elevation_gain_meters).toBeLessThanOrEqual(100);
    expect(parsed.total_elevation_loss_meters).toBe(0);
  });

  it("does not count a missing first elevation as a climb from 0 m", () => {
    const points: FixturePoint[] = [
      { latitude: 47, longitude: 11 },
      { latitude: 47.001, longitude: 11, elevation_meters: 1500 },
      { latitude: 47.002, longitude: 11, elevation_meters: 1500 },
    ];
    const parsed = parse_gpx_xml_string(build_track_gpx(points));
    expect(parsed.total_elevation_gain_meters).toBe(0);
    expect(parsed.track_points[0].elevation_meters).toBe(1500);
  });

  it("reads planned routes when a file has no track points", () => {
    const route_points = points_with_elevations([1000, 1200, 1100]);
    const parsed = parse_gpx_xml_string(build_track_gpx(route_points, "rtept"));
    expect(parsed.track_points).toHaveLength(3);
    expect(parsed.track_name).toBe("Test Route");
  });

  it("skips points with non-numeric coordinates instead of producing NaN distances", () => {
    const xml_with_bad_point = build_track_gpx([
      { latitude: 47, longitude: 11, elevation_meters: 1000 },
      { latitude: 47.001, longitude: 11, elevation_meters: 1000 },
    ]).replace('lat="47.001"', 'lat="not-a-number"');
    const parsed = parse_gpx_xml_string(xml_with_bad_point);
    expect(parsed.track_points).toHaveLength(1);
    expect(Number.isNaN(parsed.total_distance_meters)).toBe(false);
  });

  it("reports a file with no usable coordinates with its own reason", () => {
    const xml_without_coordinates = build_track_gpx([{ latitude: 47, longitude: 11 }]).replace(/lat="47"/g, 'lat="x"');
    expect(() => parse_gpx_xml_string(xml_without_coordinates)).toThrow(GpxFormatError);
    try {
      parse_gpx_xml_string(xml_without_coordinates);
    } catch (error) {
      expect((error as GpxFormatError).reason).toBe("no_coordinates");
    }
  });

  it("reports a file with no points with its own reason", () => {
    try {
      parse_gpx_xml_string('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><metadata/></gpx>');
      expect.unreachable("expected a GpxFormatError");
    } catch (error) {
      expect((error as GpxFormatError).reason).toBe("no_points");
    }
  });

  it("reports invalid XML with its own reason", () => {
    try {
      parse_gpx_xml_string("<gpx><trk>");
      expect.unreachable("expected a GpxFormatError");
    } catch (error) {
      expect((error as GpxFormatError).reason).toBe("invalid_xml");
    }
  });
});

describe("track storage", () => {
  it("round-trips a parsed track through the compact format", () => {
    const parsed = parse_gpx_xml_string(build_track_gpx(points_with_elevations([1000, 1010, 1020, 1030, 1040])));
    const decoded = decode_track_from_storage(encode_track_for_storage(parsed));
    expect(decoded).not.toBeNull();
    expect(decoded?.track_name).toBe("Test Track");
    expect(decoded?.track_points).toHaveLength(parsed.track_points.length);
    expect(decoded?.track_points[2].elevation_meters).toBeCloseTo(1020, 1);
    expect(decoded?.total_elevation_gain_meters).toBeCloseTo(parsed.total_elevation_gain_meters, 1);
  });

  it("stores each point in far fewer characters than the full object", () => {
    const parsed = parse_gpx_xml_string(build_track_gpx(points_with_elevations(Array.from({ length: 500 }, (_, index) => 1000 + (index % 50)))));
    const compact_length = encode_track_for_storage(parsed).length;
    const full_length = JSON.stringify(parsed).length;
    expect(compact_length).toBeLessThan(full_length * 0.5);
  });

  it("still reads the full object saved by earlier versions", () => {
    const parsed = parse_gpx_xml_string(build_track_gpx(points_with_elevations([1000, 1005])));
    const decoded = decode_track_from_storage(JSON.stringify(parsed));
    expect(decoded?.track_points).toHaveLength(2);
  });

  it("returns null for corrupt or empty stored values", () => {
    expect(decode_track_from_storage("not json")).toBeNull();
    expect(decode_track_from_storage('{"track_points": []}')).toBeNull();
    expect(decode_track_from_storage('{"format_version": 2, "points": []}')).toBeNull();
  });
});
