const SessionData = require('../models/SessionData');
const Faculty = require('../models/Faculty');
const { sendSMS } = require('../utils/smsService');

// Helper to normalize strings for exact/fuzzy matching
const normalize = (s) => (s || '').replace(/^dr\.|^prof\./i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

// Helper to format personalized SMS pattern as requested by user:
// Name -> Date -> Session -> Room
const formatFacultySMSPattern = (facultyName, duties) => {
    let msg = `SIT Tumakuru Exam Allotment:\nDear ${facultyName},\nYour Exam Duty Schedule:`;

    duties.forEach(d => {
        const sessionCode = (d.session || '').toLowerCase() === 'morning' ? 'AM' : 'PM';
        const roomStr = d.room ? d.room : 'Unassigned';
        msg += `\nDate: ${d.date} | Session: ${sessionCode} | Room: ${roomStr}`;
    });

    msg += `\nPlease report 30 mins prior.`;
    return msg;
};

const path = require('path');

// @desc    Get Textlocal / SMSLocal configuration & status
// @route   GET /api/sms/config
// @access  Public
const getSMSConfig = async (req, res) => {
    try {
        require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
        
        const apiKey = process.env.VENDEL_API_KEY;
        const isConfigured = !!(apiKey && apiKey !== 'vk_your_api_key_here' && apiKey.trim().length > 0);

        const dryRunEnv = String(process.env.SMS_DRY_RUN || 'false').toLowerCase().trim();
        const isDryRun = dryRunEnv === 'true' || !isConfigured;
        
        console.log(`[SMS CONFIG API] Vendel.cc Configured: ${isConfigured}, DryRun: ${isDryRun}`);

        res.json({
            provider: 'vendel',
            providerName: 'Vendel.cc SMS Gateway (app.vendel.cc)',
            isConfigured: isConfigured,
            isDryRun: isDryRun
        });
    } catch (err) {
        console.error('getSMSConfig Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// @desc    Preview SMS messages for all faculties based on current allocations
// @route   POST /api/sms/preview
// @access  Public
const previewSMS = async (req, res) => {
    try {
        let docs = [];

        // 1. Check if sessionData was passed directly in request body from frontend React state
        if (req.body.sessionData && typeof req.body.sessionData === 'object' && Object.keys(req.body.sessionData).length > 0) {
            Object.keys(req.body.sessionData).forEach(date => {
                if (req.body.sessionData[date] && typeof req.body.sessionData[date] === 'object') {
                    Object.keys(req.body.sessionData[date]).forEach(session => {
                        docs.push({
                            date,
                            session,
                            data: req.body.sessionData[date][session]
                        });
                    });
                }
            });
        }

        // 2. If no body sessionData or empty, fetch SessionData directly from DB
        if (!docs || docs.length === 0) {
            docs = await SessionData.find().sort({ date: 1, session: 1 }).lean();
        }

        // 2. Fetch Faculty collection directly from DB for phone & dept matching
        let facultyList = await Faculty.find().lean();

        if (!facultyList || facultyList.length < 10) {
            console.log('[SMS PREVIEW] Faculty collection has few or zero entries. Auto-seeding database from source files...');
            try {
                const seedDatabase = require('../utils/autoSeed');
                await seedDatabase(true);
                facultyList = await Faculty.find().lean();
            } catch (seedErr) {
                console.error('[SMS PREVIEW] Auto-seed error:', seedErr);
            }
        }

        console.log(`[SMS PREVIEW] Loaded ${docs.length} session docs and ${facultyList.length} faculty members from DB.`);

        // 3. Build faculty lookup map using exact normalization used in getAllAllocations
        const normalize = (s) => (s || '').replace(/^dr\.|^prof\./i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

        const extractPhoneVal = (f) => f.phone || f.Phone || f.mobile || f.Mobile || f.contact || f.Contact || f.phone_no || f.mobile_no || '';

        const facultyMap = {};
        facultyList.forEach(f => {
            const phoneStr = extractPhoneVal(f);
            const data = {
                phone: phoneStr,
                department: f.department || f.dept || '',
                name: f.name,
                initials: f.initials
            };
            if (f.initials) facultyMap[normalize(f.initials)] = data;
            if (f.name) facultyMap[normalize(f.name)] = data;
        });

        // 4. Group duties by Faculty from SessionData
        const facultyDuties = {};

        docs.forEach(doc => {
            const { date, session, data } = doc;
            if (!data) return;

            const processPerson = (person, role) => {
                if (!person || (!person.name && !person.initials)) return;

                const normName = normalize(person.name);
                const normInitials = normalize(person.initials);

                // Exact lookup matching getAllAllocations
                const info = facultyMap[normName] || facultyMap[normInitials] || {};
                
                // Helper to get 10-digit phone with DB fallback
                const getPhoneWithFallback = () => {
                    const fromPerson = (person.phone || person.contact || person.mobile || '').trim();
                    const cleanPerson = fromPerson.replace(/[^0-9]/g, '').slice(-10);
                    if (cleanPerson.length === 10) return fromPerson;
                    return (info.phone || fromPerson).trim();
                };

                const rawPhone = getPhoneWithFallback();
                const department = (person.department || person.dept || info.department || '').trim();

                const key = normName || normInitials || (person.name || person.initials);

                if (!facultyDuties[key]) {
                    facultyDuties[key] = {
                        name: person.name || info.name || 'Faculty',
                        initials: person.initials || info.initials || '',
                        phone: rawPhone,
                        department: department,
                        duties: []
                    };
                }

                facultyDuties[key].duties.push({
                    date,
                    session,
                    room: person.room || 'Unassigned',
                    role
                });
            };

            if (data.deputies) data.deputies.forEach(p => processPerson(p, 'Deputy'));
            if (data.invigilators) data.invigilators.forEach(p => processPerson(p, 'Invigilator'));
        });

        let recipients = [];

        // 5. If duties exist in SessionData, format SMS for duty holders
        if (Object.keys(facultyDuties).length > 0) {
            recipients = Object.values(facultyDuties).map(f => {
                const message = formatFacultySMSPattern(f.name, f.duties);
                const cleanPhone = String(f.phone).replace(/[^0-9]/g, '').slice(-10);
                return {
                    name: f.name,
                    initials: f.initials,
                    phone: f.phone,
                    cleanPhone: cleanPhone,
                    hasValidPhone: cleanPhone.length === 10,
                    department: f.department,
                    dutiesCount: f.duties.length,
                    duties: f.duties,
                    message: message
                };
            });
        } else {
            // 6. If no duty allocations exist in DB yet, list all Faculty from DB directly
            recipients = facultyList.map(f => {
                const rawPhone = extractPhoneVal(f);
                const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '').slice(-10);
                return {
                    name: f.name,
                    initials: f.initials,
                    phone: rawPhone,
                    cleanPhone: cleanPhone,
                    hasValidPhone: cleanPhone.length === 10,
                    department: f.department || f.dept || '',
                    dutiesCount: 0,
                    duties: [],
                    message: `SIT Tumakuru Exam Allotment:\nDear ${f.name},\nYour exam duty schedule will be updated shortly.`
                };
            });
        }

        res.json({
            totalRecipients: recipients.length,
            validPhoneCount: recipients.filter(r => r.hasValidPhone).length,
            recipients: recipients
        });

    } catch (err) {
        console.error('SMS Preview Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// @desc    Send Bulk SMS to all allocated faculty members
// @route   POST /api/sms/send-all
// @access  Public
const sendBulkSMS = async (req, res) => {
    try {
        const { recipients } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ msg: 'No recipient list provided for SMS dispatch.' });
        }

        const results = {
            total: recipients.length,
            sent: 0,
            failed: 0,
            skipped: 0,
            details: []
        };

        for (const item of recipients) {
            const cleanPhone = String(item.phone || '').replace(/[^0-9]/g, '').slice(-10);

            if (cleanPhone.length !== 10) {
                results.skipped++;
                results.details.push({
                    name: item.name,
                    phone: item.phone,
                    status: 'SKIPPED',
                    reason: 'Invalid or missing 10-digit mobile number'
                });
                continue;
            }

            const sendRes = await sendSMS({
                numbers: cleanPhone,
                message: item.message
            });

            if (sendRes.success) {
                results.sent++;
                results.details.push({
                    name: item.name,
                    phone: cleanPhone,
                    status: 'SENT',
                    dryRun: !!sendRes.dryRun,
                    msg: sendRes.message
                });
            } else {
                results.failed++;
                results.details.push({
                    name: item.name,
                    phone: cleanPhone,
                    status: 'FAILED',
                    error: sendRes.error
                });
            }
        }

        res.json({
            msg: `SMS dispatch process completed. Sent: ${results.sent}, Failed: ${results.failed}, Skipped: ${results.skipped}`,
            summary: results
        });

    } catch (err) {
        console.error('Bulk SMS Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// @desc    Send Single SMS to one faculty member
// @route   POST /api/sms/send-single
// @access  Public
const sendSingleSMS = async (req, res) => {
    try {
        const { name, phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ msg: 'Phone number and message are required.' });
        }

        const cleanPhone = String(phone).replace(/[^0-9]/g, '').slice(-10);
        if (cleanPhone.length !== 10) {
            return res.status(400).json({ msg: 'Please provide a valid 10-digit mobile number.' });
        }

        const sendRes = await sendSMS({
            numbers: cleanPhone,
            message: message
        });

        if (sendRes.success) {
            res.json({
                success: true,
                msg: `SMS sent successfully to ${name || cleanPhone}`,
                dryRun: !!sendRes.dryRun,
                details: sendRes
            });
        } else {
            res.status(500).json({
                success: false,
                msg: `Failed to send SMS to ${cleanPhone}: ${sendRes.error || 'Textlocal / SMSLocal Gateway Error'}`,
                error: sendRes.error,
                details: sendRes.data
            });
        }

    } catch (err) {
        console.error('Single SMS Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// @desc    Test Textlocal / SMSLocal Gateway connection
// @route   GET/POST /api/sms/test
// @access  Public
const testGateway = async (req, res) => {
    try {
        const testPhone = req.body?.phone || req.query?.phone || '7349117072';
        const testMessage = req.body?.message || 'SIT Tumakuru Exam Allotment Test Alert via Textlocal Gateway.';

        console.log(`[SMS TEST ENDPOINT] Initiating gateway test for phone: ${testPhone}`);
        const result = await sendSMS({
            numbers: testPhone,
            message: testMessage
        });

        res.json({
            endpoint: '/api/sms/test',
            targetPhone: testPhone,
            result: result
        });
    } catch (err) {
        console.error('Test Gateway Error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getSMSConfig,
    previewSMS,
    sendBulkSMS,
    sendSingleSMS,
    testGateway
};
