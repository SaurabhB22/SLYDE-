const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const landslideRoutes = require("./routes/landslides");
const rainfallRoutes = require("./routes/rainfall");
const riskRoutes = require("./routes/risk");
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
module.exports = app;