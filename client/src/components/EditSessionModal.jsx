import React, { useState, useEffect } from 'react';

const AVAILABLE_ROOMS = [
    'GJCB101', 'GJCB102', 'GJCB105', 'GJCB106', 'GJCB107', 'GJCB201', 'GJCB202', 'GJCB205', 'GJCB207', 'GJCB208',
    'GJCB301', 'GJCB302', 'GJCB305', 'GJCB307', 'GJCB308', 'GJCB401', 'GJCB402', 'GJCB405', 'GJCB407', 'GJCB408',
    'CSL001', 'CSL002', 'CSL003', 'CSL101', 'CSL102', 'CSL103', 'CSL104', 'CSL105',
    'ISE301', 'ISE302', 'ISE303', 'ISE304', 'ISE305', 'ISE306',
    'E&C201A', 'E&C201B', 'E&C301A', 'E&C301B', 'E&C402', 'E&C403', 'E&C404', 'E&C405', 'E&C406', 'E&C407',
    'TEL101A', 'TEL101B',
    'MEL102', 'MEL103', 'MEL301', 'MEL302', 'MEL303', 'MEL306', 'MEL307',
    'CHL201', 'CHL202', 'CHL203', 'CHL204',
    'Reliever', 'Extra', 'Unassigned'
];

