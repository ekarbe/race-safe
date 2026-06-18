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

import { HashRouter, Routes, Route } from "react-router-dom";
import MainDashboard from "./components/MainDashboard";
import PlanGenerator from "./components/PlanGenerator";

/**
 * The main application component that sets up the layout wrapper and
 * maps URL hash paths to specific components.
 */
export default function App() {
  return (
    // HashRouter matches paths after the "#" symbol in the URL.
    // This ensures that page reloads work offline and on static backends
    // without raising 404 routing errors.
    <HashRouter>
      <div className="min-h-screen transition-colors duration-300 flex flex-col justify-between">
        
        {/* Core routing dashboard viewports */}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<MainDashboard />} />
            <Route path="/planner" element={<PlanGenerator />} />
          </Routes>
        </main>

        {/* Minimalist monochromatic footer element */}
        <footer className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-600 border-t border-zinc-200/50 dark:border-zinc-800/50 mt-12 bg-white/20 dark:bg-black/10 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              RaceSafe &copy; 2026. Free Software under the GNU GPL v3 License.
            </span>
            <span className="font-light">
              Running 100% locally in browser memory. Offline active.
            </span>
          </div>
        </footer>

      </div>
    </HashRouter>
  );
}
