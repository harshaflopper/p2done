import React, { useState, useEffect } from 'react';
import axios from 'axios';

const SMSNotificationModal = ({ isOpen, onClose, sessionData }) => {
    const [activeTab, setActiveTab] = useState('bulk'); // 'bulk', 'date', or 'single'
    const [bulkViewMode, setBulkViewMode] = useState('dashboard'); // 'dashboard' or 'roster'
    const [config, setConfig] = useState({ isConfigured: false, isDryRun: true, providerName: 'SMS Controller' });
    const [loadingPreview, setLoadingPreview] = useState(true);
    const [recipients, setRecipients] = useState([]);
    
    // Filters & Selection
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('ALL');
    const [phoneStatusFilter, setPhoneStatusFilter] = useState('ALL'); // 'ALL', 'VALID', 'MISSING'
    const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);

    // Date-Wise SMS State
    const [selectedDate, setSelectedDate] = useState('');

    // Bulk / Date Dispatch Progress
    const [sending, setSending] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [dispatchResult, setDispatchResult] = useState(null);

    // Single SMS State
    const [selectedRecipientIndex, setSelectedRecipientIndex] = useState(0);
    const [singlePhone, setSinglePhone] = useState('');
    const [singleMessage, setSingleMessage] = useState('');
    const [sendingSingle, setSendingSingle] = useState(false);
    const [singleStatus, setSingleStatus] = useState(null);

    useEffect(() => {
        if (isOpen) {
            fetchConfigAndPreview();
        }
    }, [isOpen, sessionData]);

    const fetchConfigAndPreview = async () => {
        try {
            setLoadingPreview(true);
            setDispatchResult(null);
            setSingleStatus(null);

            // Fetch SMS Config status
            const configRes = await axios.get('/api/sms/config');
            setConfig(configRes.data);

            // Fetch SMS Preview generated from sessionData
            const previewRes = await axios.post('/api/sms/preview', { sessionData });
            const list = previewRes.data.recipients || [];
            setRecipients(list);

            if (list.length > 0) {
                setSelectedRecipientIndex(0);
                setSelectedPreviewIndex(0);
                setSinglePhone(list[0].phone || '');
                setSingleMessage(list[0].message || '');

                // Extract dates for Date-Wise SMS
                const dates = Array.from(new Set(
                    list.flatMap(r => (r.duties || []).map(d => d.date))
                )).filter(Boolean).sort();

                if (dates.length > 0) {
                    setSelectedDate(dates[0]);
                }
            }

            setLoadingPreview(false);
        } catch (err) {
            console.error('Error fetching SMS preview:', err);
            setLoadingPreview(false);
        }
    };

    const handleSelectSingleRecipient = (index) => {
        const item = recipients[index];
        if (item) {
            setSelectedRecipientIndex(index);
            setSinglePhone(item.phone || '');
            setSingleMessage(item.message || '');
            setSingleStatus(null);
        }
    };

    const formatDateSpecificMessage = (facultyName, duties, targetDate) => {
        const dayDuties = (duties || []).filter(d => d.date === targetDate);
        let msg = `SIT Tumakuru Exam Allotment:\nDear ${facultyName},\nYour Duty Schedule for ${targetDate}:`;
        dayDuties.forEach(d => {
            const sessionCode = (d.session || '').toLowerCase() === 'morning' ? 'AM' : 'PM';
            const roomStr = d.room ? d.room : 'Unassigned';
            msg += `\nSession: ${sessionCode} | Room: ${roomStr}`;
        });
        msg += `\nPlease report 30 mins prior.`;
        return msg;
    };

    const handleSendBulkSMS = async (targetList = null, dateLabel = '') => {
        const listToSend = targetList || recipients;
        let validRecipients = listToSend.filter(r => r.hasValidPhone);

        if (validRecipients.length === 0) {
            alert('No recipients with valid 10-digit mobile numbers found.');
            return;
        }

        if (dateLabel) {
            validRecipients = validRecipients.map(r => ({
                ...r,
                message: formatDateSpecificMessage(r.name, r.duties, dateLabel)
            }));
        }

        const confirmMsg = dateLabel
            ? `Are you sure you want to dispatch SMS alerts (for ${dateLabel} duty details only) to ${validRecipients.length} faculty members?`
            : `Are you sure you want to dispatch SMS alerts to all ${validRecipients.length} faculty members?`;

        if (!window.confirm(confirmMsg)) {
            return;
        }

        setSending(true);
        setProgress({ current: 0, total: validRecipients.length });

        try {
            const res = await axios.post('/api/sms/send-all', { recipients: validRecipients });
            setDispatchResult(res.data.summary);
            setSending(false);
        } catch (err) {
            console.error('Bulk SMS Dispatch Error:', err);
            alert(`SMS Dispatch Error: ${err.response?.data?.msg || err.message}`);
            setSending(false);
        }
    };

    const handleSendSingleSMS = async () => {
        if (!singlePhone || String(singlePhone).replace(/[^0-9]/g, '').length !== 10) {
            alert('Please enter a valid 10-digit mobile number.');
            return;
        }

        if (!singleMessage.trim()) {
            alert('Message content cannot be empty.');
            return;
        }

        setSendingSingle(true);
        setSingleStatus(null);

        try {
            const currentItem = recipients[selectedRecipientIndex] || {};
            const res = await axios.post('/api/sms/send-single', {
                name: currentItem.name || 'Faculty',
                phone: singlePhone,
                message: singleMessage
            });

            setSingleStatus({
                type: 'success',
                msg: res.data.msg || 'SMS dispatched successfully!',
                dryRun: res.data.dryRun
            });
        } catch (err) {
            console.error('Single SMS Error:', err);
            setSingleStatus({
                type: 'error',
                msg: err.response?.data?.msg || err.message
            });
        } finally {
            setSendingSingle(false);
        }
    };

    const handlePhoneChange = (itemIdx, newPhoneVal) => {
        setRecipients(prev => {
            const next = [...prev];
            const item = { ...next[itemIdx] };
            const clean = String(newPhoneVal).replace(/[^0-9]/g, '').slice(-10);
            item.phone = newPhoneVal;
            item.cleanPhone = clean;
            item.hasValidPhone = clean.length === 10;
            next[itemIdx] = item;
            return next;
        });
    };

    const insertVariableChip = (variableText) => {
        setSingleMessage(prev => prev + ' ' + variableText);
    };

    if (!isOpen) return null;

    // Available unique dates
    const availableDates = Array.from(new Set(
        recipients.flatMap(r => (r.duties || []).map(d => d.date))
    )).filter(Boolean).sort();

    // Filter recipients for Send to All
    const filteredRecipients = recipients.filter(r => {
        const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.initials || '').toLowerCase().includes(searchQuery.toLowerCase());

        const matchesDept = selectedDepartment === 'ALL' || (r.department || '').toUpperCase() === selectedDepartment.toUpperCase();
        
        const matchesPhoneStatus = phoneStatusFilter === 'ALL' ||
            (phoneStatusFilter === 'VALID' && r.hasValidPhone) ||
            (phoneStatusFilter === 'MISSING' && !r.hasValidPhone);

        return matchesSearch && matchesDept && matchesPhoneStatus;
    });

    // Date-wise filtered recipients
    const dateRecipients = recipients.filter(r => {
        if (!selectedDate) return true;
        return (r.duties || []).some(d => d.date === selectedDate);
    });

    const validCount = recipients.filter(r => r.hasValidPhone).length;
    const invalidCount = recipients.length - validCount;
    const totalDuties = recipients.reduce((acc, r) => acc + (r.dutiesCount || 0), 0);

    // Date-wise counts
    const dateValidCount = dateRecipients.filter(r => r.hasValidPhone).length;
    const dateInvalidCount = dateRecipients.length - dateValidCount;

    // Department breakdown map
    const deptCounts = recipients.reduce((acc, r) => {
        const dept = (r.department || 'UNASSIGNED').toUpperCase();
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
    }, {});

    const departmentList = ['ALL', ...Object.keys(deptCounts).sort()];

    // Live preview item for Smartphone Simulator
    const activePreviewRecipient = recipients[selectedPreviewIndex] || recipients[0] || {};
    const singleCharCount = singleMessage.length;
    const singleCredits = Math.ceil(singleCharCount / 160) || 1;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            <div className="bg-retro-white border-2 border-retro-dark rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-6 flex flex-col max-h-[92vh]">
                
                {/* Retro Theme Header */}
                <div className="bg-retro-dark text-white px-6 py-4 border-b-2 border-retro-dark flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-retro-cream text-retro-dark flex items-center justify-center border-2 border-retro-dark font-black">
                            <i className="bi bi-chat-left-text-fill text-xl"></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                                    SMS Controller
                                </h3>
                                {config.isDryRun ? (
                                    <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md flex items-center gap-1">
                                        <i className="bi bi-exclamation-triangle-fill"></i> Dry Run Mode
                                    </span>
                                ) : (
                                    <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md flex items-center gap-1">
                                        <i className="bi bi-check-circle-fill"></i> Gateway Active
                                    </span>
                                )}
                            </div>
                            <p className="text-xs font-bold text-retro-cream/80 uppercase tracking-wider mt-0.5">
                                Automated Exam Duty Alert & Notification Gateway
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-lg border-2 border-white/20 bg-retro-dark hover:bg-white hover:text-retro-dark text-white flex items-center justify-center transition-colors shadow-sm"
                        title="Close Modal"
                    >
                        <i className="bi bi-x-lg text-sm"></i>
                    </button>
                </div>

                {/* Sub-Header Tabs & View Toggles */}
                <div className="flex flex-wrap justify-between items-center border-b-2 border-retro-dark/10 bg-retro-cream/40 px-6 pt-3 gap-3">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('bulk')}
                            className={`px-5 py-2.5 rounded-t-xl font-black text-xs uppercase tracking-wider transition-all border-2 border-b-0 flex items-center gap-2 ${
                                activeTab === 'bulk'
                                    ? 'bg-retro-white border-retro-dark text-retro-dark shadow-[0_-4px_0_0_#1e1e1e_inset]'
                                    : 'bg-transparent border-transparent text-retro-secondary hover:text-retro-dark'
                            }`}
                        >
                            <i className="bi bi-megaphone-fill"></i> Send to All ({recipients.length})
                        </button>
                        
                        <button
                            onClick={() => setActiveTab('date')}
                            className={`px-5 py-2.5 rounded-t-xl font-black text-xs uppercase tracking-wider transition-all border-2 border-b-0 flex items-center gap-2 ${
                                activeTab === 'date'
                                    ? 'bg-retro-white border-retro-dark text-retro-dark shadow-[0_-4px_0_0_#1e1e1e_inset]'
                                    : 'bg-transparent border-transparent text-retro-secondary hover:text-retro-dark'
                            }`}
                        >
                            <i className="bi bi-calendar-event-fill"></i> Date-Wise SMS
                        </button>

                        <button
                            onClick={() => setActiveTab('single')}
                            className={`px-5 py-2.5 rounded-t-xl font-black text-xs uppercase tracking-wider transition-all border-2 border-b-0 flex items-center gap-2 ${
                                activeTab === 'single'
                                    ? 'bg-retro-white border-retro-dark text-retro-dark shadow-[0_-4px_0_0_#1e1e1e_inset]'
                                    : 'bg-transparent border-transparent text-retro-secondary hover:text-retro-dark'
                            }`}
                        >
                            <i className="bi bi-person-fill"></i> Send Single SMS
                        </button>
                    </div>

                    {/* View mode toggle for Bulk Tab */}
                    {activeTab === 'bulk' && !dispatchResult && !loadingPreview && (
                        <div className="flex bg-white p-1 rounded-xl border-2 border-retro-dark shadow-paper mb-2">
                            <button
                                onClick={() => setBulkViewMode('dashboard')}
                                className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                                    bulkViewMode === 'dashboard'
                                        ? 'bg-retro-dark text-white shadow-sm'
                                        : 'text-retro-secondary hover:text-retro-dark'
                                }`}
                            >
                                <i className="bi bi-phone-vibrate"></i> Dashboard & Simulation
                            </button>
                            <button
                                onClick={() => setBulkViewMode('roster')}
                                className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                                    bulkViewMode === 'roster'
                                        ? 'bg-retro-dark text-white shadow-sm'
                                        : 'text-retro-secondary hover:text-retro-dark'
                                }`}
                            >
                                <i className="bi bi-person-lines-fill"></i> Phone Manager
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Container */}
                <div className="p-6 overflow-y-auto flex-1 bg-retro-white">
                    {loadingPreview ? (
                        <div className="py-20 text-center space-y-4">
                            <div className="relative w-16 h-16 mx-auto">
                                <div className="w-16 h-16 border-4 border-retro-dark/20 border-t-retro-dark rounded-full animate-spin"></div>
                                <i className="bi bi-chat-dots-fill absolute inset-0 flex items-center justify-center text-retro-dark text-xl"></i>
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-retro-dark uppercase tracking-widest">Generating SMS Duty Previews...</h4>
                                <p className="text-xs text-retro-secondary font-bold mt-1">Populating duty schedules and faculty contact numbers</p>
                            </div>
                        </div>
                    ) : dispatchResult ? (
                        /* Dispatch Results Summary View */
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="bg-retro-cream/30 p-6 rounded-2xl border-2 border-retro-dark text-center shadow-paper">
                                <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white border-2 border-retro-dark flex items-center justify-center mx-auto mb-4 text-3xl shadow-sm">
                                    <i className="bi bi-check2-all"></i>
                                </div>
                                <h4 className="text-2xl font-black text-retro-dark uppercase tracking-tight mb-1">Dispatch Process Complete!</h4>
                                <p className="text-xs font-bold text-retro-secondary uppercase tracking-wider">
                                    {config.isDryRun ? '[Dry Run Mode] Simulated SMS Dispatch Summary' : 'Vendel SMS Gateway Live Dispatch Summary'}
                                </p>

                                <div className="grid grid-cols-3 gap-4 mt-6 max-w-md mx-auto">
                                    <div className="bg-white p-4 rounded-xl border-2 border-retro-dark shadow-sm">
                                        <div className="text-3xl font-black text-emerald-700">{dispatchResult.sent}</div>
                                        <div className="text-[10px] font-black text-retro-secondary uppercase mt-1">Dispatched</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border-2 border-retro-dark shadow-sm">
                                        <div className="text-3xl font-black text-red-700">{dispatchResult.failed}</div>
                                        <div className="text-[10px] font-black text-retro-secondary uppercase mt-1">Failed</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border-2 border-retro-dark shadow-sm">
                                        <div className="text-3xl font-black text-amber-700">{dispatchResult.skipped}</div>
                                        <div className="text-[10px] font-black text-retro-secondary uppercase mt-1">Skipped</div>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Log Table */}
                            <div className="space-y-2">
                                <h5 className="text-xs font-black text-retro-dark uppercase tracking-wider flex items-center justify-between">
                                    <span>Detailed Dispatch Audit Log ({dispatchResult.details.length})</span>
                                    <span className="text-[10px] font-bold text-retro-secondary">Live Audit Log</span>
                                </h5>
                                <div className="max-h-64 overflow-y-auto border-2 border-retro-dark rounded-xl bg-white shadow-inner">
                                    <table className="w-full text-left text-xs font-medium">
                                        <thead className="bg-retro-cream border-b-2 border-retro-dark font-black uppercase text-[10px] tracking-wider sticky top-0">
                                            <tr>
                                                <th className="p-3">Faculty Name</th>
                                                <th className="p-3">Phone</th>
                                                <th className="p-3">Status</th>
                                                <th className="p-3">Response Details</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y border-retro-dark/10">
                                            {dispatchResult.details.map((d, i) => (
                                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                    <td className="p-3 font-bold text-retro-dark">{d.name}</td>
                                                    <td className="p-3 font-mono text-retro-secondary">{d.phone || 'N/A'}</td>
                                                    <td className="p-3">
                                                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase flex items-center w-fit gap-1 ${
                                                            d.status === 'SENT' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                                            d.status === 'FAILED' ? 'bg-red-100 text-red-800 border border-red-300' :
                                                            'bg-amber-100 text-amber-800 border border-amber-300'
                                                        }`}>
                                                            {d.status === 'SENT' && <i className="bi bi-check-circle-fill text-emerald-600"></i>}
                                                            {d.status === 'FAILED' && <i className="bi bi-x-circle-fill text-red-600"></i>}
                                                            {d.status} {d.dryRun ? '(Dry Run)' : ''}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-retro-secondary text-[11px] truncate max-w-xs">{d.msg || d.error || d.reason || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setDispatchResult(null)}
                                    className="px-6 py-2.5 rounded-xl border-2 border-retro-dark font-bold text-xs uppercase hover:bg-retro-cream/30 transition-all shadow-sm"
                                >
                                    <i className="bi bi-arrow-left mr-2"></i> Back to Controller
                                </button>
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 rounded-xl bg-retro-dark text-white font-black text-xs uppercase border-2 border-retro-dark hover:bg-retro-dark/80 transition-all shadow-paper"
                                >
                                    Close Window
                                </button>
                            </div>
                        </div>
                    ) : activeTab === 'bulk' ? (
                        /* TAB 1: BULK DISPATCH CENTER */
                        bulkViewMode === 'dashboard' ? (
                            /* VIEW MODE 1: DASHBOARD & SIMULATION */
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                
                                {/* Left Side: KPI Summary & Department Filter */}
                                <div className="lg:col-span-7 space-y-5">
                                    
                                    {/* 4 KPI Metrics */}
                                    <div className="grid grid-cols-2 gap-3.5">
                                        <div className="bg-retro-cream/30 p-4 rounded-2xl border-2 border-retro-dark shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <span className="text-[11px] font-black text-retro-secondary uppercase tracking-wider">Total Target</span>
                                                <i className="bi bi-people-fill text-retro-dark text-lg"></i>
                                            </div>
                                            <div className="text-3xl font-black text-retro-dark mt-1">{recipients.length}</div>
                                            <div className="text-[10px] text-retro-secondary font-bold mt-1 uppercase">Allocated Faculty Roster</div>
                                        </div>

                                        <div className="bg-emerald-50 p-4 rounded-2xl border-2 border-emerald-600/40 shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wider">Mobile Ready</span>
                                                <i className="bi bi-shield-check text-emerald-600 text-lg"></i>
                                            </div>
                                            <div className="text-3xl font-black text-emerald-700 mt-1">{validCount}</div>
                                            <div className="text-[10px] text-emerald-600 font-bold mt-1 uppercase">{((validCount / (recipients.length || 1)) * 100).toFixed(0)}% Ready for Broadcast</div>
                                        </div>

                                        <div className={`p-4 rounded-2xl border-2 shadow-sm ${invalidCount > 0 ? 'bg-amber-50 border-amber-400' : 'bg-retro-cream/30 border-retro-dark/20'}`}>
                                            <div className="flex justify-between items-start">
                                                <span className="text-[11px] font-black text-amber-800 uppercase tracking-wider">Missing Mobile</span>
                                                <i className="bi bi-exclamation-triangle-fill text-amber-600 text-lg"></i>
                                            </div>
                                            <div className="text-3xl font-black text-amber-700 mt-1">{invalidCount}</div>
                                            <div className="text-[10px] text-amber-600 font-bold mt-1 uppercase">Requires Phone Update</div>
                                        </div>

                                        <div className="bg-retro-cream/30 p-4 rounded-2xl border-2 border-retro-dark shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <span className="text-[11px] font-black text-retro-secondary uppercase tracking-wider">Total Duties</span>
                                                <i className="bi bi-calendar-event-fill text-retro-dark text-lg"></i>
                                            </div>
                                            <div className="text-3xl font-black text-retro-dark mt-1">{totalDuties}</div>
                                            <div className="text-[10px] text-retro-secondary font-bold mt-1 uppercase">Exam Invigilations</div>
                                        </div>
                                    </div>

                                    {/* Department Roster Distribution Chips */}
                                    <div className="bg-white p-4 rounded-2xl border-2 border-retro-dark space-y-2.5 shadow-sm">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-xs font-black text-retro-dark uppercase tracking-wider flex items-center gap-2">
                                                <i className="bi bi-building-fill text-retro-dark text-sm"></i>
                                                Department Filter Roster
                                            </h4>
                                            <span className="text-[10px] font-bold text-retro-secondary">
                                                Click chip to filter
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {departmentList.map((dept, idx) => {
                                                const count = dept === 'ALL' ? recipients.length : deptCounts[dept] || 0;
                                                const isSelected = selectedDepartment === dept;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedDepartment(dept)}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2 flex items-center gap-2 ${
                                                            isSelected
                                                                ? 'bg-retro-dark text-white border-retro-dark shadow-sm'
                                                                : 'bg-retro-cream/40 text-retro-dark border-retro-dark/20 hover:border-retro-dark'
                                                        }`}
                                                    >
                                                        <span>{dept}</span>
                                                        <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white text-retro-dark' : 'bg-retro-dark/10 text-retro-dark'}`}>
                                                            {count}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Dispatch Quick Actions & Gateway Info */}
                                    <div className="bg-retro-cream/40 p-4 rounded-2xl border-2 border-retro-dark space-y-3">
                                        <div className="flex items-center justify-between text-xs font-bold text-retro-dark">
                                            <span className="flex items-center gap-2">
                                                <i className="bi bi-broadcast text-retro-dark"></i>
                                                Broadcast Channel: <span className="font-black text-retro-dark">Vendel SMS Gateway</span>
                                            </span>
                                            <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                                                Transactional Route
                                            </span>
                                        </div>

                                        <button
                                            onClick={() => handleSendBulkSMS(recipients)}
                                            disabled={sending || validCount === 0}
                                            className="w-full py-4 rounded-2xl bg-retro-dark text-white font-black text-sm uppercase tracking-wider border-2 border-retro-dark shadow-paper hover:bg-retro-dark/90 active:translate-y-[0px] hover:translate-y-[-2px] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                        >
                                            {sending ? (
                                                <>
                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                    <span>Dispatching Bulk SMS ({progress.current}/{progress.total})...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <i className="bi bi-send-fill text-lg"></i>
                                                    <span>Dispatch SMS to All ({validCount} Faculty Members)</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

                                </div>

                                {/* Right Side: Smartphone Mockup / Live SMS Simulator */}
                                <div className="lg:col-span-5 flex flex-col items-center">
                                    
                                    {/* Selector for Simulator */}
                                    <div className="w-full max-w-sm mb-3">
                                        <label className="text-[11px] font-black text-retro-dark uppercase tracking-wider block mb-1">
                                            Preview SMS Recipient Simulator
                                        </label>
                                        <select
                                            value={selectedPreviewIndex}
                                            onChange={(e) => setSelectedPreviewIndex(parseInt(e.target.value))}
                                            className="w-full px-3.5 py-2 rounded-xl border-2 border-retro-dark bg-white font-bold text-xs text-retro-dark outline-none focus:border-retro-dark cursor-pointer shadow-sm"
                                        >
                                            {filteredRecipients.map((r, i) => (
                                                <option key={i} value={recipients.indexOf(r)}>
                                                    {r.name} ({r.department || 'Dept'}) {r.hasValidPhone ? ` - ${r.cleanPhone}` : ' [No Phone]'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Smartphone Frame Mockup */}
                                    <div className="w-full max-w-[320px] bg-retro-dark rounded-[40px] p-4 border-4 border-retro-dark shadow-paper relative">
                                        
                                        {/* Speaker & Camera Notch */}
                                        <div className="w-28 h-4 bg-black rounded-full mx-auto mb-3 flex items-center justify-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full bg-gray-800"></div>
                                            <div className="w-8 h-1 rounded-full bg-gray-800"></div>
                                        </div>

                                        {/* Phone Screen Container */}
                                        <div className="bg-retro-cream/20 rounded-[28px] overflow-hidden border-2 border-retro-dark min-h-[380px] flex flex-col justify-between text-retro-dark">
                                            
                                            {/* Top Phone Status Bar */}
                                            <div className="bg-retro-cream px-4 py-2 text-[10px] font-bold text-retro-dark flex justify-between items-center border-b-2 border-retro-dark">
                                                <span>9:41 AM</span>
                                                <div className="flex items-center gap-1.5 text-xs">
                                                    <i className="bi bi-reception-4"></i>
                                                    <i className="bi bi-wifi"></i>
                                                    <i className="bi bi-battery-full"></i>
                                                </div>
                                            </div>

                                            {/* SMS Conversation Header */}
                                            <div className="bg-white px-4 py-2.5 border-b-2 border-retro-dark flex items-center gap-2.5 shadow-sm">
                                                <div className="w-7 h-7 rounded-full bg-retro-dark text-white font-black text-xs flex items-center justify-center">
                                                    <i className="bi bi-building"></i>
                                                </div>
                                                <div className="truncate">
                                                    <div className="font-extrabold text-xs text-retro-dark truncate">Exam Duty Alert Service</div>
                                                    <div className="text-[9px] font-semibold text-retro-secondary truncate">
                                                        To: {activePreviewRecipient.phone || 'No Phone Number'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Chat Screen Messages Area */}
                                            <div className="p-3.5 space-y-3 flex-1 overflow-y-auto bg-retro-white text-xs">
                                                <div className="text-center">
                                                    <span className="bg-retro-cream text-retro-dark font-black text-[9px] px-2 py-0.5 rounded-md uppercase border border-retro-dark/20 tracking-wider">
                                                        Today • DLT Verified SMS
                                                    </span>
                                                </div>

                                                {/* Retro Styled Message Bubble */}
                                                <div className="bg-retro-dark text-white p-3.5 rounded-2xl rounded-tr-none shadow-sm space-y-1.5 ml-3 font-mono text-[11px] leading-relaxed relative border-2 border-retro-dark">
                                                    <div>{activePreviewRecipient.message || 'No duty assignment message available.'}</div>
                                                    <div className="flex justify-end items-center gap-1 text-[9px] text-retro-cream font-sans">
                                                        <span>Just now</span>
                                                        <i className="bi bi-check2-all text-emerald-400 text-xs"></i>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Phone Footer Info Bar */}
                                            <div className="bg-retro-cream px-3 py-2 border-t-2 border-retro-dark text-[10px] font-bold text-retro-dark flex justify-between items-center">
                                                <span className="truncate">Recipient: <strong className="text-retro-dark">{activePreviewRecipient.name || 'Faculty'}</strong></span>
                                                <span className="bg-retro-dark text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase">
                                                    1 Credit
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* VIEW MODE 2: PHONE MANAGER TABLE */
                            <div className="space-y-4 animate-in fade-in duration-200">
                                
                                {/* Search & Filter Bar */}
                                <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-retro-cream/30 p-3.5 rounded-2xl border-2 border-retro-dark">
                                    <div className="relative w-full sm:w-72">
                                        <i className="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-retro-secondary"></i>
                                        <input
                                            type="text"
                                            placeholder="Search by faculty name or dept..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-retro-dark bg-white font-bold text-xs text-retro-dark outline-none focus:border-retro-dark transition-colors shadow-sm"
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                                        {/* Status Filter Buttons */}
                                        <span className="text-[11px] font-black text-retro-dark uppercase tracking-wider mr-1">Status:</span>
                                        <button
                                            onClick={() => setPhoneStatusFilter('ALL')}
                                            className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase transition-all border-2 border-retro-dark ${
                                                phoneStatusFilter === 'ALL' ? 'bg-retro-dark text-white' : 'bg-white text-retro-dark'
                                            }`}
                                        >
                                            All ({recipients.length})
                                        </button>
                                        <button
                                            onClick={() => setPhoneStatusFilter('VALID')}
                                            className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase transition-all border-2 border-emerald-600 ${
                                                phoneStatusFilter === 'VALID' ? 'bg-emerald-700 text-white' : 'bg-white text-emerald-800'
                                            }`}
                                        >
                                            Ready ({validCount})
                                        </button>
                                        <button
                                            onClick={() => setPhoneStatusFilter('MISSING')}
                                            className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase transition-all border-2 border-amber-600 ${
                                                phoneStatusFilter === 'MISSING' ? 'bg-amber-700 text-white' : 'bg-white text-amber-800'
                                            }`}
                                        >
                                            Missing ({invalidCount})
                                        </button>
                                    </div>
                                </div>

                                {/* Recipient Roster Table */}
                                <div className="max-h-[420px] overflow-y-auto border-2 border-retro-dark rounded-2xl bg-white shadow-sm">
                                    <table className="w-full text-left text-xs font-medium">
                                        <thead className="bg-retro-cream border-b-2 border-retro-dark font-black uppercase text-[10px] tracking-wider sticky top-0 z-10">
                                            <tr>
                                                <th className="p-3.5">Faculty Name</th>
                                                <th className="p-3.5">Department</th>
                                                <th className="p-3.5">Duties</th>
                                                <th className="p-3.5">Mobile Number (Editable)</th>
                                                <th className="p-3.5">Status</th>
                                                <th className="p-3.5 text-right">Quick Simulation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y border-retro-dark/10">
                                            {filteredRecipients.length === 0 ? (
                                                <tr>
                                                    <td colSpan="6" className="p-8 text-center text-retro-secondary font-bold text-xs uppercase">
                                                        No faculty members match current search filter.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredRecipients.map((item, idx) => {
                                                    const originalIndex = recipients.indexOf(item);
                                                    return (
                                                        <tr key={idx} className="hover:bg-retro-cream/20 transition-colors">
                                                            <td className="p-3.5 font-bold text-retro-dark">
                                                                <div className="flex items-center gap-2.5">
                                                                    <span className="w-7 h-7 rounded-lg bg-retro-dark text-white font-black text-xs flex items-center justify-center shadow-xs">
                                                                        {item.initials || item.name.substring(0, 2).toUpperCase()}
                                                                    </span>
                                                                    <span>{item.name}</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-3.5">
                                                                <span className="bg-retro-cream/60 px-2 py-0.5 rounded text-[11px] font-bold text-retro-dark border border-retro-dark/20 uppercase">
                                                                    {item.department || 'N/A'}
                                                                </span>
                                                            </td>
                                                            <td className="p-3.5 font-black text-retro-dark text-sm">
                                                                {item.dutiesCount}
                                                            </td>
                                                            <td className="p-3.5">
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="text"
                                                                        maxLength="10"
                                                                        placeholder="Type 10-digit mobile..."
                                                                        value={item.phone || ''}
                                                                        onChange={(e) => handlePhoneChange(originalIndex, e.target.value)}
                                                                        className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border-2 outline-none w-40 transition-all ${
                                                                            item.hasValidPhone
                                                                                ? 'bg-emerald-50 text-emerald-900 border-emerald-400 focus:ring-2 focus:ring-emerald-500'
                                                                                : 'bg-amber-50 text-amber-900 border-amber-400 focus:ring-2 focus:ring-amber-500'
                                                                        }`}
                                                                    />
                                                                    {item.hasValidPhone ? (
                                                                        <i className="bi bi-check-circle-fill text-emerald-600 text-sm" title="Valid 10-Digit Mobile"></i>
                                                                    ) : (
                                                                        <i className="bi bi-exclamation-circle-fill text-amber-600 text-sm" title="Enter 10-digit mobile number"></i>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="p-3.5">
                                                                {item.hasValidPhone ? (
                                                                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md">
                                                                        Ready
                                                                    </span>
                                                                ) : (
                                                                    <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md">
                                                                        Missing Phone
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-3.5 text-right">
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedPreviewIndex(originalIndex);
                                                                        setBulkViewMode('dashboard');
                                                                    }}
                                                                    className="px-3 py-1 rounded-lg bg-retro-dark text-white font-black text-[11px] uppercase border-2 border-retro-dark transition-all hover:bg-retro-dark/80 flex items-center gap-1.5 ml-auto"
                                                                >
                                                                    <i className="bi bi-eye-fill"></i> Peek Simulation
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
                        )
                    ) : activeTab === 'date' ? (
                        /* TAB 2: DATE-WISE DISPATCH CONTROL */
                        <div className="space-y-6 animate-in fade-in duration-200">
                            
                            {/* Date Selector Header Banner */}
                            <div className="bg-retro-cream/40 p-5 rounded-2xl border-2 border-retro-dark space-y-4">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div>
                                        <h4 className="text-sm font-black text-retro-dark uppercase tracking-wider flex items-center gap-2">
                                            <i className="bi bi-calendar-check-fill text-retro-dark text-base"></i>
                                            Select Exam Duty Date to Dispatch
                                        </h4>
                                        <p className="text-xs text-retro-secondary font-bold mt-0.5">
                                            Ideal after swapping or editing duty schedules for specific exam dates
                                        </p>
                                    </div>

                                    {/* Date Selection Pills */}
                                    <div className="flex flex-wrap gap-2">
                                        {availableDates.map((dVal, idx) => {
                                            const isSel = selectedDate === dVal;
                                            const countForDate = recipients.filter(r => (r.duties || []).some(d => d.date === dVal)).length;
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => setSelectedDate(dVal)}
                                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border-2 flex items-center gap-2 ${
                                                        isSel
                                                            ? 'bg-retro-dark text-white border-retro-dark shadow-paper'
                                                            : 'bg-white text-retro-dark border-retro-dark/30 hover:border-retro-dark'
                                                    }`}
                                                >
                                                    <span>{dVal}</span>
                                                    <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${isSel ? 'bg-white text-retro-dark' : 'bg-retro-dark/10 text-retro-dark'}`}>
                                                        {countForDate}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Date Metrics Summary */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white p-4 rounded-2xl border-2 border-retro-dark shadow-sm">
                                    <div className="text-xs font-bold text-retro-secondary uppercase tracking-wider">Target Faculty on {selectedDate || 'Selected Date'}</div>
                                    <div className="text-3xl font-black text-retro-dark mt-1">{dateRecipients.length}</div>
                                    <div className="text-[10px] text-retro-secondary font-bold mt-1 uppercase">Assigned Invigilators & Deputies</div>
                                </div>

                                <div className="bg-emerald-50 p-4 rounded-2xl border-2 border-emerald-600/40 shadow-sm">
                                    <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Ready Mobile Numbers</div>
                                    <div className="text-3xl font-black text-emerald-700 mt-1">{dateValidCount}</div>
                                    <div className="text-[10px] text-emerald-600 font-bold mt-1 uppercase">Valid 10-Digit Mobile Ready</div>
                                </div>

                                <div className={`p-4 rounded-2xl border-2 shadow-sm ${dateInvalidCount > 0 ? 'bg-amber-50 border-amber-400' : 'bg-retro-cream/30 border-retro-dark/20'}`}>
                                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Missing Mobile Numbers</div>
                                    <div className="text-3xl font-black text-amber-700 mt-1">{dateInvalidCount}</div>
                                    <div className="text-[10px] text-amber-600 font-bold mt-1 uppercase">Requires Mobile Update</div>
                                </div>
                            </div>

                            {/* Date-Specific SMS Message Preview Box */}
                            <div className="bg-white p-4 rounded-2xl border-2 border-retro-dark space-y-1.5 shadow-sm">
                                <div className="flex justify-between items-center">
                                    <h5 className="text-xs font-black text-retro-dark uppercase tracking-wider flex items-center gap-2">
                                        <i className="bi bi-chat-quote-fill text-retro-dark text-sm"></i>
                                        Single-Day SMS Alert Format ({selectedDate})
                                    </h5>
                                    <span className="text-[10px] font-black text-retro-dark bg-retro-cream px-2 py-0.5 rounded border border-retro-dark/20 uppercase">
                                        Date-Specific
                                    </span>
                                </div>
                                <div className="bg-retro-cream/30 p-3 rounded-xl border border-retro-dark/20 font-mono text-xs text-retro-dark leading-relaxed">
                                    {dateRecipients.length > 0
                                        ? formatDateSpecificMessage(dateRecipients[0].name, dateRecipients[0].duties, selectedDate)
                                        : `SIT Tumakuru Exam Allotment:\nDear Faculty,\nYour Duty Schedule for ${selectedDate}:\nSession: AM | Room: GJCB101\nPlease report 30 mins prior.`
                                    }
                                </div>
                                <p className="text-[10px] font-bold text-retro-secondary uppercase tracking-wide italic">
                                    * SMS contains duty details ONLY for {selectedDate}. Other dates are omitted.
                                </p>
                            </div>

                            {/* Faculty Roster for Selected Date */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <h5 className="text-xs font-black text-retro-dark uppercase tracking-wider flex items-center gap-2">
                                        <i className="bi bi-person-lines-fill text-retro-dark"></i>
                                        Faculty Duty Roster for Date: <span className="font-mono text-retro-dark">{selectedDate || 'N/A'}</span> ({dateRecipients.length} Members)
                                    </h5>
                                    <span className="text-[10px] font-bold text-retro-secondary uppercase">
                                        Only these members will receive SMS
                                    </span>
                                </div>

                                <div className="max-h-[300px] overflow-y-auto border-2 border-retro-dark rounded-2xl bg-white shadow-sm">
                                    <table className="w-full text-left text-xs font-medium">
                                        <thead className="bg-retro-cream border-b-2 border-retro-dark font-black uppercase text-[10px] tracking-wider sticky top-0 z-10">
                                            <tr>
                                                <th className="p-3.5">Faculty Name</th>
                                                <th className="p-3.5">Department</th>
                                                <th className="p-3.5">Duties on Date</th>
                                                <th className="p-3.5">Mobile Number (Editable)</th>
                                                <th className="p-3.5">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y border-retro-dark/10">
                                            {dateRecipients.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="p-8 text-center text-retro-secondary font-bold text-xs uppercase">
                                                        No faculty duties scheduled on {selectedDate}.
                                                    </td>
                                                </tr>
                                            ) : (
                                                dateRecipients.map((item, idx) => {
                                                    const originalIndex = recipients.indexOf(item);
                                                    const dutiesOnThisDate = (item.duties || []).filter(d => d.date === selectedDate);
                                                    return (
                                                        <tr key={idx} className="hover:bg-retro-cream/20 transition-colors">
                                                            <td className="p-3.5 font-bold text-retro-dark">
                                                                <div className="flex items-center gap-2.5">
                                                                    <span className="w-7 h-7 rounded-lg bg-retro-dark text-white font-black text-xs flex items-center justify-center shadow-xs">
                                                                        {item.initials || item.name.substring(0, 2).toUpperCase()}
                                                                    </span>
                                                                    <span>{item.name}</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-3.5">
                                                                <span className="bg-retro-cream/60 px-2 py-0.5 rounded text-[11px] font-bold text-retro-dark border border-retro-dark/20 uppercase">
                                                                    {item.department || 'N/A'}
                                                                </span>
                                                            </td>
                                                            <td className="p-3.5 font-bold text-retro-dark text-xs">
                                                                {dutiesOnThisDate.map((d, di) => (
                                                                    <span key={di} className="inline-block bg-retro-cream px-2 py-0.5 rounded border border-retro-dark/20 mr-1">
                                                                        {d.session} - {d.room}
                                                                    </span>
                                                                ))}
                                                            </td>
                                                            <td className="p-3.5">
                                                                <input
                                                                    type="text"
                                                                    maxLength="10"
                                                                    placeholder="Type 10-digit mobile..."
                                                                    value={item.phone || ''}
                                                                    onChange={(e) => handlePhoneChange(originalIndex, e.target.value)}
                                                                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border-2 outline-none w-40 transition-all ${
                                                                        item.hasValidPhone
                                                                            ? 'bg-emerald-50 text-emerald-900 border-emerald-400 focus:ring-2 focus:ring-emerald-500'
                                                                            : 'bg-amber-50 text-amber-900 border-amber-400 focus:ring-2 focus:ring-amber-500'
                                                                    }`}
                                                                />
                                                            </td>
                                                            <td className="p-3.5">
                                                                {item.hasValidPhone ? (
                                                                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md">
                                                                        Ready
                                                                    </span>
                                                                ) : (
                                                                    <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md">
                                                                        Missing Phone
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Date Dispatch Button CTA */}
                            <div className="pt-2">
                                <button
                                    onClick={() => handleSendBulkSMS(dateRecipients, selectedDate)}
                                    disabled={sending || dateValidCount === 0}
                                    className="w-full py-4 rounded-2xl bg-retro-dark text-white font-black text-sm uppercase tracking-wider border-2 border-retro-dark shadow-paper hover:bg-retro-dark/90 active:translate-y-[0px] hover:translate-y-[-2px] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {sending ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            <span>Dispatching Date SMS ({progress.current}/{progress.total})...</span>
                                        </>
                                    ) : (
                                        <>
                                            <i className="bi bi-send-fill text-lg"></i>
                                            <span>Dispatch SMS for Date: {selectedDate} ({dateValidCount} Faculty Members)</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* TAB 3: SINGLE SMS DISPATCH STUDIO */
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-200">
                            
                            {/* Left Side: Single Form & Variable Chips */}
                            <div className="lg:col-span-7 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Faculty Selector */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black text-retro-dark uppercase tracking-wider block">
                                            Target Faculty Member
                                        </label>
                                        <select
                                            value={selectedRecipientIndex}
                                            onChange={(e) => handleSelectSingleRecipient(parseInt(e.target.value))}
                                            className="w-full px-3.5 py-2.5 rounded-xl border-2 border-retro-dark bg-white font-bold text-xs text-retro-dark outline-none focus:border-retro-dark cursor-pointer shadow-sm"
                                        >
                                            {recipients.map((r, i) => (
                                                <option key={i} value={i}>
                                                    {r.name} ({r.department || 'Dept'}) {r.hasValidPhone ? ` - ${r.cleanPhone}` : ' - [No Phone]'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Recipient Phone */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black text-retro-dark uppercase tracking-wider block">
                                            Mobile Number (10 Digits)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs text-retro-secondary">🇮🇳 +91</span>
                                            <input
                                                type="text"
                                                maxLength="10"
                                                value={singlePhone}
                                                onChange={(e) => setSinglePhone(e.target.value)}
                                                placeholder="10-digit phone..."
                                                className="w-full pl-16 pr-3 py-2.5 rounded-xl border-2 border-retro-dark bg-white font-mono font-bold text-xs text-retro-dark outline-none focus:border-retro-dark shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Custom SMS Content Box & Variable Insert Chips */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-black text-retro-dark uppercase tracking-wider block">
                                            SMS Message Editor
                                        </label>
                                        <span className="text-[10px] font-bold text-retro-secondary uppercase">
                                            Insert Variable Chips:
                                        </span>
                                    </div>

                                    {/* Variable Chips */}
                                    <div className="flex flex-wrap gap-1.5 pb-1">
                                        <button
                                            onClick={() => insertVariableChip('{Faculty Name}')}
                                            className="px-2.5 py-1 rounded-md bg-retro-cream/60 hover:bg-retro-dark hover:text-white border border-retro-dark/20 text-[10px] font-black uppercase transition-all"
                                        >
                                            + Faculty Name
                                        </button>
                                        <button
                                            onClick={() => insertVariableChip('{Department}')}
                                            className="px-2.5 py-1 rounded-md bg-retro-cream/60 hover:bg-retro-dark hover:text-white border border-retro-dark/20 text-[10px] font-black uppercase transition-all"
                                        >
                                            + Department
                                        </button>
                                        <button
                                            onClick={() => insertVariableChip('{Exam Date}')}
                                            className="px-2.5 py-1 rounded-md bg-retro-cream/60 hover:bg-retro-dark hover:text-white border border-retro-dark/20 text-[10px] font-black uppercase transition-all"
                                        >
                                            + Exam Date
                                        </button>
                                        <button
                                            onClick={() => insertVariableChip('{Room No}')}
                                            className="px-2.5 py-1 rounded-md bg-retro-cream/60 hover:bg-retro-dark hover:text-white border border-retro-dark/20 text-[10px] font-black uppercase transition-all"
                                        >
                                            + Room No
                                        </button>
                                    </div>

                                    <textarea
                                        rows="5"
                                        value={singleMessage}
                                        onChange={(e) => setSingleMessage(e.target.value)}
                                        className="w-full p-4 rounded-xl border-2 border-retro-dark bg-white font-mono text-xs text-retro-dark outline-none focus:border-retro-dark leading-relaxed shadow-sm"
                                        placeholder="Type customized SMS message..."
                                    ></textarea>

                                    {/* Character Counter & SMS Credit Calculator */}
                                    <div className="flex justify-between items-center text-[10px] font-bold text-retro-secondary px-1">
                                        <span>Length: <strong className="text-retro-dark">{singleCharCount}</strong> characters</span>
                                        <span className="bg-retro-cream px-2 py-0.5 rounded border border-retro-dark/20 font-black uppercase text-retro-dark">
                                            {singleCredits} SMS Credit ({singleCredits * 160} Max Chars)
                                        </span>
                                    </div>
                                </div>

                                {/* Status Feedback */}
                                {singleStatus && (
                                    <div className={`p-4 rounded-xl border-2 font-bold text-xs flex items-center gap-3 ${
                                        singleStatus.type === 'success'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                            : 'bg-red-50 text-red-800 border-red-300'
                                    }`}>
                                        <i className={`bi ${singleStatus.type === 'success' ? 'bi-check-circle-fill text-lg text-emerald-600' : 'bi-exclamation-triangle-fill text-lg text-red-600'}`}></i>
                                        <div>
                                            <div>{singleStatus.msg}</div>
                                            {singleStatus.dryRun && <div className="text-[10px] font-black uppercase text-amber-700 mt-0.5">[SMS DRY RUN MODE ACTIVE]</div>}
                                        </div>
                                    </div>
                                )}

                                {/* Submit Action */}
                                <div className="pt-2 flex justify-end">
                                    <button
                                        onClick={handleSendSingleSMS}
                                        disabled={sendingSingle}
                                        className="px-8 py-3.5 rounded-2xl bg-retro-dark text-white font-black text-xs uppercase tracking-wider border-2 border-retro-dark shadow-paper hover:bg-retro-dark/90 active:translate-y-[0px] hover:translate-y-[-2px] transition-all disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {sendingSingle ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                <span>Dispatching SMS...</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-send-fill text-xs"></i>
                                                <span>Dispatch Single SMS</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Right Side: Smartphone Simulation */}
                            <div className="lg:col-span-5 flex flex-col items-center">
                                <div className="text-[11px] font-black text-retro-dark uppercase tracking-wider mb-2">
                                    Live Single SMS Smartphone Simulation
                                </div>

                                <div className="w-full max-w-[320px] bg-retro-dark rounded-[40px] p-4 border-4 border-retro-dark shadow-paper relative">
                                    {/* Phone Notch */}
                                    <div className="w-28 h-4 bg-black rounded-full mx-auto mb-3 flex items-center justify-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-gray-800"></div>
                                        <div className="w-8 h-1 rounded-full bg-gray-800"></div>
                                    </div>

                                    {/* Screen */}
                                    <div className="bg-retro-cream/20 rounded-[28px] overflow-hidden border-2 border-retro-dark min-h-[380px] flex flex-col justify-between text-retro-dark">
                                        <div className="bg-retro-cream px-4 py-2 text-[10px] font-bold text-retro-dark flex justify-between items-center border-b-2 border-retro-dark">
                                            <span>9:41 AM</span>
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <i className="bi bi-reception-4"></i>
                                                <i className="bi bi-wifi"></i>
                                                <i className="bi bi-battery-full"></i>
                                            </div>
                                        </div>

                                        <div className="bg-white px-4 py-2.5 border-b-2 border-retro-dark flex items-center gap-2.5 shadow-sm">
                                            <div className="w-7 h-7 rounded-full bg-retro-dark text-white font-black text-xs flex items-center justify-center">
                                                <i className="bi bi-person-fill"></i>
                                            </div>
                                            <div className="truncate">
                                                <div className="font-extrabold text-xs text-retro-dark truncate">
                                                    {(recipients[selectedRecipientIndex] || {}).name || 'Target Recipient'}
                                                </div>
                                                <div className="text-[9px] font-semibold text-retro-secondary truncate">
                                                    +91 {singlePhone || 'XXXXXXXXXX'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-3.5 space-y-3 flex-1 overflow-y-auto bg-retro-white text-xs">
                                            <div className="text-center">
                                                <span className="bg-retro-cream text-retro-dark font-black text-[9px] px-2 py-0.5 rounded-md uppercase border border-retro-dark/20 tracking-wider">
                                                    Direct SMS Preview
                                                </span>
                                            </div>

                                            <div className="bg-retro-dark text-white p-3.5 rounded-2xl rounded-tr-none shadow-sm space-y-1.5 ml-3 font-mono text-[11px] leading-relaxed border-2 border-retro-dark">
                                                <div>{singleMessage || 'Type a message to preview...'}</div>
                                                <div className="flex justify-end items-center gap-1 text-[9px] text-retro-cream font-sans">
                                                    <span>Drafting</span>
                                                    <i className="bi bi-pencil-fill text-[9px]"></i>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-retro-cream px-3 py-2 border-t-2 border-retro-dark text-[10px] font-bold text-retro-dark flex justify-between items-center">
                                            <span>Credits: <strong className="text-retro-dark">{singleCredits} SMS</strong></span>
                                            <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-emerald-300 uppercase">
                                                Ready
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SMSNotificationModal;
