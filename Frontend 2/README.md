# SLYDE Frontend (React + Vite)

This React/Vite app preserves the uploaded SLYDE Sikkim 3D map markup and styles, then loads the existing Three.js map engine. The backend integration reads the existing Node/Express API; it does not require changing the backend or committing data/secrets.

## Run locally on your Mac

1. Extract this `Frontend.zip`.
2. Terminal 1 — start the existing backend:
   ```bash
   cd ~/Documents/SlopTwin/Backend/node
   node src/server.js
   ```
3. Terminal 2 — enter the extracted `Frontend` folder (the folder containing `package.json`):
   ```bash
   cd /path/to/Frontend
   npm install
   npm run dev
   ```
4. Open `http://localhost:5173`. Keep the backend running at `http://localhost:5050`.

Vite proxies `/api` to port 5050 by default. If the API runs elsewhere, set `VITE_API_PROXY_TARGET` in `.env` and restart Vite. For a separately hosted API, set `VITE_API_BASE_URL` to its origin (for example `https://api.example.com`) and configure backend CORS.

## Connected existing endpoints

- `GET /api/health` — backend health
- `GET /api/landslides?limit=1000` — real inventory points; adds selectable map markers and inventory list entries
- `GET /api/risk?date=2025-06-07&limit=1000` — date-matched exploratory screening scores; nearest site score and factor drivers are shown when selecting a known inventory point
- `GET /api/rainfall?dataset=grid&limit=1000` — IMERG grid observations
- `GET /api/rainfall?dataset=historical&startDate=2025-06-07&endDate=2025-06-07&limit=1000` — historical IMERG values
- `GET /api/satellite?limit=100` — checks the existing satellite endpoint and exposes its status

The map remains interactive: rotate, zoom, camera presets, colour mode, road/river/district/name/site layers, height stretch, place selector, site list, rainfall scenarios and sliders. API inventory sites are added as map labels; clicking a marker or list item selects it. The API date is set to 2025-06-07 in this build to match the backend dataset.

## Important interpretation

The backend score is an exploratory relative heuristic at known inventory sites, **not a probability, calibrated forecast, or operational warning**. The original terrain and rainfall sliders remain an illustrative scenario model; slider changes do not write rainfall to the backend and are not live forecasts. The 3D terrain itself is the synthetic terrain from the supplied reference, not a surveyed DEM.

## Notes

The map engine loads Three.js and OrbitControls from jsDelivr, so an internet connection is required for those dependencies. The UI markup and visual styling are derived from the supplied reference file.

## Illustrative landslide animation

The 3D map includes a `Landslide animation` control. When enabled, animated debris particles move down approximate terrain gradients near selected documented inventory sites. This is an illustrative Three.js visualization only: it is not a physically validated landslide simulation, a real-time observation, or a forecast. Do not use it for evacuation or operational decisions. The animation uses the terrain already bundled with the prototype and requires the existing Three.js CDN scripts.
