const express = require('express');
const router = express.Router();
const {
    getSMSConfig,
    previewSMS,
    sendBulkSMS,
    sendSingleSMS,
    testGateway
} = require('../controllers/smsController');

router.get('/config', getSMSConfig);
router.get('/test', testGateway);
router.post('/test', testGateway);
router.post('/preview', previewSMS);
router.post('/send-all', sendBulkSMS);
router.post('/send-single', sendSingleSMS);

module.exports = router;
