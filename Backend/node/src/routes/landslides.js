const express = require("express");

const {
    getLandslides
} = require("../controllers/landslideController");

const router = express.Router();

router.get("/", getLandslides);

module.exports = router;