const Landslide = require("../models/Landslide");

const getLandslides = async (req, res) => {
    try {
        const landslides = await Landslide.find();

        res.status(200).json({
            success: true,
            count: landslides.length,
            data: landslides
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    getLandslides
};