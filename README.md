<!-- RaceSafe - Offline-accessible trail & ultra-run safety planner with GPX analysis & emergency SMS generator
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
    along with this program.  If not, see <https://www.gnu.org/licenses/>. -->

# RaceSafe 🏔️

**RaceSafe** is an offline-first, client-side safety planner designed specifically for trail and ultra-runners. It enables runners, safety crews, and emergency contacts to coordinate schedules and checkpoints without requiring any cell service or server backend.

---

## 🏔️ Core Value

RaceSafe operates **100% client-side** in browser memory. By uploading a GPX trail route, runners can compute elevation-adjusted arrival windows (ETAs) at user-defined checkpoints, preview the path profile on an interactive canvas, export plan sheets as PDFs, and compile low-signal emergency SMS templates—all from remote trailheads with zero connectivity.

---

## ✨ Features

- **Client-Side GPX Parser**: Parses XML tracks using the browser's native `DOMParser` to extract distance metrics and coordinate heights.
- **Elevation-Adjusted Pace Engine**: Computes elapsed time using a customizable slope ascent delay factor inspired by **Naismith's Rule** (defaulting to adding 10 minutes per 100 meters of cumulative climb).
- **Interactive Elevation Canvas**: Renders a crisp elevation chart with checkpoint pin flags, live hover coordinates/ETAs, and click-to-add checkpoint placement.
- **PWA Service Worker Cache**: Uses a Stale-While-Revalidate caching worker in `public/service_worker.js` to enable instantaneous load times and complete offline reliability.
- **Apple Glassmorphic Design**: Features a clean monochromatic style (whites, grays, and blacks) with subtle frosted glass containers, background blurs, and soft shadows.
- **System & Manual Dark Mode**: Follows the system preference by default. The toggle in the planner header switches the theme instantly, and the choice is remembered.
- **PDF Route Card Exporter**: Uses `jspdf` to compile a tabular text schedule alongside a JPEG export of the current canvas profile.
- **Emergency SMS Generator**: Formats a compact, character-dense text payload of route details and checkpoint ETAs for low-reception copy-pasting or direct mobile SMS launches.
- **Race planning**: a race date (so ETAs carry the calendar day, including overnight events), a stop time per checkpoint that moves every later ETA, cut-off times with slack in minutes (tight and missed cut-offs are flagged), and an optional descent-time allowance.
- **Saved plan**: checkpoints, pacing, start time, race date and emergency contacts are kept in this browser, tied to the uploaded track. The "Clear saved track and plan" button removes them.
- **English and German**: the interface follows the browser language and can be switched in the header. Printed plans and SMS payloads use the chosen language.
- **Metric and imperial**: km, m and min/km, or miles, feet and min/mile. Calculations stay metric internally, so switching units never changes an ETA.

---

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript 6 + Vite 8
- **Routing**: React Router 8 (`react-router`, using `HashRouter` so reloads work on static hosting)
- **PDF Generation**: `jspdf` (loaded only on the planner screen)
- **Styling**: Tailwind CSS 4 (configured with Vite's CSS-first plugin)
- **Offline caching**: Service worker in `public/service_worker.js` (stale-while-revalidate, precaches the app shell and its build assets)
- **Tests**: Vitest with jsdom for the GPX parser, the ETA engine, unit conversions, translations and storage

---

## 🚀 Getting Started

### Local Development

**Requirements:** Node.js 22.22 or newer. The `.nvmrc` file pins Node 24, the version used in CI.

To run the application locally on your machine:

1. **Clone the repository**:
   ```bash
   git clone <repository_url>
   cd race-safe
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run the local dev server**:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173/race-safe/`.

### Checks

Lint, test and type-check before you push. CI runs the same commands on every pull request:
```bash
npm run lint
npm test
npm run build
```

### Building for Production

To compile typescript and generate optimized static build bundles:
```bash
npm run build
```
The compiled output is saved under the `dist/` directory, ready to be hosted on any static web server (such as GitHub Pages).

---

## ⚠️ Known Limitations

- **Elevation gain is an estimate**: an altitude change counts only once it moves 3 m from the last counted level, which filters most GPS noise. Very gentle slopes can still be under-counted, and a barometric file would be more accurate than GPS altitude.
- **Browser storage limit**: the track is kept in `localStorage`, which is typically about 5 MB. The compact format holds roughly 100,000 points; longer recordings are rejected with a message.
- **Route files**: planned routes (`rte`/`rtept`) are read only when the file has no track points, and waypoints are ignored.

---

## 📄 License

RaceSafe is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License as published by the Free Software Foundation**, either version 3 of the License, or (at your option) any later version. The full license text is in [LICENSE](LICENSE).

Refer to the license headers in the source code files and visit <https://www.gnu.org/licenses/> for full details.
