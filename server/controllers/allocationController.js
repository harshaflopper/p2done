const SessionData = require('../models/SessionData');
const SessionConfig = require('../models/SessionConfig'); // Keeping for legacy or if needed, but SessionData supersedes it
const AllocationDetail = require('../models/AllocationDetail'); // Keeping for legacy reference or cleanup

const Faculty = require('../models/Faculty');

// Helper to sync duties to Faculty profiles
const syncFacultyDuties = async () => {
    try {
        console.log('Syncing Faculty Duties...');
        const allSessions = await SessionData.find().lean();
        const allFaculty = await Faculty.find().lean();

        // Normalizer
        const normalize = (s) => (s || '').replace(/^dr\.|^prof\./i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

        // 1. Map normalized names/initials to Faculty IDs
        const facultyMap = {};
        allFaculty.forEach(f => {
            const id = f._id.toString();
            if (f.initials) facultyMap[normalize(f.initials)] = id;
            if (f.name) facultyMap[normalize(f.name)] = id;
        });

        // 2. Aggregate duties per faculty
        const facultyUpdates = {}; // { facultyId: { duties: [], count: 0 } }

        // Initialize for all faculty to ensure we clear old duties if they are removed
        allFaculty.forEach(f => {
            facultyUpdates[f._id.toString()] = { duties: [], count: 0 };
        });

        allSessions.forEach(doc => {
            const { date, session, data } = doc;

            const processPerson = (person, role) => {
                if (!person.name && !person.initials) return;

                const normName = normalize(person.name);
                const normInitials = normalize(person.initials);

                // Try to find faculty ID
                const fid = facultyMap[normName] || facultyMap[normInitials];

                if (fid) {
                    facultyUpdates[fid].duties.push({
                        date,
                        session,
                        room: (person.room && person.room.trim() !== '') ? person.room.trim() : 'Unassigned',
                        role,
                        designation: person.designation || person.dept || ''
                    });
                    facultyUpdates[fid].count++;
                }
            };

            if (data.deputies) data.deputies.forEach(p => processPerson(p, 'Deputy'));
            if (data.invigilators) data.invigilators.forEach(p => processPerson(p, 'Invigilator'));
        });

        // 3. Bulk Write Updates
        const ops = Object.keys(facultyUpdates).map(fid => ({
            updateOne: {
                filter: { _id: fid },
                update: {
                    $set: {
                        duties: facultyUpdates[fid].duties,
                        totalAllotments: facultyUpdates[fid].count
                    }
                }
            }
        }));

        if (ops.length > 0) {
            await Faculty.bulkWrite(ops);
            console.log(`Synced duties for ${ops.length} faculty members.`);
        }

    } catch (err) {
        console.error('Error syncing faculty duties:', err);
        // Don't throw, just log. This is a side effect.
    }
};

// @desc    Save bulk allocations (SessionData Document Approach)
// @route   POST /api/allocations
// @access  Public
exports.saveAllocations = async (req, res) => {
    try {
        const { password, ...sessionData } = req.body; // Extract password, rest is date-keyed data

        if (!password) {
            return res.status(400).json({ msg: 'Password is required to confirm allotment' });
        }

        // Middleware strips password, so re-fetch user
        const user = await require('../models/User').findById(req.user._id);
        if (password !== 'AUTO_SAVE_BYPASS') {
            if (!user || !(await user.matchPassword(password))) {
                return res.status(401).json({ msg: 'Invalid Password. Save failed.' });
            }
        }

        console.log('Received session data for save:', Object.keys(sessionData));

        const ops = [];
        
        // Fetch existing data to preserve rooms if they exist
        const existingSessions = await SessionData.find().lean();
        const existingDataMap = {};
        existingSessions.forEach(doc => {
            if (!existingDataMap[doc.date]) existingDataMap[doc.date] = {};
            existingDataMap[doc.date][doc.session] = doc.data;
        });

        // Iterate and prepare bulk operations or individual upserts
        for (const date in sessionData) {
            // Skip if key is somehow not a date or if it's empty (though ...rest handles that mostly)
            if (typeof sessionData[date] !== 'object') continue;

            for (const session in sessionData[date]) {
                const data = sessionData[date][session];
                
                // PRESERVE EXISTING ROOMS
                if (existingDataMap[date] && existingDataMap[date][session]) {
                    const oldData = existingDataMap[date][session];
                    
                    if (data.invigilators && oldData.invigilators) {
                        const oldRoomMap = {};
                        oldData.invigilators.forEach(inv => {
                            if (inv._id && inv.room && inv.room !== 'Unassigned') {
                                oldRoomMap[inv._id] = inv.room;
                            }
                        });
                        
                        data.invigilators.forEach(inv => {
                            if (inv._id && oldRoomMap[inv._id] && (!inv.room || inv.room === 'Unassigned')) {
                                inv.room = oldRoomMap[inv._id];
                            }
                        });
                    }
                }

                ops.push({
                    updateOne: {
                        filter: { date, session },
                        update: {
                            $set: {
                                date,
                                session,
                                data
                            }
                        },
                        upsert: true
                    }
                });
            }
        }

        if (ops.length > 0) {
            await SessionData.bulkWrite(ops);
        }

        // Trigger Sync
        await syncFacultyDuties();

        res.json({ msg: 'Allocations saved successfully (Document Mode)', stats: { sessions: ops.length } });

    } catch (err) {
        console.error('SessionData Save Error:', err);
        res.status(500).send(`Server Error: ${err.message}`);
    }
};

// @desc    Get all allocations (Reconstruct SessionData with Mobile Numbers)
// @route   GET /api/allocations
// @access  Public
exports.getAllAllocations = async (req, res) => {
    try {
        // Fetch all faculty from DB without field projection so Phone/mobile/contact properties are not stripped
        const facultyList = await require('../models/Faculty').find().lean();
        const docs = await SessionData.find().lean();

        console.log(`Loaded ${facultyList.length} faculty for data enrichment.`);
        if (facultyList.length > 0) {
            console.log('Sample Faculty Record:', JSON.stringify(facultyList[0], null, 2));
        }

        const extractPhoneVal = (f) => f.Phone || f.phone || f.mobile || f.Mobile || f.contact || f.Contact || f.phone_no || f.mobile_no || '';
        const normalize = (s) => (s || '').replace(/^dr\.|^prof\./i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

        const facultyMap = {};
        facultyList.forEach(f => {
            const phoneStr = extractPhoneVal(f);
            const data = { phone: phoneStr, department: f.department || f.dept || '' };
            if (f.initials) facultyMap[normalize(f.initials)] = data;
            if (f.name) facultyMap[normalize(f.name)] = data;
        });

        // Debug: Log first 5 keys to verify format
        console.log('Sample Normalized Keys:', Object.keys(facultyMap).slice(0, 5));

        const sessionData = {};

        docs.forEach(doc => {
            if (!sessionData[doc.date]) {
                sessionData[doc.date] = {};
            }
            // Deep clone data to modify it
            const enrichedData = JSON.parse(JSON.stringify(doc.data));

            // Helper to inject info
            const injectInfo = (person) => {
                const normInitials = normalize(person.initials);
                const normName = normalize(person.name);

                // Try Exact Match on Normalized Keys
                let info = facultyMap[normName] || facultyMap[normInitials];

                if (info) {
                    console.log(`Matched ${person.name} -> Phone: ${info.phone}, Dept: ${info.department}`);
                    // Inject EVERY possible alias to be safe with exportUtils.js
                    person.phone = info.phone;
                    person.contact = info.phone;
                    person.mobile = info.phone;

                    person.dept = info.department;
                    person.department = info.department;
                } else {
                    console.log(`Failed to match: ${person.name} (${normName})`);
                }
            };

            // Inject Phone Numbers & Department (Deputies & Invigilators)
            if (enrichedData.deputies) {
                enrichedData.deputies.forEach(injectInfo);
            }
            if (enrichedData.invigilators) {
                enrichedData.invigilators.forEach(injectInfo);
            }

            sessionData[doc.date][doc.session] = enrichedData;
        });

        res.json(sessionData);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Clear all allocations
// @route   DELETE /api/allocations
// @access  Public
exports.clearAllocations = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ msg: 'Password is required to confirm deletion' });
        }

        // Middleware strips password, so re-fetch user with password
        const user = await require('../models/User').findById(req.user._id);

        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ msg: 'Invalid Password. Deletion failed.' });
        }

        await SessionData.deleteMany({});
        // Also clear legacy collections to be clean
        await AllocationDetail.deleteMany({});
        await SessionConfig.deleteMany({});

        // Clear Faculty Duties
        await Faculty.updateMany({}, { $set: { duties: [], totalAllotments: 0 } });

        res.json({ msg: 'Database cleared successfully (All Sessions Removed)' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get allocations for a specific faculty (Legacy/Search support)
// @route   GET /api/allocations/faculty/:id
// @access  Public
exports.getFacultyAllocations = async (req, res) => {
    try {
        const { id } = req.params;
        const faculty = await Faculty.findById(id);

        if (!faculty) {
            return res.status(404).json({ msg: 'Faculty not found' });
        }

        console.log(`DEBUG API: Fetching duties for ${faculty.name}`);
        console.log(`DEBUG API: Duties count: ${faculty.duties ? faculty.duties.length : 'undefined'}`);
        // console.log(`DEBUG API: Full object:`, faculty);

        res.json(faculty.duties || []);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Search allocations (by name or initials)
// @route   GET /api/allocations/search
// @access  Public
exports.searchAllocations = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ msg: 'Query parameter q is required' });

        // Search inside the 'data' object using regex
        // We look for 'data.deputies.name', 'data.invigilators.name', etc.
        const regex = new RegExp(q, 'i');

        const docs = await SessionData.find({
            $or: [
                { 'data.deputies.name': regex },
                { 'data.invigilators.name': regex },
                { 'data.deputies.initials': regex },
                { 'data.invigilators.initials': regex }
            ]
        });

        // We need to flatten this to a list of allocations for the UI to display search results?
        // Or just return the sessions?
        // Legacy returned a list of allocation objects.
        const results = [];
        docs.forEach(doc => {
            const { deputies, invigilators } = doc.data;
            if (deputies) {
                deputies.forEach(d => {
                    if (d.name.match(regex) || (d.initials && d.initials.match(regex))) {
                        results.push({ ...d, date: doc.date, session: doc.session, role: 'Deputy' });
                    }
                });
            }
            if (invigilators) {
                invigilators.forEach(i => {
                    if (i.name.match(regex) || (i.initials && i.initials.match(regex))) {
                        results.push({ ...i, date: doc.date, session: doc.session, role: 'Invigilator' });
                    }
                });
            }
        });

        res.json(results);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.syncFacultyDuties = syncFacultyDuties;
