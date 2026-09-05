import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { parseSessionData } from '../utils/documentParser';
import { generateRoomReport, generateDepartmentReport, generateRoomPDF, generateDepartmentPDF } from '../utils/exportUtils';
import EditSessionModal from '../components/EditSessionModal';

const ROOM_LIST = [
    'GJCB101', 'GJCB102', 'GJCB105', 'GJCB106', 'GJCB107', 'GJCB201', 'GJCB202', 'GJCB205', 'GJCB207', 'GJCB208',
    'GJCB301', 'GJCB302', 'GJCB305', 'GJCB307', 'GJCB308', 'GJCB401', 'GJCB402', 'GJCB405', 'GJCB407', 'GJCB408',
    'CSL001', 'CSL002', 'CSL003', 'CSL101', 'CSL102', 'CSL103', 'CSL104', 'CSL105',
    'ISE301', 'ISE302', 'ISE303', 'ISE304', 'ISE305', 'ISE306',
    'E&C201A', 'E&C201B', 'E&C301A', 'E&C301B', 'E&C302', 'E&C402', 'E&C403', 'E&C404', 'E&C405', 'E&C406', 'E&C407',
    'TEL101A', 'TEL101B',
    'MEL102', 'MEL103', 'MEL301', 'MEL302', 'MEL303', 'MEL306', 'MEL307',
    'CHL201', 'CHL202', 'CHL203', 'CHL204'
];

// Helper to perform allocation logic (Pure function)
const performAllocation = (data) => {
    console.log('Starting randomization logic...');
    const newSessionData = JSON.parse(JSON.stringify(data)); // Deep copy

    Object.keys(newSessionData).forEach(date => {
        Object.keys(newSessionData[date]).forEach(session => {
            const sessionInfo = newSessionData[date][session];

            if (sessionInfo.invigilators && sessionInfo.invigilators.length > 0) {
                // Shuffle Invigilators
                let invigilators = [...sessionInfo.invigilators];
                for (let i = invigilators.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [invigilators[i], invigilators[j]] = [invigilators[j], invigilators[i]];
                }

                // Assign Rooms
                let numberOfRooms = 0;
                if (sessionInfo.examInfo?.rooms) {
                    numberOfRooms = parseInt(sessionInfo.examInfo.rooms);
                } else if (sessionInfo.rooms) {
                    numberOfRooms = parseInt(sessionInfo.rooms);
                }

                console.log(`Date: ${date}, Session: ${session}, Rooms Configured: ${numberOfRooms}`);

                if (numberOfRooms === 0) {
                    console.warn(`Warning: No rooms configured for ${date} ${session}. All will be Extra.`);
                }

                let i = 0; // invigilator index
                let r = 0; // room index (from ROOM_LIST)
                let allocated = 0;

                while (allocated < numberOfRooms && r < ROOM_LIST.length && i < invigilators.length) {
                    // Allocate up to 5 Rooms
                    for (let c = 0; c < 5; c++) {
                        if (allocated < numberOfRooms && r < ROOM_LIST.length && i < invigilators.length) {
                            invigilators[i].room = ROOM_LIST[r];
                            i++;
                            r++;
                            allocated++;
                        }
                    }

                    // Allocate 1 Reliever
                    if (i < invigilators.length && allocated < numberOfRooms) {
                        invigilators[i].room = 'Reliever';
                        i++;
                    }
                }

                // Mark rest as Extra
                while (i < invigilators.length) {
                    invigilators[i].room = 'Extra';
                    i++;
                }

                // Renumber Sl No
                invigilators.forEach((inv, idx) => inv.slNo = idx + 1);

                sessionInfo.invigilators = invigilators;
            }
        });
    });
    return newSessionData;
};

