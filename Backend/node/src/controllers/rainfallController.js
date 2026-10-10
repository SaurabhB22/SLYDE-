
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(
    __dirname,
    "../../../python/ingestion/imerg"
);

const DATASETS = {
    grid: {
        file: "processed/sikkim_precipitation_grid.csv",
        format: "csv",
        dateField: "time"
    },
    historical: {
        file: "historical/sikkim_historical_precipitation.csv",
        format: "csv",
        dateField: "date"
    },
    landslides: {
        file: "processed/sikkim_landslide_precipitation.json",
        format: "json",
        dateField: "date"
    }
};

// Parse CSV while supporting quoted fields and escaped quotes.
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
        } else if (char === '"' && field.length === 0) {
            quoted = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n") {
            row.push(field);
            if (row.some(value => value.length > 0)) {
                rows.push(row);
            }
            row = [];
            field = "";
        } else if (char !== "\r") {
            field += char;
        }
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }

    if (!rows.length) return [];

    const headers = rows.shift().map(header => header.trim());

    return rows.map(values =>
        Object.fromEntries(
            headers.map((header, index) => [
                header,
                values[index] ?? ""
            ])
        )
    );
}

function loadDataset(config) {
    const filePath = path.join(DATA_DIR, config.file);

    if (!fs.existsSync(filePath)) {
        const error = new Error(
            `Dataset not found: ${config.file}`
        );
        error.statusCode = 404;
        throw error;
    }

    const contents = fs.readFileSync(filePath, "utf8");

    return config.format === "json"
        ? JSON.parse(contents)
        : parseCSV(contents);
}

function getRainfall(req, res) {
    try {
        const datasetName = req.query.dataset || "grid";
        const config = DATASETS[datasetName];

        if (!config) {
            return res.status(400).json({
                success: false,
                message: "Invalid dataset.",
                availableDatasets: Object.keys(DATASETS)
            });
        }

        const { startDate, endDate } = req.query;
        const limitText = req.query.limit ?? "1000";
        const limit = Number(limitText);

        if (
            !/^\d+$/.test(String(limitText)) ||
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 10000
        ) {
            return res.status(400).json({
                success: false,
                message: "limit must be an integer from 1 to 10000."
            });
        }

        function validDate(value) {
            return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
                !Number.isNaN(Date.parse(value)) &&
                new Date(value).toISOString().slice(0, 10) === value;
        }

        if (
            (startDate && !validDate(startDate)) ||
            (endDate && !validDate(endDate))
        ) {
            return res.status(400).json({
                success: false,
                message: "Dates must use the YYYY-MM-DD format."
            });
        }

        if (startDate && endDate && startDate > endDate) {
            return res.status(400).json({
                success: false,
                message: "startDate cannot be after endDate."
            });
        }

        const records = loadDataset(config);

        const filtered = records.filter(record => {
            const date = String(
                record[config.dateField] ?? ""
            ).slice(0, 10);

            if (startDate && (!date || date < startDate)) {
                return false;
            }

            if (endDate && (!date || date > endDate)) {
                return false;
            }

            return true;
        });

        return res.status(200).json({
            success: true,
            dataset: datasetName,
            source: "NASA GPM IMERG",
            count: Math.min(filtered.length, limit),
            totalMatching: filtered.length,
            filters: {
                startDate: startDate || null,
                endDate: endDate || null,
                limit
            },
            data: filtered.slice(0, limit)
        });
    } catch (error) {
        console.error("Rainfall API error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : "Unable to read rainfall dataset."
        });
    }
}

module.exports = { getRainfall };
