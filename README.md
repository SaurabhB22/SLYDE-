# SLYDE — Smart Landslide Intelligence & Detection Engine

**An AI-assisted landslide risk monitoring and decision-support prototype focused on Sikkim, India.**

SLYDE combines environmental data, historical landslide information, geospatial visualization and external reports to help users explore location-specific landslide risk. Its interface presents a 3D risk-map experience, rainfall scenarios, documented landslide sites and public-report intelligence.

> **Important:** SLYDE is a prototype, not an official warning service. Model outputs and public web reports are not guarantees of an impending landslide. Do not use this application as the sole basis for emergency or evacuation decisions. Follow official government and disaster-management advisories.

## Contents

- [Key capabilities](#key-capabilities)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [TinyFish external reports](#tinyfish-external-reports)
- [API endpoints](#api-endpoints)
- [Data integrity and limitations](#data-integrity-and-limitations)
- [Security](#security)
- [Development and deployment](#development-and-deployment)

## Key capabilities

- **3D geospatial interface:** Explore the SLYDE map and documented landslide sites.
- **Rainfall scenarios:** Inspect configurable rainfall accumulations over 1, 3, 7 and 15 days.
- **Landslide inventory:** Access documented landslide-site records from the backend.
- **Risk and environmental data:** Integrate available risk, rainfall and satellite-data endpoints.
- **NASA GPM IMERG pipeline:** Ingest precipitation data for rainfall-related analysis.
- **External report intelligence:** Discover and display public web reports about Sikkim landslides through TinyFish Search.
- **Push notifications:** Backend endpoints support device pairing, push subscriptions and alert delivery.
- **Safety information:** Present emergency information and relevant warnings in the interface.

Availability of individual data sources and features depends on configuration and deployment status. A displayed dataset or report should not be assumed to be real-time or independently verified.

## Architecture

```text
NASA GPM IMERG / existing datasets
                |
                v
       Python data pipeline
                |
                v
      Existing data / model inputs
                |
                v
      Node.js / Express API
                |
                v
       MongoDB data storage
                |
                v
       SLYDE frontend and map

TinyFish Search
       |
       v
External landslide report route
       |
       v
Separate external_landslide_reports collection
       |
       v
Recent Landslide Intelligence panel
```

The TinyFish workflow is separate from the original landslide inventory and model-risk data. Discovering an external report does not, by itself, change model predictions or retrain the model.

## Technology stack

| Component | Technology |
|---|---|
| Frontend | Vite, JavaScript, HTML and CSS |
| Visualization | 3D map and geospatial interface |
| Backend API | Node.js and Express |
| Database | MongoDB with Mongoose |
| Rainfall source | NASA GPM IMERG |
| Data processing | Python ingestion and processing scripts |
| External web search | TinyFish Search API |
| Notifications | Web Push backend |

## Project structure

```text
SlopTwin/
├── Backend/
│   ├── node/
│   │   ├── src/
│   │   │   ├── app.js
│   │   │   ├── server.js
│   │   │   ├── models/
│   │   │   └── routes/
│   │   └── package.json
│   └── python/
│       └── ingestion/
├── Frontend 2/
│   ├── public/
│   │   └── slyde-icon.png
│   ├── src/
│   │   ├── api.js
│   │   ├── slydeMarkup.js
│   │   └── styles.css
│   ├── index.html
│   └── package.json
└── README.md
```

The structure above highlights the principal application components; individual folders may contain additional modules and scripts.

## Prerequisites

- Node.js and npm
- MongoDB, either a local instance or a reachable MongoDB Atlas cluster
- TinyFish API access for external-report discovery
- Python and the project-specific Python dependencies for data-ingestion workflows

## Local setup

### 1. Start the Node.js backend

Open a terminal:

```bash
cd "$HOME/Documents/SlopTwin/Backend/node"
npm install
```

Create or configure `Backend/node/.env` using the project's required environment variables. Keep credentials private.

Typical configuration keys include:

```dotenv
PORT=5050
MONGODB_URI=<your-mongodb-connection-string>
TINYFISH_API_KEY=<your-tinyfish-api-key>
TINYFISH_REFRESH_TOKEN=<your-private-refresh-token>
```

Other existing backend features may require additional variables, including push-notification and Python-service configuration. Use the existing code and deployment settings as the source of truth; never commit `.env`.

Start the API:

```bash
npm start
```

The local API is expected at:

```text
http://localhost:5050
```

Check its health:

```bash
curl http://localhost:5050/api/health
```

A successful response should indicate that the API is running.

### 2. Start the frontend

Open a second terminal:

```bash
cd "$HOME/Documents/SlopTwin/Frontend 2"
npm install
npm run dev
```

Open the local URL printed by Vite.

If the frontend uses a configured API proxy or a `VITE_API_BASE_URL`, ensure it points to the appropriate backend. Do not expose private backend credentials in frontend environment variables.

Build the frontend for production:

```bash
npm run build
```

## TinyFish external reports

SLYDE uses TinyFish Search to discover publicly indexed pages related to Sikkim landslides, road closures and district alerts.

The backend stores these results separately in the MongoDB collection:

```text
external_landslide_reports
```

Each report can include:

- Source URL, title and domain
- Search-result snippet
- Reported date text supplied by the search provider
- Search query and provider metadata
- Last-seen timestamp
- Verification status

### Refresh reports

The refresh endpoint is protected by a private refresh token:

```http
POST /api/external-landslides/refresh
x-refresh-token: <your-private-refresh-token>
```

Do not place the refresh token in browser code, public documentation, Git commits or screenshots.

### Retrieve saved reports

```http
GET /api/external-landslides?limit=10
```

The frontend reads saved reports and displays source links, snippets and verification status.

**Interpretation rules:**

1. Search discovery does not establish that an incident is current or confirmed.
2. A source's publication date and the time SLYDE discovered it are different.
3. Reports may be old, duplicated across publishers or incomplete.
4. Reports marked `unverified` must not be presented as official alerts.
5. External reports are not automatically added to the original landslide inventory, used to retrain the model or used to change model-risk scores.

## API endpoints

The following routes are registered in the Node.js application. Exact parameters and response schemas should be checked in the corresponding route files.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Backend health check |
| `/api/landslides` | Landslide inventory |
| `/api/rainfall` | Rainfall data |
| `/api/risk` | Risk-related data |
| `/api/satellite` | Satellite-data endpoint |
| `/api/push` | Push-notification workflows |
| `GET /api/external-landslides` | Retrieve saved external reports |
| `POST /api/external-landslides/refresh` | Search for and save external reports |

The frontend may also request other endpoints. Confirm that every requested route exists before treating the whole application as fully operational.

## Data integrity and limitations

- **Preserve original data:** The TinyFish report collection is separate from the original NASA IMERG data, landslide inventory and model artifacts.
- **No automatic retraining:** Discovering a web report does not automatically retrain the model or improve prediction accuracy.
- **Validate before using reports:** Corroborate incident information using reliable official sources before treating it as actionable.
- **Rainfall is not the only factor:** Landslide susceptibility can depend on terrain, geology, soil and other environmental conditions.
- **Model validation matters:** Reliable risk estimates require representative training data, appropriate validation and verified observations.
- **Prototype limitations:** A successful frontend build or API health response does not prove that the model is accurate or that the production deployment is operational.

## Security

- Never commit `.env`, database credentials, API keys, refresh tokens, VAPID private keys or JWT secrets.
- Keep the TinyFish refresh route protected.
- Validate and sanitize external data before displaying it.
- Use HTTPS in production and configure database access securely.
- Review logs and responses before sharing them publicly.

## Development and deployment

Before releasing changes:

1. Run `npm run build` in `Frontend 2`.
2. Check the backend health endpoint.
3. Verify MongoDB connectivity.
4. Test the external-report endpoint and refresh flow.
5. Confirm that original inventory and model-risk endpoints still work.
6. Verify the deployed frontend and backend independently.

The production backend's availability, database connectivity and TinyFish refresh workflow must be verified against the live deployment before claiming production readiness.

## Project status

SLYDE is an evolving landslide-risk decision-support prototype. Its goal is to bring rainfall data, geospatial information, model outputs and external report intelligence into one interface while preserving data separation and making uncertainty visible.

Contributions and improvements should prioritize data provenance, reproducibility, validation, security and clear communication of risk.