const RoomAllotment = () => {
    const [sessionData, setSessionData] = useState({});
    const [status, setStatus] = useState('');
    const [isManualMode, setIsManualMode] = useState(false); // Track if user is manually editing
    const [editingSession, setEditingSession] = useState(null); // { date, session }

    const handleSaveEditedData = async (updatedData) => {
        try {
            await axios.post('/api/allocations', { ...updatedData, password: 'AUTO_SAVE_BYPASS' });
            setSessionData(updatedData);
            setIsManualMode(false);
            alert("Session edits & faculty duty swaps saved successfully!");
        } catch (err) {
            console.error("Failed to save edited session:", err);
            const errMsg = err.response?.data?.msg || err.message;
            alert(`Error saving edits: ${errMsg}`);
            throw err;
        }
    };

    // Helper to check if data is already allocated
    const checkIfAllocated = (data) => {
        let hasAssignments = false;
        if (data && typeof data === 'object') {
            Object.values(data).forEach(dateObj => {
                Object.values(dateObj).forEach(session => {
                    // If any room is assigned (even 'Extra' or 'Reliever'), we consider it allocated
                    // because auto-allocation assigns everyone to at least 'Extra'.
                    if (session.invigilators && session.invigilators.some(inv => inv.room && inv.room.trim() !== '' && inv.room !== 'Unassigned')) {
                        hasAssignments = true;
                    }
                });
            });
        }
        return hasAssignments;
    };


    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            const parsedData = parseSessionData(content);
            setSessionData(parsedData);
            setIsManualMode(true); // Uploading file starts manual mode
            setStatus(`Loaded data for ${Object.keys(parsedData).length} dates.`);
        };
        reader.readAsText(file);
    };

    const handleLoadFromDB = async (isAutoLoad = false) => {
        try {
            const res = await axios.get('/api/allocations');
            const data = res.data;
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
                // If DB is empty, default to manual mode false (or true? doesn't matter as data is empty)
                setIsManualMode(true);
                if (!isAutoLoad) alert('No data found in database.');
                return;
            }

            // Validate keys (dates) and values (sessions)
            const validData = Object.keys(data).reduce((acc, key) => {
                if (data[key] && typeof data[key] === 'object' && Object.keys(data[key]).length > 0) {
                    acc[key] = data[key];
                }
                return acc;
            }, {});

            if (Object.keys(validData).length === 0) {
                console.warn('Data loaded but contained no valid session objects', data);
                if (!isAutoLoad) alert('No valid session data found.');
                return;
            }

            console.log('Loaded valid data from DB:', validData);

            // AUTO-ALLOCATION LOGIC
            const hasAssignments = checkIfAllocated(validData);

            if (!hasAssignments) {
                console.log('Fresh data detected (no rooms assigned). Auto-Allocating...');
                const allocatedData = performAllocation(validData);
                setSessionData(allocatedData);
                setIsManualMode(true); // Keep enabled initially in case auto-save fails

                // Auto-Save
                try {
                    console.log('Auto-Saving allocated data...');
                    await axios.post('/api/allocations', { ...allocatedData, password: 'AUTO_SAVE_BYPASS' });
                    setStatus(`Loaded, Auto-Allocated & Saved for ${Object.keys(allocatedData).length} dates.`);
                    setIsManualMode(false); // Success! Disable buttons.
                } catch (saveErr) {
                    console.error('Auto-Save Failed:', saveErr);
                    setStatus('Auto-Allocation successful, but Auto-Save failed. Please click Save Allocation manually.');
                    sessionStorage.removeItem('hasAutoAllocated_rooms_v3');
                }
            } else {
                setSessionData(validData);
                setIsManualMode(false); // Loaded pre-allocated data means buttons disabled
                setStatus(`Loaded data for ${Object.keys(validData).length} dates from DB.`);
                if (!isAutoLoad) alert('Data loaded from Database!');
            }

        } catch (err) {
            console.error('Load Error:', err);
            if (!isAutoLoad) alert('Failed to load data from database.');
        }
    };

    useEffect(() => {
        handleLoadFromDB(true); // Auto-load on mount, with safety checks
    }, []);

    useEffect(() => {
        const handleAIDownload = (e) => {
            const data = e.detail;
            console.log("AI PDF Request:", data);
            if (Object.keys(sessionData).length > 0) {
                if (data.downloadType === 'department') {
                    generateDepartmentPDF(sessionData, data.department);
                } else {
                    generateRoomPDF(sessionData);
                }
            } else {
                alert("AI tried to download PDF, but no data is loaded yet.");
            }
        };

        window.addEventListener('ai-download-pdf', handleAIDownload);
        return () => window.removeEventListener('ai-download-pdf', handleAIDownload);
    }, [sessionData]);

    const handleRandomize = async () => {
        // Automation check removed, reusing helper
        try {
            console.log('Starting randomization...');
            const newSessionData = performAllocation(sessionData);
            console.log('Randomization complete.');
            setSessionData(newSessionData);
            // Manual allocation keeps manual mode active (or sets it true)
            setIsManualMode(true);
            alert('Room Allocation Complete! (Not saved to DB. Click "Save Allocation" to persist.)');
        } catch (err) {
            console.error('Allocation Error:', err);
            alert('An error occurred during the allocation process.');
        }
    };

    const handleSaveToDB = async () => {
        const pin = prompt("Enter Administrator PIN to Save to Database:");
        if (pin !== "1234") {
            alert("Incorrect PIN. Action cancelled.");
            return;
        }

        try {
            console.log('Sending sessionData:', JSON.stringify(sessionData, null, 2));
            const res = await axios.post('/api/allocations', { ...sessionData, password: pin });
            alert(`Allocations saved! Stats: ${JSON.stringify(res.data.stats)}`);
            // Disable buttons after successful manual save
            setIsManualMode(false);
        } catch (err) {
            console.error('Save Error:', err);
            const errMsg = err.response?.data?.msg || err.response?.data || err.message;
            alert(`Error saving allocations: ${errMsg}`);
        }
    };



    const handleDownloadSession = (date, session) => {
        const singleSessionData = {
            [date]: {
                [session]: sessionData[date][session]
            }
        };
        const filename = `Room_Allotment_${date}_${session}.doc`;
        generateRoomReport(singleSessionData, filename);
    };

    const handleDownloadPDF = (date, session) => {
        try {
            const singleSessionData = {
                [date]: {
                    [session]: sessionData[date][session]
                }
            };
            const filename = `Room_Allotment_${date}_${session}.pdf`;
            generateRoomPDF(singleSessionData, filename);
        } catch (error) {
            console.error("PDF Download Error:", error);
            alert("Error initiating PDF download.");
        }
    };

    return (
        <div className="space-y-10 pb-20 font-sans text-retro-dark">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b-2 border-retro-dark/10 pb-6">
                <div>
                    <h1 className="text-3xl font-black text-retro-dark tracking-tight uppercase">Reports download (Dept and Date wise)</h1>
                    <p className="text-retro-secondary text-sm font-bold mt-1 tracking-wide uppercase">Upload exam schedules to allocate rooms.</p>
                </div>
            </div>

            <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Upload Card */}
                <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden">
                    {Object.keys(sessionData).length === 0 && (
                        <div className="p-6 text-center">
                            <h3 className="text-xl font-black text-retro-dark mb-1 uppercase tracking-tight">Upload document file</h3>
                            <p className="text-retro-secondary mb-6 max-w-sm mx-auto font-bold text-xs uppercase tracking-wide">Drag & Drop HTML/DOC file to load session data</p>

                            <div className="relative inline-block w-full max-w-sm group">
                                <input
                                    type="file"
                                    accept=".html,.htm,.doc,.docx"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                                />
                                <div className="flex flex-col items-center justify-center w-full px-6 py-8 border-2 border-dashed border-retro-secondary/30 rounded-xl bg-retro-cream/10 transition-all duration-300 group-hover:bg-retro-cream/30 group-hover:border-retro-dark hover:shadow-inner">
                                    <i className="bi bi-cloud-arrow-up-fill text-3xl text-retro-dark/50 mb-2 transition-all group-hover:text-retro-dark group-hover:scale-110"></i>
                                    <span className="text-retro-dark font-black uppercase tracking-wider text-xs transition-transform group-hover:translate-y-[-1px]">
                                        Choose File
                                    </span>
                                </div>
                            </div>
                            <p className="text-[9px] text-retro-secondary/70 mt-3 font-bold uppercase tracking-widest">Supported: HTML, DOC</p>
                        </div>
                    )}

                    <div className={`bg-retro-cream/30 px-8 py-6 flex flex-wrap justify-center gap-4 ${Object.keys(sessionData).length === 0 ? 'border-t-2 border-retro-dark' : ''}`}>
                        <button
                            className="bg-retro-blue hover:bg-retro-blue/90 text-white px-6 py-3 rounded-lg font-black shadow-paper active:translate-y-[0px] hover:translate-y-[-2px] transition-all flex items-center gap-2 border-2 border-retro-dark uppercase tracking-wider text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                            onClick={handleRandomize}
                            disabled={Object.keys(sessionData).length === 0 || !isManualMode}
                        >
                            Allocate Room
                        </button>
                        <button
                            className="bg-retro-dark hover:bg-retro-dark/90 text-white px-6 py-3 rounded-lg font-black shadow-paper active:translate-y-[0px] hover:translate-y-[-2px] transition-all flex items-center gap-2 border-2 border-retro-dark uppercase tracking-wider text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                            onClick={handleSaveToDB}
                            disabled={Object.keys(sessionData).length === 0 || !isManualMode}
                        >
                            Save Allocation
                        </button>
                        <button
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-black shadow-paper active:translate-y-[0px] hover:translate-y-[-2px] transition-all flex items-center gap-2 border-2 border-retro-dark uppercase tracking-wider text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                            onClick={() => generateRoomReport(sessionData)}
                            disabled={Object.keys(sessionData).length === 0}
                        >
                            Export Report
                        </button>
                        <button
                            className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-lg font-black shadow-paper active:translate-y-[0px] hover:translate-y-[-2px] transition-all flex items-center gap-2 border-2 border-retro-dark uppercase tracking-wider text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                            onClick={() => generateRoomPDF(sessionData)}
                            disabled={Object.keys(sessionData).length === 0}
                        >
                            Export PDF
                        </button>
                        <button
                            className="bg-teal-600 hover:bg-teal-500 text-white px-6 py-3 rounded-lg font-black shadow-paper active:translate-y-[0px] hover:translate-y-[-2px] transition-all flex items-center gap-2 border-2 border-retro-dark uppercase tracking-wider text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                            onClick={() => generateDepartmentReport(sessionData)}
                            disabled={Object.keys(sessionData).length === 0}
                        >
                            Dept Report
                        </button>
                        <button
                            className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-3 rounded-lg font-black shadow-paper active:translate-y-[0px] hover:translate-y-[-2px] transition-all flex items-center gap-2 border-2 border-retro-dark uppercase tracking-wider text-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                            onClick={() => generateDepartmentPDF(sessionData)}
                            disabled={Object.keys(sessionData).length === 0}
                        >
                            Dept PDF
                        </button>

                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">

                {/* Preview Section */}
                {sessionData && typeof sessionData === 'object' && Object.keys(sessionData).length > 0 && (
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden">
                        <div className="px-6 py-4 border-b-2 border-retro-dark bg-retro-cream/30 flex justify-between items-center">
                            <h4 className="font-black text-retro-dark flex items-center gap-3 uppercase tracking-tight">
                                Downloads
                            </h4>
                            <span className="text-[10px] font-black text-retro-dark uppercase tracking-widest bg-retro-white px-3 py-1.5 rounded-lg border-2 border-retro-dark shadow-sm">
                                {Object.keys(sessionData).length} Dates Loaded
                            </span>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.keys(sessionData).map(date => (
                                    <div key={date} className="p-5 rounded-xl border-2 border-retro-dark bg-retro-white hover:bg-retro-cream/20 hover:shadow-paper hover:translate-y-[-2px] transition-all group">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-lg bg-retro-dark text-retro-cream flex items-center justify-center font-black text-lg border-2 border-retro-dark group-hover:rotate-6 transition-transform">
                                                {new Date(date).getDate()}
                                            </div>
                                            <div>
                                                <h6 className="font-black text-retro-dark uppercase tracking-tight text-sm">{date}</h6>
                                                <div className="text-[10px] font-bold text-retro-secondary uppercase tracking-wider">
                                                    {Object.keys(sessionData[date]).length} Sessions
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex gap-2 flex-wrap">
                                            {Object.keys(sessionData[date]).sort((a, b) => {
                                                if (a === 'morning') return -1;
                                                if (b === 'morning') return 1;
                                                return 0;
                                            }).map(session => (
                                                <div key={session} className="flex items-center bg-white border-2 border-retro-border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="px-3 py-1.5 text-[10px] font-black uppercase text-retro-secondary bg-retro-cream/20 border-r-2 border-retro-border">
                                                        {session}
                                                    </div>
                                                    <button
                                                        onClick={() => handleDownloadSession(date, session)}
                                                        className="px-2 py-1.5 text-retro-blue hover:bg-retro-blue hover:text-white transition-colors border-r-2 border-retro-border"
                                                        title="Download Word Doc"
                                                    >
                                                        <i className="bi bi-file-word-fill"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownloadPDF(date, session)}
                                                        className="px-2 py-1.5 text-retro-red hover:bg-retro-red hover:text-white transition-colors border-r-2 border-retro-border"
                                                        title="Download PDF"
                                                    >
                                                        <i className="bi bi-file-pdf-fill"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingSession({ date, session })}
                                                        className="px-2 py-1.5 text-purple-600 hover:bg-purple-600 hover:text-white transition-colors"
                                                        title="Edit Session & Swap Faculty"
                                                    >
                                                        <i className="bi bi-pencil-square"></i>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Department Downloads Section */}
                {sessionData && typeof sessionData === 'object' && Object.keys(sessionData).length > 0 && (
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden mt-8">
                        <div className="px-6 py-4 border-b-2 border-retro-dark bg-retro-cream/30 flex justify-between items-center">
                            <h4 className="font-black text-retro-dark flex items-center gap-3 uppercase tracking-tight">
                                Department Downloads
                            </h4>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {(() => {
                                    // Extract unique departments
                                    const departments = new Set();
                                    Object.values(sessionData).forEach(sessions => {
                                        Object.values(sessions).forEach(session => {
                                            if (session.deputies) session.deputies.forEach(d => departments.add(d.department || d.dept));
                                            if (session.invigilators) session.invigilators.forEach(i => departments.add(i.dept));
                                        });
                                    });
                                    return Array.from(departments).sort().map((dept, idx) => (
                                        <div key={idx} className="p-4 rounded-xl border-2 border-retro-dark bg-white hover:shadow-md transition-all">
                                            <h5 className="font-bold text-retro-dark mb-3 text-center uppercase text-sm truncate" title={dept}>{dept || 'Unknown'}</h5>
                                            <div className="flex gap-2 justify-center">
                                                <button
                                                    onClick={() => generateDepartmentReport(sessionData, dept)}
                                                    className="px-3 py-1.5 bg-retro-blue text-white rounded text-xs font-bold hover:bg-retro-blue/90 border-2 border-retro-dark shadow-sm uppercase transition-transform active:scale-95"
                                                >
                                                    Word
                                                </button>
                                                <button
                                                    onClick={() => generateDepartmentPDF(sessionData, dept)}
                                                    className="px-3 py-1.5 bg-retro-red text-white rounded text-xs font-bold hover:bg-retro-red/90 border-2 border-retro-dark shadow-sm uppercase transition-transform active:scale-95"
                                                >
                                                    PDF
                                                </button>
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {editingSession && (
                <EditSessionModal
                    isOpen={!!editingSession}
                    onClose={() => setEditingSession(null)}
                    date={editingSession.date}
                    session={editingSession.session}
                    sessionData={sessionData}
                    onSave={handleSaveEditedData}
                />
            )}
        </div>
    );
};

export default RoomAllotment;