const EditSessionModal = ({ isOpen, onClose, date, session, sessionData, onSave }) => {
    const [localData, setLocalData] = useState(null);
    const [selectedPerson, setSelectedPerson] = useState(null); // { person, role, date, session, index }
    const [targetDate, setTargetDate] = useState('');
    const [targetSession, setTargetSession] = useState('morning');
    const [targetPerson, setTargetPerson] = useState(null); // { person, role, date, session, index }
    const [isSwapMode, setIsSwapMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        if (sessionData && date && session) {
            setLocalData(JSON.parse(JSON.stringify(sessionData)));
            setTargetDate(date);
            setTargetSession(session);
            setSelectedPerson(null);
            setTargetPerson(null);
            setIsSwapMode(false);
            setToast(null);
        }
    }, [sessionData, date, session, isOpen]);

    if (!isOpen || !localData || !localData[date] || !localData[date][session]) {
        return null;
    }

    const currentSessionData = localData[date][session];
    const availableDates = Object.keys(localData).sort();

    // Start Swap Flow for a source person
    const handleStartSwap = (person, role, index) => {
        setSelectedPerson({ person, role, date, session, index });
        setTargetDate(date);
        setTargetSession(session);
        setTargetPerson(null);
        setIsSwapMode(true);
    };

    // Candidate target list filtered by role (Deputy vs Invigilator)
    const getTargetCandidates = () => {
        if (!selectedPerson || !targetDate || !targetSession) return [];
        const targetObj = localData[targetDate]?.[targetSession];
        if (!targetObj) return [];

        const listKey = selectedPerson.role === 'Deputy' ? 'deputies' : 'invigilators';
        const candidates = (targetObj[listKey] || []).map((p, idx) => ({
            person: p,
            role: selectedPerson.role,
            date: targetDate,
            session: targetSession,
            index: idx
        }));

        // Filter out the exact same person if same date & session
        if (targetDate === selectedPerson.date && targetSession === selectedPerson.session) {
            return candidates.filter(c => c.index !== selectedPerson.index);
        }
        return candidates;
    };

    // Execute Swap in local state
    const handleConfirmSwap = () => {
        if (!selectedPerson || !targetPerson) return;

        const updatedData = JSON.parse(JSON.stringify(localData));

        const srcKey = selectedPerson.role === 'Deputy' ? 'deputies' : 'invigilators';
        const tgtKey = targetPerson.role === 'Deputy' ? 'deputies' : 'invigilators';

        const srcList = updatedData[selectedPerson.date][selectedPerson.session][srcKey];
        const tgtList = updatedData[targetPerson.date][targetPerson.session][tgtKey];

        const srcPersonObj = srcList[selectedPerson.index];
        const tgtPersonObj = tgtList[targetPerson.index];

        // Preserve room and slNo at each location, swap faculty identity details
        const newSrcPerson = {
            ...tgtPersonObj,
            room: srcPersonObj.room || '',
            slNo: srcPersonObj.slNo || selectedPerson.index + 1
        };

        const newTgtPerson = {
            ...srcPersonObj,
            room: tgtPersonObj.room || '',
            slNo: tgtPersonObj.slNo || targetPerson.index + 1
        };

        srcList[selectedPerson.index] = newSrcPerson;
        tgtList[targetPerson.index] = newTgtPerson;

        setLocalData(updatedData);
        setIsSwapMode(false);
        setSelectedPerson(null);
        setTargetPerson(null);
    };

    // Check for duplicate rooms among invigilators in any session
    const checkDuplicateRooms = (data) => {
        const duplicates = [];
        if (!data) return duplicates;

        Object.keys(data).forEach(d => {
            Object.keys(data[d] || {}).forEach(s => {
                const invs = data[d][s]?.invigilators || [];
                const roomMap = {};

                invs.forEach(inv => {
                    const room = inv.room ? inv.room.trim() : '';
                    if (room && room !== 'Reliever' && room !== 'Extra' && room !== 'Unassigned') {
                        if (!roomMap[room]) {
                            roomMap[room] = [];
                        }
                        roomMap[room].push(inv.name || `Invigilator #${inv.slNo || ''}`);
                    }
                });

                Object.keys(roomMap).forEach(room => {
                    if (roomMap[room].length > 1) {
                        duplicates.push({
                            date: d,
                            session: s,
                            room: room,
                            invigilators: roomMap[room]
                        });
                    }
                });
            });
        });

        return duplicates;
    };

    // Save changes to database
    const handleSave = async () => {
        const duplicates = checkDuplicateRooms(localData);
        if (duplicates.length > 0) {
            const firstDup = duplicates[0];
            setToast({
                title: 'NOT ALLOWED!',
                message: `Room "${firstDup.room}" is assigned to multiple invigilators (${firstDup.invigilators.join(' & ')}) in ${firstDup.date} (${firstDup.session.toUpperCase()}). Please assign unique rooms before saving.`
            });
            return;
        }

        setIsSaving(true);
        try {
            await onSave(localData);
            onClose();
        } catch (err) {
            console.error('Error saving edited session:', err);
        } finally {
            setIsSaving(false);
        }
    };

    // Pre-calculate room counts for current session to detect duplicates live
    const invigilatorRoomCounts = {};
    if (currentSessionData && currentSessionData.invigilators) {
        currentSessionData.invigilators.forEach(inv => {
            const r = inv.room ? inv.room.trim() : '';
            if (r && r !== 'Reliever' && r !== 'Extra' && r !== 'Unassigned') {
                invigilatorRoomCounts[r] = (invigilatorRoomCounts[r] || 0) + 1;
            }
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-retro-dark/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
            <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Modal Header */}
                <div className="px-8 py-5 border-b-2 border-retro-dark bg-retro-blue text-white flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Edit Session Allotment</h3>
                        <p className="text-xs font-bold text-white/80 uppercase tracking-widest mt-0.5">
                            {date} &bull; <span className="underline">{session.toUpperCase()}</span> Session
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20"
                    >
                        <i className="bi bi-x-lg text-lg"></i>
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto flex-1 bg-retro-white space-y-6">

                    {/* UI Notification Toast Pop-up Banner */}
                    {toast && (
                        <div className="bg-red-600 text-white p-4 rounded-xl shadow-paper border-2 border-retro-dark flex items-start justify-between gap-3 animate-in slide-in-from-top-3 duration-300">
                            <div className="flex items-start gap-3">
                                <i className="bi bi-exclamation-octagon-fill text-2xl text-white shrink-0 mt-0.5"></i>
                                <div>
                                    <h5 className="font-black text-sm uppercase tracking-wide">{toast.title}</h5>
                                    <p className="text-xs font-bold text-white/95 mt-0.5 leading-relaxed">{toast.message}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setToast(null)}
                                className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1 transition-colors shrink-0"
                                title="Dismiss Notification"
                            >
                                <i className="bi bi-x-lg text-sm"></i>
                            </button>
                        </div>
                    )}

                    {/* Swap Interface Drawer if Swap Mode is active */}
                    {isSwapMode && selectedPerson && (
                        <div className="bg-retro-cream/40 border-2 border-retro-dark rounded-xl p-5 shadow-sm space-y-4 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex justify-between items-center border-b-2 border-retro-dark/10 pb-3">
                                <div className="flex items-center gap-2">
                                    <i className="bi bi-arrow-left-right text-retro-blue text-lg"></i>
                                    <h4 className="font-black text-retro-dark uppercase text-sm">
                                        Reassign / Swap Duty for <span className="text-retro-blue">{selectedPerson.person.name}</span> ({selectedPerson.role})
                                    </h4>
                                </div>
                                <button
                                    onClick={() => setIsSwapMode(false)}
                                    className="text-xs font-bold text-retro-secondary hover:text-retro-red uppercase"
                                >
                                    Cancel Swap
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label className="block text-[10px] font-black text-retro-dark uppercase tracking-wider mb-1">Target Date</label>
                                    <select
                                        value={targetDate}
                                        onChange={(e) => {
                                            setTargetDate(e.target.value);
                                            setTargetPerson(null);
                                        }}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-retro-dark bg-white font-bold text-xs uppercase"
                                    >
                                        {availableDates.map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-retro-dark uppercase tracking-wider mb-1">Target Session</label>
                                    <select
                                        value={targetSession}
                                        onChange={(e) => {
                                            setTargetSession(e.target.value);
                                            setTargetPerson(null);
                                        }}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-retro-dark bg-white font-bold text-xs uppercase"
                                    >
                                        <option value="morning">Morning (AM)</option>
                                        <option value="afternoon">Afternoon (PM)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-retro-dark uppercase tracking-wider mb-1">
                                        Select {selectedPerson.role === 'Deputy' ? 'Superintendent (Professor)' : 'Invigilator (Lecturer)'} to Swap
                                    </label>
                                    <select
                                        value={targetPerson ? targetPerson.index : ''}
                                        onChange={(e) => {
                                            const idx = parseInt(e.target.value);
                                            const candidates = getTargetCandidates();
                                            const found = candidates.find(c => c.index === idx);
                                            setTargetPerson(found || null);
                                        }}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-retro-dark bg-white font-bold text-xs uppercase"
                                    >
                                        <option value="">-- Choose Faculty to Swap With --</option>
                                        {getTargetCandidates().map(c => (
                                            <option key={c.index} value={c.index}>
                                                {c.person.name} ({c.person.initials || 'N/A'}) - Room: {c.person.room || 'Unassigned'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Swap Preview */}
                            {targetPerson && (
                                <div className="bg-white p-4 rounded-lg border-2 border-retro-blue flex items-center justify-between gap-4">
                                    <div className="flex-1 text-center">
                                        <span className="text-[10px] font-black text-retro-secondary uppercase block">Source Duty ({selectedPerson.date} {selectedPerson.session.toUpperCase()})</span>
                                        <span className="font-black text-retro-dark text-sm">{selectedPerson.person.name}</span>
                                        <span className="text-xs font-mono block text-retro-blue">Room: {selectedPerson.person.room || 'Unassigned'}</span>
                                    </div>
                                    <i className="bi bi-arrow-left-right text-2xl text-retro-blue"></i>
                                    <div className="flex-1 text-center">
                                        <span className="text-[10px] font-black text-retro-secondary uppercase block">Target Duty ({targetPerson.date} {targetPerson.session.toUpperCase()})</span>
                                        <span className="font-black text-retro-dark text-sm">{targetPerson.person.name}</span>
                                        <span className="text-xs font-mono block text-retro-blue">Room: {targetPerson.person.room || 'Unassigned'}</span>
                                    </div>
                                    <button
                                        onClick={handleConfirmSwap}
                                        className="px-5 py-2.5 bg-retro-blue text-white rounded-lg font-black text-xs uppercase border-2 border-retro-dark shadow-sm hover:bg-blue-600 transition-all shrink-0"
                                    >
                                        Confirm Swap
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Deputy Chiefs Table */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-black text-retro-dark text-sm uppercase tracking-wide flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                                Deputy Superintendents (Professors)
                            </h4>
                            <span className="text-xs font-bold text-retro-secondary">
                                {currentSessionData.deputies ? currentSessionData.deputies.length : 0} Allocated
                            </span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border-2 border-retro-dark shadow-sm">
                            <table className="w-full text-left border-collapse bg-white">
                                <thead className="bg-retro-cream text-retro-dark">
                                    <tr className="text-[10px] font-black uppercase tracking-wider border-b-2 border-retro-dark">
                                        <th className="px-4 py-3">Sl No</th>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Initials</th>
                                        <th className="px-4 py-3">Department</th>
                                        <th className="px-4 py-3">Role / Duty</th>
                                        <th className="px-4 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-retro-dark/10">
                                    {(!currentSessionData.deputies || currentSessionData.deputies.length === 0) ? (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-4 text-center text-xs font-bold text-retro-secondary">
                                                No Deputy Superintendents assigned for this session.
                                            </td>
                                        </tr>
                                    ) : (
                                        currentSessionData.deputies.map((dep, idx) => (
                                            <tr key={idx} className="hover:bg-retro-cream/20 transition-colors">
                                                <td className="px-4 py-3 text-xs font-bold text-retro-dark">{idx + 1}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-retro-dark">{dep.name}</td>
                                                <td className="px-4 py-3 text-xs font-mono font-bold text-retro-secondary">{dep.initials || '-'}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-retro-secondary">{dep.department || dep.dept || '-'}</td>
                                                <td className="px-4 py-3">
                                                    <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded border border-purple-200 text-xs font-bold font-mono inline-flex items-center gap-1.5">
                                                        <i className="bi bi-person-badge-fill text-purple-500"></i>
                                                        Deputy Supt.
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => handleStartSwap(dep, 'Deputy', idx)}
                                                        className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded text-[10px] font-black uppercase tracking-wider border border-purple-300 transition-colors"
                                                    >
                                                        Reassign / Swap
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Invigilators Table */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-black text-retro-dark text-sm uppercase tracking-wide flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-retro-blue"></span>
                                Invigilators (Lecturers)
                            </h4>
                            <span className="text-xs font-bold text-retro-secondary">
                                {currentSessionData.invigilators ? currentSessionData.invigilators.length : 0} Allocated
                            </span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border-2 border-retro-dark shadow-sm">
                            <table className="w-full text-left border-collapse bg-white">
                                <thead className="bg-retro-cream text-retro-dark">
                                    <tr className="text-[10px] font-black uppercase tracking-wider border-b-2 border-retro-dark">
                                        <th className="px-4 py-3">Sl No</th>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Initials</th>
                                        <th className="px-4 py-3">Department</th>
                                        <th className="px-4 py-3">Room / Duty</th>
                                        <th className="px-4 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-retro-dark/10">
                                    {(!currentSessionData.invigilators || currentSessionData.invigilators.length === 0) ? (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-4 text-center text-xs font-bold text-retro-secondary">
                                                No Invigilators assigned for this session.
                                            </td>
                                        </tr>
                                    ) : (
                                        currentSessionData.invigilators.map((inv, idx) => {
                                            const roomVal = inv.room ? inv.room.trim() : '';
                                            const isDup = roomVal && roomVal !== 'Reliever' && roomVal !== 'Extra' && roomVal !== 'Unassigned' && invigilatorRoomCounts[roomVal] > 1;
                                            
                                            return (
                                                <tr key={idx} className={`transition-colors ${isDup ? 'bg-red-50/70 hover:bg-red-100/50' : 'hover:bg-retro-cream/20'}`}>
                                                    <td className="px-4 py-3 text-xs font-bold text-retro-dark">{inv.slNo || idx + 1}</td>
                                                    <td className="px-4 py-3 text-xs font-bold text-retro-dark">{inv.name}</td>
                                                    <td className="px-4 py-3 text-xs font-mono font-bold text-retro-secondary">{inv.initials || '-'}</td>
                                                    <td className="px-4 py-3 text-xs font-bold text-retro-secondary">{inv.dept || inv.department || '-'}</td>
                                                    <td className="px-4 py-3">
                                                        <select
                                                            value={inv.room || ''}
                                                            onChange={(e) => {
                                                                const updated = JSON.parse(JSON.stringify(localData));
                                                                updated[date][session].invigilators[idx].room = e.target.value;
                                                                setLocalData(updated);
                                                                setToast(null);
                                                            }}
                                                            className={`px-2 py-1 border-2 rounded font-mono text-xs font-bold w-36 bg-white outline-none cursor-pointer transition-colors ${
                                                                isDup 
                                                                    ? 'border-red-500 text-red-900 focus:border-red-600 bg-red-50' 
                                                                    : 'border-retro-dark/30 focus:border-retro-blue hover:border-retro-blue'
                                                            }`}
                                                        >
                                                            <option value="">-- Choose Room --</option>
                                                            {AVAILABLE_ROOMS.map(r => (
                                                                <option key={r} value={r}>{r}</option>
                                                            ))}
                                                            {inv.room && !AVAILABLE_ROOMS.includes(inv.room) && (
                                                                <option value={inv.room}>{inv.room}</option>
                                                            )}
                                                        </select>
                                                        {isDup && (
                                                            <span className="text-[10px] font-bold text-red-600 flex items-center gap-1 mt-0.5">
                                                                <i className="bi bi-exclamation-triangle-fill"></i> Duplicate Room
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => handleStartSwap(inv, 'Invigilator', idx)}
                                                            className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-[10px] font-black uppercase tracking-wider border border-blue-300 transition-colors"
                                                        >
                                                            Reassign / Swap
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="px-8 py-4 bg-retro-cream/40 border-t-2 border-retro-dark flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-6 py-2.5 rounded-lg font-bold text-retro-secondary hover:text-retro-dark hover:bg-retro-dark/5 transition uppercase tracking-wider text-xs"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-8 py-2.5 rounded-lg font-black text-white bg-emerald-600 hover:bg-emerald-500 shadow-paper hover:translate-y-[-2px] active:translate-y-[0px] transition-all border-2 border-retro-dark uppercase tracking-wider text-xs flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Saving Changes...
                            </>
                        ) : (
                            <>
                                <i className="bi bi-cloud-arrow-up-fill text-base"></i>
                                Save & Publish Edits
                            </>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default EditSessionModal;
