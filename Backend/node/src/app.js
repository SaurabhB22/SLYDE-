const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const landslideRoutes = require("./routes/landslides");
const rainfallRoutes = require("./routes/rainfall");
const satelliteRoutes = require('./routes/satellite');
const riskRoutes = require("./routes/risk");
const pushRoutes = require("./routes/push");
const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        service: "SlopeTwin Node API",
        status: "running"
    });
});

app.use("/api/landslides", landslideRoutes);
app.use("/api/rainfall", rainfallRoutes);
app.use("/api/risk", riskRoutes);
app.use("/api/push", pushRoutes);
app.use('/api/satellite', satelliteRoutes);
module.exports = app;