const supportService = require('../services/supportService');

const lodgeComplaint = async (req, res) => {
  try {
    const result = await supportService.registerComplaint(req.body, req.ip);
    res.status(201).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message });
  }
};

module.exports = {
  lodgeComplaint
};
