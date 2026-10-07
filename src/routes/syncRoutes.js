const express = require('express');
const router = express.Router();
const syncController = require('../controllers/syncController');

router.post('/sync', syncController.sync);
router.get('/data', syncController.getData);
router.post('/flag/pending', syncController.flagPending);
router.post('/flag/clear', syncController.flagClear);

module.exports = router;
