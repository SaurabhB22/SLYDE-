
const express = require("express");
const {
    getRainfall
} = require("../controllers/rainfallController");

const router = express.Router();

router.get("/", getRainfall);

module.exports = router;
