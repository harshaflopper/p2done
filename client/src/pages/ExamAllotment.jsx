import React, { useState, useEffect } from 'react';
import axios from 'axios';
import useExamAllocation from '../hooks/useExamAllocation';
import { generateDeputyReport } from '../utils/exportUtils';
import { useLocation, useNavigate } from 'react-router-dom';
import PasswordConfirmationModal from '../components/PasswordConfirmationModal';
import StatusModal from '../components/StatusModal';

const ExamAllotment = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [faculty, setFaculty] = useState([]);
    const [dates, setDates] = useState([]);
    const [config, setConfig] = useState({});
    const {
        allocations,
        setAllocations,
        startAllocation
    } = useExamAllocation(faculty);

    useEffect(() => {
        fetchFaculty();
        restoreStateFromDB();
    }, []);

    const fetchFaculty = async () => {
        try {
            const res = await axios.get('/api/faculty');
            setFaculty(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const restoreStateFromDB = async () => {
        try {
            const res = await axios.get('/api/allocations');
            const data = res.data;

            if (data && Object.keys(data).length > 0) {
                console.log('Restoring state from DB...');
                const restoredDates = Object.keys(data).sort();
                const restoredConfig = {};
                const restoredAllocations = {};

                restoredDates.forEach(date => {
                    restoredConfig[date] = {};
                    restoredAllocations[date] = {};

                    ['morning', 'afternoon'].forEach(session => {
                        if (data[date][session]) {
                            const sData = data[date][session];

                            // Restore Config
                            restoredConfig[date][session] = {
                                rooms: sData.examInfo?.rooms || 0,
                                relievers: sData.examInfo?.relievers || 0,
                                roomsPerProf: 7, // Default/Assumed
                                required: (sData.examInfo?.rooms || 0) + (sData.examInfo?.relievers || 0)
                            };

                            // Restore Allocations
                            restoredAllocations[date][session] = {
                                deputies: sData.deputies || [],
                                invigilators: sData.invigilators || []
                            };
                        } else {
                            // Default empty config if session missing but date exists
                            restoredConfig[date][session] = { rooms: 40, roomsPerProf: 7, relievers: 12 };
                        }
                    });
                });

                setDates(restoredDates);
                setConfig(restoredConfig);
                setAllocations(restoredAllocations);
                setStep(3); // Jump to Allocation View

                // Also set Date Range for UI consistency if needed
                if (restoredDates.length > 0) {
                    setDateRange({ start: restoredDates[0], end: restoredDates[restoredDates.length - 1] });
                }
            }
        } catch (err) {
            console.error('Failed to restore state:', err);
        }
    };

    // AI Automation Effect
    useEffect(() => {
        if (location.state?.aiMacro && faculty.length > 0) {
            console.log("AI Macro detected!", location.state.aiMacro);
            const macro = location.state.aiMacro;
            if (macro.dates && macro.dates.length > 0) {
                const newDates = macro.dates.sort();
                setSelectedDates(newDates);
                setDates(newDates);
                
                const fullConfig = {};
                newDates.forEach(d => {
                    const amRooms = macro.config?.[d]?.morning?.rooms || 0;
                    const pmRooms = macro.config?.[d]?.afternoon?.rooms || 0;
                    
                    fullConfig[d] = {
                        morning: {
                            rooms: amRooms,
                            roomsPerProf: 7,
                            relievers: Math.ceil((amRooms / 5) + (amRooms * 0.1)),
                        },
                        afternoon: {
                            rooms: pmRooms,
                            roomsPerProf: 7,
                            relievers: Math.ceil((pmRooms / 5) + (pmRooms * 0.1)),
                        }
                    };
                });
                setConfig(fullConfig);
                
                // Auto-Allocate and Save immediately
                setTimeout(async () => {
                    const newAllocations = startAllocation(fullConfig, faculty);
                    setStep(3); 
                    
                    try {
                        const sessionData = {};
                        Object.keys(newAllocations).forEach(date => {
                            sessionData[date] = {};
                            ['morning', 'afternoon'].forEach(session => {
                                if (newAllocations[date][session]) {
                                    sessionData[date][session] = {
                                        examInfo: {
                                            rooms: fullConfig[date][session].rooms,
                                            relievers: fullConfig[date][session].relievers
                                        },
                                        deputies: newAllocations[date][session].deputies || [],
                                        invigilators: newAllocations[date][session].invigilators || []
                                    };
                                }
                            });
                        });
                        
                        console.log('AI Auto-Saving sessionData...');
                        await axios.post('/api/allocations', { ...sessionData, password: 'AUTO_SAVE_BYPASS' });
                        
                        // Clear the room allotment flag so it auto-assigns rooms upon loading!
                        sessionStorage.removeItem('hasAutoAllocated_rooms_v3');
                        
                        // Successfully saved, navigate to Room Allotment for further AI actions!
                        navigate('/room-allotment');
                    } catch (err) {
                        console.error('AI Auto-Save failed', err);
                        alert('Auto-allocation succeeded but Auto-save failed. Please save manually.');
                    }
                    
                }, 100);
                
                // Clear the state so it doesn't re-run on refresh
                window.history.replaceState({}, document.title);
            }
        }
    }, [location.state, faculty]);

    const handleConfigChange = (date, session, field, value) => {
        const newConfig = { ...config };
        newConfig[date][session][field] = parseInt(value) || 0;
        const rooms = newConfig[date][session].rooms;
        const relievers = newConfig[date][session].relievers;
        newConfig[date][session].required = rooms + relievers;
        setConfig(newConfig);
    };

    const handleAllocate = () => {
        if (dates.length === 0) {
            alert('Please add dates first.');
            return;
        }

        const result = startAllocation(config, faculty);
        console.log('Allocation result:', result);
        alert('Allocation complete!');
    };

    const [statusModal, setStatusModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'success'
    });
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);

    const handleSaveAllotment = async (password) => {
        if (!password) return;

        setSaveLoading(true);
        try {
            // Construct sessionData from allocations and config
            const sessionData = {};
            Object.keys(allocations).forEach(date => {
                sessionData[date] = {};
                ['morning', 'afternoon'].forEach(session => {
                    if (allocations[date][session]) {
                        sessionData[date][session] = {
                            examInfo: {
                                rooms: config[date][session].rooms,
                                relievers: config[date][session].relievers
                            },
                            deputies: allocations[date][session].deputies || [],
                            invigilators: allocations[date][session].invigilators || []
                        };
                    }
                });
            });

            // Include password in payload
            const payload = { ...sessionData, password };

            console.log('Saving sessionData...');
            await axios.post('/api/allocations', payload);

            setIsConfirmModalOpen(false);
            setStatusModal({
                isOpen: true,
                title: 'Success!',
                message: 'Allotment Confirmed and Saved successfully!',
                type: 'success'
            });

        } catch (err) {
            console.error(err);
            const errMsg = err.response?.data?.msg || "Failed to save to database.";
            setStatusModal({
                isOpen: true,
                title: 'Error',
                message: errMsg,
                type: 'error'
            });
        } finally {
            setSaveLoading(false);
        }
    };

    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [selectedDates, setSelectedDates] = useState([]);
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [step, setStep] = useState(1); // 1: Dates, 2: Config, 3: Allocation

    // Faculty Table Filters State
    const [desigFilter, setDesigFilter] = useState('ALL');
    const [deptFilter, setDeptFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Drag-to-select state
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState(null); // 'select' or 'deselect'

    // Helper for Designation Filter
    const matchesDesignation = (facultyDesignation, filterKey) => {
        if (filterKey === 'ALL') return true;
        const desig = (facultyDesignation || '').toLowerCase().trim();

        if (filterKey === 'PROFESSOR') {
            return (desig.includes('professor') || desig.includes('prof')) &&
                !desig.includes('assistant') && !desig.includes('asst') &&
                !desig.includes('associate') && !desig.includes('assoc');
        }

        if (filterKey === 'ASSOCIATE') {
            return desig.includes('associate') || desig.includes('assoc');
        }

        if (filterKey === 'ASSISTANT') {
            return desig.includes('assistant') || desig.includes('asst');
        }

        if (filterKey === 'OTHER') {
            const isProf = desig.includes('professor') || desig.includes('prof') ||
                desig.includes('assistant') || desig.includes('asst') ||
                desig.includes('associate') || desig.includes('assoc');
            return !isProf;
        }

        return true;
    };


    useEffect(() => {
        if (dateRange.start && dateRange.end) {
            const start = new Date(dateRange.start);
            const end = new Date(dateRange.end);
            if (start <= end) {
                const dateArray = [];
                let current = new Date(start);
                while (current <= end) {
                    if (current.getDay() !== 0) { // Exclude Sundays by default
                        dateArray.push(new Date(current).toISOString().split('T')[0]);
                    }
                    current.setDate(current.getDate() + 1);
                }
                setSelectedDates(dateArray);
                setCalendarMonth(new Date(start.getFullYear(), start.getMonth(), 1));
            }
        }
    }, [dateRange.start, dateRange.end]);

    const toggleDate = (dateStr) => {
        if (selectedDates.includes(dateStr)) {
            setSelectedDates(prev => prev.filter(d => d !== dateStr).sort());
        } else {
            setSelectedDates(prev => [...prev, dateStr].sort());
        }
    };

    const handleDragSelect = (dateStr, mode) => {
        setSelectedDates(prev => {
            if (mode === 'select' && !prev.includes(dateStr)) {
                return [...prev, dateStr].sort();
            } else if (mode === 'deselect' && prev.includes(dateStr)) {
                return prev.filter(d => d !== dateStr).sort();
            }
            return prev;
        });
    };

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsDragging(false);
            setDragMode(null);
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    const handleClearAll = () => {
        setSelectedDates([]);
    };

    const handleSelectAllMonth = () => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const newDates = new Set(selectedDates);

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(year, month, i);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const isSunday = dateObj.getDay() === 0;
            const isPast = dateStr < todayStr;

            if (!isSunday && !isPast) {
                newDates.add(dateStr);
            }
        }
        setSelectedDates(Array.from(newDates).sort());
    };

    const handleContinue = () => {
        if (selectedDates.length === 0) {
            alert("Please select at least one date.");
            return;
        }

        setDates(selectedDates);

        const initialConfig = {};
        selectedDates.forEach(date => {
            initialConfig[date] = {
                morning: { rooms: 0, roomsPerProf: 7, relievers: 0 },
                afternoon: { rooms: 0, roomsPerProf: 7, relievers: 0 }
            };
        });
        setConfig(initialConfig);
        setStep(2);
    };

    const handleRoomChange = (date, session, value) => {
        const rooms = parseInt(value) || 0;
        const relievers = Math.ceil((rooms / 5) + (rooms * 0.1));

        setConfig(prev => ({
            ...prev,
            [date]: {
                ...prev[date],
                [session]: {
                    ...prev[date][session],
                    rooms: rooms,
                    relievers: relievers
                }
            }
        }));
    };

    const calculateRequirements = (rooms, relievers) => {
        const profs = Math.ceil(rooms / 7);
        const nonProfs = rooms + relievers;
        return { profs, nonProfs };
    };

    return (
        <div className="space-y-10 pb-20 font-sans text-slate-900">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-200 pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Allotment</h1>
                </div>
                <div>
                    <span className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-sm font-semibold shadow-sm">
                        <i className="bi bi-people-fill text-slate-500"></i>
                        {faculty.length} Active Faculty
                    </span>
                </div>
            </div>

            {/* Steps Indicator */}

            {/* Step 1: Date Selection */}
            {step === 1 && (
                <div className="max-w-xl mx-auto bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden mt-10">
                    <div className="bg-retro-cream/30 px-8 py-6 border-b-2 border-retro-dark flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-retro-blue border-2 border-retro-dark flex items-center justify-center text-white shadow-sm">
                            <i className="bi bi-calendar-range-fill text-xl"></i>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-retro-dark uppercase tracking-tight leading-none">
                                Exam Window
                            </h3>
                            <p className="text-xs font-bold text-retro-secondary uppercase tracking-widest mt-1">Select Schedule Range</p>
                        </div>
                    </div>

                    <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-retro-dark uppercase tracking-wider pl-1">Start Date</label>
                                <div className="relative">
                                    <input type="date" className="w-full px-4 py-3 rounded-lg border-2 border-retro-border bg-retro-white focus:border-retro-blue focus:bg-white focus:shadow-paper focus:translate-y-[-2px] outline-none transition-all font-bold text-retro-dark cursor-pointer hover:bg-retro-cream/20"
                                        value={dateRange.start}
                                        onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                    />
                                    <i className="bi bi-calendar absolute right-4 top-1/2 -translate-y-1/2 text-retro-secondary pointer-events-none"></i>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-retro-dark uppercase tracking-wider pl-1">End Date</label>
                                <div className="relative">
                                    <input type="date" className="w-full px-4 py-3 rounded-lg border-2 border-retro-border bg-retro-white focus:border-retro-blue focus:bg-white focus:shadow-paper focus:translate-y-[-2px] outline-none transition-all font-bold text-retro-dark cursor-pointer hover:bg-retro-cream/20"
                                        value={dateRange.end}
                                        onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                    />
                                    <i className="bi bi-calendar-fill absolute right-4 top-1/2 -translate-y-1/2 text-retro-secondary pointer-events-none"></i>
                                </div>
                            </div>
                        </div>

                        {/* Custom Calendar UI */}
                        <div className="mt-8 border-2 border-retro-dark rounded-xl overflow-hidden bg-retro-white">
                            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-retro-cream border-b-2 border-retro-dark gap-4">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-retro-dark bg-white hover:bg-retro-blue hover:text-white transition-colors">
                                        <i className="bi bi-chevron-left"></i>
                                    </button>
                                    <h4 className="font-black text-retro-dark uppercase tracking-widest text-sm w-32 text-center">
                                        {calendarMonth.toLocaleString('default', { month: 'long' })} {calendarMonth.getFullYear()}
                                    </h4>
                                    <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-retro-dark bg-white hover:bg-retro-blue hover:text-white transition-colors">
                                        <i className="bi bi-chevron-right"></i>
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleSelectAllMonth} className="px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-retro-dark rounded-lg bg-white hover:bg-retro-blue hover:text-white transition-colors shadow-sm active:translate-y-[1px]">
                                        Select All
                                    </button>
                                    <button onClick={handleClearAll} className="px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-retro-dark rounded-lg bg-white hover:bg-red-500 hover:text-white transition-colors shadow-sm active:translate-y-[1px]">
                                        Clear All
                                    </button>
                                </div>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-7 gap-2 mb-2">
                                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                                        <div key={day} className="text-center text-xs font-black text-retro-secondary uppercase tracking-wider">{day}</div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-2">
                                    {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }).map((_, i) => (
                                        <div key={`empty-${i}`} className="p-2"></div>
                                    ))}
                                    {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }).map((_, i) => {
                                        const dateObj = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), i + 1);
                                        // Handle timezone offsets by constructing YYYY-MM-DD manually
                                        const year = dateObj.getFullYear();
                                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                                        const day = String(dateObj.getDate()).padStart(2, '0');
                                        const dateStr = `${year}-${month}-${day}`;

                                        const isSelected = selectedDates.includes(dateStr);
                                        const isSunday = dateObj.getDay() === 0;

                                        const today = new Date();
                                        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                        const isPast = dateStr < todayStr;

                                        if (isPast) {
                                            return <div key={dateStr} className="h-10 w-full rounded-lg border-2 border-retro-border/30 bg-gray-50 flex items-center justify-center text-gray-300 font-bold text-sm cursor-not-allowed select-none">{i + 1}</div>;
                                        }

                                        return (
                                            <button
                                                key={dateStr}
                                                onMouseDown={() => {
                                                    if (isSunday || isPast) return;
                                                    setIsDragging(true);
                                                    const willSelect = !selectedDates.includes(dateStr);
                                                    setDragMode(willSelect ? 'select' : 'deselect');
                                                    handleDragSelect(dateStr, willSelect ? 'select' : 'deselect');
                                                }}
                                                onMouseEnter={() => {
                                                    if (isDragging && !isSunday && !isPast) {
                                                        handleDragSelect(dateStr, dragMode);
                                                    }
                                                }}
                                                className={`h-10 w-full rounded-lg font-bold text-sm transition-all border-2 ${isSelected
                                                        ? 'bg-retro-blue text-white border-retro-dark shadow-sm hover:bg-blue-600'
                                                        : isSunday
                                                            ? 'bg-red-50 text-red-300 border-red-100 opacity-50 cursor-not-allowed hover:bg-red-50'
                                                            : 'bg-retro-white text-retro-dark border-retro-border hover:border-retro-blue hover:text-retro-blue'
                                                    }`}
                                            >
                                                {i + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-retro-cream/50 border-t-2 border-retro-dark flex justify-between items-center text-xs font-bold text-retro-secondary uppercase tracking-widest select-none">
                                <span>Selected: {selectedDates.length} Days</span>
                                <span>Click & Drag to select multiple</span>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t-2 border-retro-border/50">
                            <button
                                className="w-full bg-retro-dark hover:bg-retro-blue text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-paper hover:translate-y-[-2px] active:translate-y-[0px] active:shadow-sm transition-all flex items-center justify-center gap-3 border-2 border-retro-dark group"
                                onClick={handleContinue}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2: Session Configuration */}
            {step >= 2 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-col sm:flex-row justify-between items-center bg-retro-white p-5 rounded-xl border-2 border-retro-dark shadow-paper sticky top-20 z-20 backdrop-blur-md">
                        <div>
                            <h4 className="font-black text-retro-dark text-lg uppercase tracking-tight">Enter Rooms Required</h4>
                            <p className="text-xs font-bold text-retro-secondary uppercase tracking-widest mt-1">Set room counts for {dates.length} days</p>
                        </div>
                        <div className="flex gap-3 mt-4 sm:mt-0">
                            {step === 3 && (
                                <button className="px-6 py-2.5 rounded-lg font-bold text-retro-secondary hover:text-retro-dark hover:bg-retro-dark/5 transition uppercase tracking-wider text-xs" onClick={() => setStep(2)}>
                                    Back
                                </button>
                            )}
                            {step === 2 && (
                                <button className="px-6 py-3 rounded-lg font-black text-white bg-retro-blue hover:bg-retro-blue/90 shadow-paper hover:translate-y-[-2px] active:translate-y-[0px] transition-all border-2 border-retro-dark uppercase tracking-wider text-xs flex items-center gap-2" onClick={() => setStep(3)}>
                                    Allocate <i className="bi bi-lightning-charge-fill"></i>
                                </button>
                            )}
                        </div>
                    </div>

                    {step === 2 && (
                        <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[600px]">
                                <thead>
                                    <tr className="bg-retro-cream border-b-2 border-retro-dark">
                                        <th className="px-6 py-4 font-black text-retro-dark text-xs uppercase tracking-widest w-1/4">Date</th>
                                        <th className="px-6 py-4 font-black text-retro-blue text-xs uppercase tracking-widest border-l-2 border-retro-dark bg-retro-blue/5">Morning (AM)</th>
                                        <th className="px-6 py-4 font-black text-retro-red text-xs uppercase tracking-widest border-l-2 border-retro-dark bg-retro-red/5">Afternoon (PM)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y-2 divide-retro-dark/10">
                                    {dates.map(date => (
                                        <tr key={date} className="hover:bg-retro-cream/10 transition-colors group">
                                            <td className="px-6 py-4 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-lg bg-retro-dark text-retro-cream flex items-center justify-center font-black text-xs shadow-sm group-hover:rotate-6 transition-transform">
                                                        {new Date(date).getDate()}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-retro-dark text-sm uppercase leading-none">
                                                            {new Date(date).toLocaleDateString('en-GB', { weekday: 'short' })}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-retro-secondary uppercase tracking-widest mt-0.5">
                                                            {new Date(date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 align-middle border-l-2 border-retro-dark/10 bg-retro-blue/5">
                                                <div className="flex items-center gap-6">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] font-black text-retro-secondary uppercase tracking-widest w-12">Rooms</span>
                                                        <input type="number" className="w-16 px-2 py-1.5 rounded-lg border-2 border-retro-blue/20 focus:border-retro-blue outline-none font-bold text-retro-dark text-sm text-center bg-white shadow-inner transition-colors focus:bg-retro-blue/5"
                                                            value={config[date]?.morning?.rooms || ''}
                                                            placeholder="0"
                                                            onChange={(e) => handleRoomChange(date, 'morning', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="flex gap-4 text-[10px] font-bold">
                                                        <span className="text-retro-secondary/80">Dpt: <span className="text-retro-blue font-black text-sm">{calculateRequirements(config[date]?.morning?.rooms, 0).profs}</span></span>
                                                        <span className="text-retro-secondary/80">Inv: <span className="text-retro-secondary font-black text-sm">{calculateRequirements(config[date]?.morning?.rooms, config[date]?.morning?.relievers).nonProfs}</span></span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 align-middle border-l-2 border-retro-dark/10 bg-retro-red/5">
                                                <div className="flex items-center gap-6">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] font-black text-retro-secondary uppercase tracking-widest w-12">Rooms</span>
                                                        <input type="number" className="w-16 px-2 py-1.5 rounded-lg border-2 border-retro-red/20 focus:border-retro-red outline-none font-bold text-retro-dark text-sm text-center bg-white shadow-inner transition-colors focus:bg-retro-red/5"
                                                            value={config[date]?.afternoon?.rooms || ''}
                                                            placeholder="0"
                                                            onChange={(e) => handleRoomChange(date, 'afternoon', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="flex gap-4 text-[10px] font-bold">
                                                        <span className="text-retro-secondary/80">Dpt: <span className="text-retro-red font-black text-sm">{calculateRequirements(config[date]?.afternoon?.rooms, 0).profs}</span></span>
                                                        <span className="text-retro-secondary/80">Inv: <span className="text-retro-secondary font-black text-sm">{calculateRequirements(config[date]?.afternoon?.rooms, config[date]?.afternoon?.relievers).nonProfs}</span></span>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Step 3: Allocation Table */}
            {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div>
                                <h4 className="font-black text-retro-dark text-lg uppercase tracking-tight">Allocate duties for {dates.length} days</h4>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button className="bg-retro-dark hover:bg-retro-blue text-white px-8 py-3 rounded-lg font-black shadow-paper active:translate-y-[0px] hover:translate-y-[-2px] transition-all flex items-center gap-2 border-2 border-retro-dark uppercase tracking-wider text-xs" onClick={handleAllocate} disabled={dates.length === 0}>
                                Allocate
                            </button>
                            <button
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-lg font-black shadow-paper active:translate-y-[0px] hover:translate-y-[-2px] transition-all flex items-center gap-2 border-2 border-retro-dark uppercase tracking-wider text-xs"
                                onClick={() => setIsConfirmModalOpen(true)}
                                disabled={Object.keys(allocations).length === 0}
                            >
                                Confirm Allotment
                            </button>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="w-full">
                        <button className="w-full bg-retro-white hover:bg-green-50 text-green-700 border-2 border-retro-border hover:border-green-600 px-4 py-4 rounded-xl font-bold shadow-sm transition flex items-center justify-center gap-3 group uppercase tracking-wider text-xs" onClick={() => generateDeputyReport(allocations, config)} disabled={Object.keys(allocations).length === 0}>
                            <i className="bi bi-file-earmark-word-fill text-xl group-hover:scale-110 transition-transform"></i> Download Official Allocation Report (.doc)
                        </button>
                    </div>

                    {/* Filter Bar */}
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark p-5 space-y-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b-2 border-retro-dark/10 pb-3">
                            <div className="flex items-center gap-2">
                                <i className="bi bi-funnel-fill text-retro-blue text-lg"></i>
                                <h4 className="font-black text-retro-dark uppercase text-sm">Filter Faculty & Duties</h4>
                            </div>
                            <span className="text-xs font-bold text-retro-secondary">
                                Showing <span className="font-black text-retro-dark">{
                                    faculty.filter(prof => {
                                        if (!matchesDesignation(prof.designation, desigFilter)) return false;
                                        if (deptFilter !== 'ALL' && prof.department !== deptFilter) return false;
                                        if (searchQuery.trim() !== '') {
                                            const q = searchQuery.toLowerCase().trim();
                                            const nameMatch = prof.name.toLowerCase().includes(q);
                                            const initialsMatch = (prof.initials || '').toLowerCase().includes(q);
                                            const deptMatch = (prof.department || '').toLowerCase().includes(q);
                                            const desigMatch = (prof.designation || '').toLowerCase().includes(q);
                                            if (!nameMatch && !initialsMatch && !deptMatch && !desigMatch) return false;
                                        }
                                        return true;
                                    }).length
                                }</span> of {faculty.length} Faculty
                            </span>
                        </div>

                        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                            {/* Designation Pills */}
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-[10px] font-black uppercase tracking-wider text-retro-secondary mr-1">Role Filter:</span>
                                {[
                                    { key: 'ALL', label: 'All Roles' },
                                    { key: 'PROFESSOR', label: 'Professors' },
                                    { key: 'ASSOCIATE', label: 'Associate Prof.' },
                                    { key: 'ASSISTANT', label: 'Assistant Prof.' },
                                    { key: 'OTHER', label: 'Others' }
                                ].map(pill => {
                                    const isActive = desigFilter === pill.key;
                                    const count = faculty.filter(f => matchesDesignation(f.designation, pill.key)).length;
                                    return (
                                        <button
                                            key={pill.key}
                                            onClick={() => setDesigFilter(pill.key)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all border-2 flex items-center gap-1.5 ${
                                                isActive
                                                    ? 'bg-retro-blue text-white border-retro-dark shadow-sm scale-105'
                                                    : 'bg-white text-retro-dark border-retro-dark/30 hover:border-retro-blue hover:bg-retro-cream/20'
                                            }`}
                                        >
                                            <span>{pill.label}</span>
                                            <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                                                isActive ? 'bg-white text-retro-blue' : 'bg-retro-cream text-retro-dark'
                                            }`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Department & Search Filters */}
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                {/* Department Filter Dropdown */}
                                <select
                                    value={deptFilter}
                                    onChange={(e) => setDeptFilter(e.target.value)}
                                    className="w-full sm:w-auto px-3 py-2 rounded-lg border-2 border-retro-dark/30 bg-white font-bold text-xs uppercase outline-none focus:border-retro-blue cursor-pointer hover:border-retro-blue transition-colors"
                                >
                                    <option value="ALL">All Departments</option>
                                    {[...new Set(faculty.map(f => f.department))].filter(Boolean).sort().map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>

                                {/* Search Input */}
                                <div className="relative w-full sm:w-48">
                                    <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-retro-secondary text-xs"></i>
                                    <input
                                        type="text"
                                        placeholder="Search name/initials..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2 rounded-lg border-2 border-retro-dark/30 bg-white font-bold text-xs outline-none focus:border-retro-blue transition-colors"
                                    />
                                </div>
                                
                                {(desigFilter !== 'ALL' || deptFilter !== 'ALL' || searchQuery !== '') && (
                                    <button
                                        onClick={() => {
                                            setDesigFilter('ALL');
                                            setDeptFilter('ALL');
                                            setSearchQuery('');
                                        }}
                                        className="px-3 py-2 text-xs font-bold text-retro-red hover:bg-red-50 rounded-lg border-2 border-red-300 transition-colors uppercase shrink-0"
                                        title="Reset All Filters"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden">
                        <div className="overflow-x-auto max-h-[700px]">
                            <table className="w-full text-left border-collapse bg-retro-white">
                                <thead className="bg-retro-dark text-white sticky top-0 z-20 shadow-md">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-retro-border/60 border-b border-retro-secondary">Faculty Member</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-retro-border/60 border-b border-retro-secondary">Department</th>
                                        <th className="px-4 py-4 text-center text-[10px] font-black uppercase tracking-widest text-white bg-retro-blue border-b border-retro-blue w-24">Total</th>
                                        {dates.map(date => (
                                            <th key={date} colSpan="2" className="text-center px-2 py-2 border-l border-retro-secondary/50 bg-retro-secondary/20">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] uppercase tracking-wider text-retro-border">{new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                    <tr>
                                        <th colSpan="3" className="bg-retro-dark h-1"></th>
                                        {dates.map(date => (
                                            <React.Fragment key={date}>
                                                <th className="px-1 py-1.5 text-[8px] text-center uppercase font-black text-retro-cream bg-retro-dark border-l border-retro-secondary/30">AM</th>
                                                <th className="px-1 py-1.5 text-[8px] text-center uppercase font-black text-retro-blue bg-retro-dark">PM</th>
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-retro-border/50">
                                    {faculty
                                        .filter(prof => {
                                            if (!matchesDesignation(prof.designation, desigFilter)) return false;
                                            if (deptFilter !== 'ALL' && prof.department !== deptFilter) return false;
                                            if (searchQuery.trim() !== '') {
                                                const q = searchQuery.toLowerCase().trim();
                                                const nameMatch = prof.name.toLowerCase().includes(q);
                                                const initialsMatch = (prof.initials || '').toLowerCase().includes(q);
                                                const deptMatch = (prof.department || '').toLowerCase().includes(q);
                                                const desigMatch = (prof.designation || '').toLowerCase().includes(q);
                                                if (!nameMatch && !initialsMatch && !deptMatch && !desigMatch) return false;
                                            }
                                            return true;
                                        })
                                        .sort((a, b) => {
                                            const desigA = (a.designation || '').toLowerCase();
                                            const desigB = (b.designation || '').toLowerCase();
                                            const isProfA = desigA.includes('professor') && !desigA.includes('assistant') && !desigA.includes('associate');
                                            const isProfB = desigB.includes('professor') && !desigB.includes('assistant') && !desigB.includes('associate');

                                            if (isProfA && !isProfB) return -1;
                                            if (!isProfA && isProfB) return 1;
                                            if (a.department < b.department) return -1;
                                            if (a.department > b.department) return 1;
                                            return a.name.localeCompare(b.name);
                                        }).map((prof, idx) => {
                                            let total = 0;
                                            const desigLower = (prof.designation || '').toLowerCase();
                                            const isProf = desigLower.includes('professor') && !desigLower.includes('assistant') && !desigLower.includes('associate');
                                            const isAssoc = desigLower.includes('associate') || desigLower.includes('assoc');
                                            const isAsst = desigLower.includes('assistant') || desigLower.includes('asst');
                                            
                                            return (
                                                <tr key={prof._id} className={`hover:bg-retro-cream/30 transition-colors ${idx % 2 === 0 ? 'bg-retro-white' : 'bg-retro-cream/10'}`}>
                                                    <td className="px-6 py-3.5 whitespace-nowrap">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                                                                isProf 
                                                                    ? 'bg-purple-100 border-purple-800 text-purple-900' 
                                                                    : isAssoc 
                                                                    ? 'bg-blue-100 border-blue-800 text-blue-900'
                                                                    : 'bg-retro-white border-retro-border text-retro-secondary'
                                                            }`}>
                                                                {prof.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-retro-dark text-sm">{prof.name}</div>
                                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black border mt-0.5 uppercase tracking-wide ${
                                                                    isProf
                                                                        ? 'bg-purple-100 text-purple-800 border-purple-300'
                                                                        : isAssoc
                                                                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                                                                        : isAsst
                                                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                                        : 'bg-retro-cream/80 text-retro-dark border-retro-dark/20'
                                                                }`}>
                                                                    {prof.designation || 'Lecturer'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3.5 whitespace-nowrap">
                                                        <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-retro-white text-retro-secondary border-2 border-retro-border">
                                                            {prof.department}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-center">
                                                        {(() => {
                                                            let count = 0;
                                                            Object.values(allocations).forEach(day => {
                                                                ['morning', 'afternoon'].forEach(sess => {
                                                                    if (day[sess]?.deputies?.some(p => p._id === prof._id)) count++;
                                                                    if (day[sess]?.invigilators?.some(p => p._id === prof._id)) count++;
                                                                });
                                                            });
                                                            return (
                                                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-black text-sm border-2 ${count > 0 ? 'bg-retro-blue text-white border-retro-dark shadow-sm' : 'text-retro-border bg-retro-white border-retro-border'}`}>
                                                                    {count || 0}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                    {dates.map(date => (
                                                        <React.Fragment key={date}>
                                                            <DutyCell
                                                                session="morning"
                                                                allocated={allocations[date]?.morning?.deputies?.some(p => p._id === prof._id) ? 'DEP' : allocations[date]?.morning?.invigilators?.some(p => p._id === prof._id) ? 'INV' : null}
                                                            />
                                                            <DutyCell
                                                                session="afternoon"
                                                                allocated={allocations[date]?.afternoon?.deputies?.some(p => p._id === prof._id) ? 'DEP' : allocations[date]?.afternoon?.invigilators?.some(p => p._id === prof._id) ? 'INV' : null}
                                                            />
                                                        </React.Fragment>
                                                    ))}
                                                </tr>
                                            )
                                        })}
                                </tbody>
                                <tfoot className="sticky bottom-0 bg-retro-white font-bold z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] border-t-2 border-retro-dark">
                                    <tr className="bg-retro-cream/20">
                                        <td className="p-4 text-left font-black text-retro-secondary text-xs uppercase tracking-widest pl-6">Grand Totals</td>
                                        <td className="p-4"></td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center">
                                                <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-retro-dark text-white text-xs font-black border-2 border-retro-secondary">
                                                    {faculty.reduce((sum, f) => {
                                                        let count = 0;
                                                        Object.values(allocations).forEach(day => {
                                                            ['morning', 'afternoon'].forEach(sess => {
                                                                if (day[sess]?.deputies?.some(p => p._id === f._id)) count++;
                                                                if (day[sess]?.invigilators?.some(p => p._id === f._id)) count++;
                                                            });
                                                        });
                                                        return sum + count;
                                                    }, 0)}
                                                </span>
                                            </div>
                                        </td>
                                        {dates.map(date => (
                                            <React.Fragment key={date}>
                                                <td className="p-3 text-center border-l border-retro-border">
                                                    <span className="text-xs font-black text-retro-dark bg-retro-cream px-2 py-1 rounded-md border border-retro-dark/20">
                                                        {(() => {
                                                            const am = allocations[date]?.morning;
                                                            return (am?.deputies?.length || 0) + (am?.invigilators?.length || 0);
                                                        })()}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className="text-xs font-black text-white bg-retro-blue px-2 py-1 rounded-md border border-retro-dark/20">
                                                        {(() => {
                                                            const pm = allocations[date]?.afternoon;
                                                            return (pm?.deputies?.length || 0) + (pm?.invigilators?.length || 0);
                                                        })()}
                                                    </span>
                                                </td>
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            {/* Password Confirmation Modal */}
            <PasswordConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={handleSaveAllotment}
                loading={saveLoading}
                title="Save & Publish"
                message="This will save the current allocation to the database, effectively publishing it. Please enter your administrator password to confirm."
                confirmText="Save Allotment"
                confirmColor="bg-emerald-600"
                icon="bi-cloud-upload-fill"
            />

            {/* Status Modal */}
            <StatusModal
                isOpen={statusModal.isOpen}
                onClose={() => setStatusModal({ ...statusModal, isOpen: false })}
                title={statusModal.title}
                message={statusModal.message}
                type={statusModal.type}
            />
        </div>
    );
};

// Helper sub-component for cleaner table cells
const DutyCell = ({ session, allocated }) => {
    if (!allocated) return <td className="p-2 border-l border-retro-border/50"></td>;

    const isDep = allocated === 'DEP';
    const isAm = session === 'morning';

    // AM colors: Cream/Dark, PM colors: Blue/White
    // Deputy: Solid Badge, Invigilator: Check Icon

    return (
        <td className={`p-2 text-center border-l border-retro-border/50 bg-retro-white`}>
            {isDep ? (
                <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black tracking-wide shadow-sm border ${isAm ? 'bg-retro-cream text-retro-dark border-retro-dark' : 'bg-retro-blue text-white border-retro-dark'
                    }`}>
                    DEP
                </span>
            ) : (
                <div className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center text-xs ${isAm ? 'text-retro-dark bg-retro-cream/50' : 'text-retro-blue bg-retro-blue/10'
                    }`}>
                    <i className="bi bi-check-lg font-bold"></i>
                </div>
            )}
        </td>
    );
};

export default ExamAllotment;
