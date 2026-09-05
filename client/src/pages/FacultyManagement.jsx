import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import FacultyTable from '../components/FacultyTable';
import AddFacultyModal from '../components/AddFacultyModal';
import FacultyDutiesModal from '../components/FacultyDutiesModal';
import { generateDepartmentReport } from '../utils/exportUtils';

const FacultyManagement = () => {
    const location = useLocation();
    const { user } = useContext(AuthContext);
    const [faculty, setFaculty] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [selectedFacultyForDuties, setSelectedFacultyForDuties] = useState(null);
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        fetchFaculty();
    }, []);

    const fetchFaculty = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/faculty');
            setFaculty(res.data);

            const uniqueDepts = [...new Set(res.data.map(f => f.department))].sort();
            setDepartments(uniqueDepts);

            // Apply AI Filter if navigated from AIChatOverlay
            if (location.state?.aiFilter) {
                const targetDept = location.state.aiFilter.toUpperCase();
                if (uniqueDepts.includes(targetDept)) {
                    setDepartmentFilter(targetDept);
                } else {
                    setSearchTerm(location.state.aiFilter); // Fallback to search if it's not a strict department match
                }
                // Clear state so it doesn't persist on refresh
                window.history.replaceState({}, document.title);
            }

            setLoading(false);
        } catch (err) {
            console.error('Error fetching faculty:', err);
            setLoading(false);
        }
    };

    const handleExportAllocations = async () => {
        try {
            const res = await axios.get('/api/allocations');
            const allocations = res.data;

            if (allocations.length === 0) {
                alert('No allocations found in database to export.');
                return;
            }

            // Transform DB flat data to sessionData format for generator
            // sessionData structure: { date: { session: { deputies: [], invigilators: [] } } }
            const sessionData = {};

            allocations.forEach(alloc => {
                const { date, session } = alloc;
                if (!sessionData[date]) sessionData[date] = {};
                if (!sessionData[date][session]) sessionData[date][session] = { deputies: [], invigilators: [] };

                const person = {
                    name: alloc.facultyName,
                    initials: alloc.initials,
                    designation: alloc.designation,
                    // Use populated department if available, otherwise 'Unknown'
                    department: alloc.facultyId?.department || 'Unknown',
                    dept: alloc.facultyId?.department || 'Unknown',
                    room: alloc.room,
                    role: alloc.role,
                    // phone/mobile not strictly in DB allocationDetail but might be needed?
                    // AllocationDetail doesn't store phone. Generator uses 'phone' or 'contact'.
                    // We might miss phone numbers here unless we fetch full faculty details.
                    // For now, let's leave phone empty or try to map if we have faculty list loaded.
                };

                // Try to find phone from loaded faculty list
                const facultyDetails = faculty.find(f => f._id === alloc.facultyId?._id || f.initials === alloc.initials);
                if (facultyDetails) {
                    person.phone = facultyDetails.phone;
                    person.contact = facultyDetails.phone;
                    if (!person.department || person.department === 'Unknown') {
                        person.department = facultyDetails.department;
                        person.dept = facultyDetails.department;
                    }
                }

                if (alloc.role === 'Deputy') {
                    sessionData[date][session].deputies.push(person);
                } else {
                    sessionData[date][session].invigilators.push(person);
                }
            });

            generateDepartmentReport(sessionData);

        } catch (err) {
            console.error('Export Error:', err);
            alert('Failed to export allocations.');
        }
    };

    const handleAddFaculty = async (newFaculty) => {
        try {
            const res = await axios.post('/api/faculty', newFaculty);
            setFaculty([...faculty, res.data]);
            setShowModal(false);

            if (!departments.includes(res.data.department)) {
                setDepartments([...departments, res.data.department].sort());
            }
        } catch (err) {
            console.error('Error adding faculty:', err);
            alert('Failed to add faculty');
        }
    };

    const handleToggleStatus = async (id) => {
        try {
            const res = await axios.patch(`/api/faculty/${id}/toggle`);
            setFaculty(faculty.map(f => f._id === id ? { ...f, isActive: res.data.isActive } : f));
        } catch (err) {
            console.error('Error toggling status:', err);
            alert('Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this faculty member?')) return;
        try {
            await axios.delete(`/api/faculty/${id}`);
            setFaculty(faculty.filter(f => f._id !== id));
        } catch (err) {
            console.error('Error deleting faculty:', err);
            alert('Failed to delete faculty');
        }
    };

    const [designationFilter, setDesignationFilter] = useState('');

    const matchesDesignation = (facultyDesignation, filterKey) => {
        if (!filterKey) return true;
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

    const filteredFaculty = faculty.filter(f => {
        const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.initials.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = departmentFilter ? f.department === departmentFilter : true;
        const matchesDesig = matchesDesignation(f.designation, designationFilter);
        return matchesSearch && matchesDept && matchesDesig;
    });

    return (
        <div className="space-y-8 animate-fade-in-up pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 relative">
                <div className="relative z-10">
                    <h1 className="text-4xl font-black text-retro-dark tracking-tight">
                        Faculty Details
                    </h1>
                </div>

                <div className="flex gap-4 relative z-10">
                    {user && user.role === 'admin' && (
                        <>
                            <button
                                onClick={handleExportAllocations}
                                className="flex items-center gap-3 px-5 py-3 rounded-lg bg-white border-2 border-retro-border text-retro-secondary font-bold hover:border-retro-blue hover:text-retro-blue transition-all text-xs uppercase tracking-wider"
                            >
                                <i className="bi bi-cloud-arrow-down-fill text-lg"></i>
                                <span>Dept Doc</span>
                            </button>
                            <button
                                onClick={() => setShowModal(true)}
                                className="flex items-center gap-3 px-6 py-3 rounded-lg bg-retro-blue text-white font-bold shadow-paper hover:translate-y-[-2px] hover:shadow-lg transition-all border-2 border-retro-dark text-xs uppercase tracking-wider"
                            >
                                <i className="bi bi-plus-lg text-lg"></i>
                                <span>New Faculty</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filter Bar (Retro Pill) */}
            <div className="bg-retro-white p-2 rounded-xl border-2 border-retro-dark/10 flex flex-col md:flex-row gap-2 shadow-sm items-center">
                <div className="relative flex-1 w-full group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-retro-secondary group-focus-within:text-retro-blue transition-colors">
                        <i className="bi bi-search"></i>
                    </div>
                    <input
                        type="text"
                        className="w-full pl-12 pr-6 py-3 rounded-lg bg-transparent text-retro-dark placeholder-retro-secondary/50 font-bold focus:bg-retro-cream/20 outline-none transition-all text-sm"
                        placeholder="Search faculty..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="md:w-px md:h-8 bg-retro-dark/10 hidden md:block"></div>
                <div className="md:w-52 w-full relative">
                    <select
                        className="w-full pl-4 pr-10 py-3 rounded-lg bg-transparent text-retro-secondary font-bold outline-none cursor-pointer appearance-none hover:bg-retro-cream/20 transition-colors text-xs uppercase tracking-wider"
                        value={designationFilter}
                        onChange={(e) => setDesignationFilter(e.target.value)}
                    >
                        <option value="" className="bg-white text-retro-secondary">All Roles</option>
                        <option value="PROFESSOR" className="bg-white text-retro-dark">Professors</option>
                        <option value="ASSOCIATE" className="bg-white text-retro-dark">Associate Prof.</option>
                        <option value="ASSISTANT" className="bg-white text-retro-dark">Assistant Prof.</option>
                        <option value="OTHER" className="bg-white text-retro-dark">Others</option>
                    </select>
                    <i className="bi bi-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-retro-secondary pointer-events-none text-xs"></i>
                </div>
                <div className="md:w-px md:h-8 bg-retro-dark/10 hidden md:block"></div>
                <div className="md:w-52 w-full relative">
                    <select
                        className="w-full pl-4 pr-10 py-3 rounded-lg bg-transparent text-retro-secondary font-bold outline-none cursor-pointer appearance-none hover:bg-retro-cream/20 transition-colors text-xs uppercase tracking-wider"
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                    >
                        <option value="" className="bg-white text-retro-secondary">All Departments</option>
                        {departments.map(dept => (
                            <option key={dept} value={dept} className="bg-white text-retro-dark">{dept}</option>
                        ))}
                    </select>
                    <i className="bi bi-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-retro-secondary pointer-events-none text-xs"></i>
                </div>
            </div>

            {/* List Content */}
            {loading ? (
                <div className="flex justify-center py-32">
                    <div className="flex flex-col items-center gap-6">
                        <div className="relative">
                            <div className="w-20 h-20 border-4 border-cyan-900/50 border-t-cyan-400 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 border-4 border-cyan-400/20 rounded-full animate-pulse blur-[1px]"></div>
                        </div>
                        <span className="text-cyan-400 font-bold tracking-[0.3em] uppercase text-xs animate-pulse">Initializing Sonar...</span>
                    </div>
                </div>
            ) : !searchTerm && !departmentFilter ? (
                <div className="max-w-4xl mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden">
                        <div className="p-8 text-center border-b-2 border-retro-dark bg-retro-cream/20">
                            <div className="w-20 h-20 bg-retro-blue text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border-2 border-retro-dark text-3xl">
                                <i className="bi bi-search"></i>
                            </div>
                            <h2 className="text-2xl font-black text-retro-dark uppercase tracking-tight mb-2">Ready to Search</h2>
                            <p className="text-retro-secondary font-bold text-sm max-w-lg mx-auto">
                                Search for a faculty member by name or select a department from the dropdown to view details.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 divide-y-2 md:divide-y-0 md:divide-x-2 divide-retro-dark">
                            <div className="p-8">
                                <h3 className="text-xs font-black text-retro-dark mb-4 uppercase tracking-wide flex items-center gap-2">
                                    <i className="bi bi-info-circle-fill text-retro-blue"></i> About The Project
                                </h3>
                                <div className="space-y-4 text-xs font-medium text-retro-secondary leading-relaxed text-justify">
                                    <p>
                                        This project was conceptualized under the guidance of <span className="font-bold text-retro-dark">Dr. T. N. Chandrika</span>, Department of Electronics and Telecommunication Engineering, Siddaganga Institute of Technology Tumkur. whose vision, mentorship, and academic leadership were instrumental in shaping the development of the system.
                                    </p>
                                    <div className="bg-retro-cream/30 p-4 rounded-lg border border-retro-dark/5">
                                        <p className="font-bold text-retro-dark mb-2">Developed by Students:</p>
                                        <ul className="space-y-2">
                                            <li className="flex items-center gap-3">
                                                <span className="w-6 h-6 rounded-full bg-retro-dark text-white flex items-center justify-center text-[10px] font-bold">H</span>
                                                <span><span className="font-bold">Harsha T. C.</span> — AI & Data Science <span className="opacity-50 text-[10px]">(1SI24AD064)</span></span>
                                            </li>

                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div className="p-8 bg-retro-dark/5">
                                <h3 className="text-xs font-black text-retro-dark mb-4 uppercase tracking-wide flex items-center gap-2">
                                    <i className="bi bi-headset text-retro-dark"></i> Contact Support
                                </h3>
                                <div className="space-y-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-white border-2 border-retro-border flex items-center justify-center text-retro-blue shadow-sm">
                                            <i className="bi bi-envelope-fill text-xl"></i>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-retro-secondary uppercase tracking-widest mb-0.5">Email Support</p>
                                            <p className="font-bold text-retro-dark text-sm">chandruharsha8@gmail.com</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-white border-2 border-retro-border flex items-center justify-center text-retro-blue shadow-sm">
                                            <i className="bi bi-telephone-fill text-xl"></i>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-retro-secondary uppercase tracking-widest mb-0.5">Phone Support</p>
                                            <p className="font-bold text-retro-dark text-sm">73491 17072</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-white border-2 border-retro-border flex items-center justify-center text-retro-blue shadow-sm">
                                            <i className="bi bi-geo-alt-fill text-xl"></i>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-retro-secondary uppercase tracking-widest mb-0.5">Location</p>
                                            <p className="font-bold text-retro-dark text-sm">Telecom Dept. SIT Tumkur</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <FacultyTable
                    faculty={filteredFaculty}
                    onToggleStatus={handleToggleStatus}
                    onDelete={handleDelete}
                    onViewDuties={setSelectedFacultyForDuties}
                />
            )}

            {showModal && (
                <AddFacultyModal
                    onClose={() => setShowModal(false)}
                    onSave={handleAddFaculty}
                    departments={departments}
                    faculty={faculty}
                />
            )}

            {selectedFacultyForDuties && (
                <FacultyDutiesModal
                    faculty={selectedFacultyForDuties}
                    onClose={() => setSelectedFacultyForDuties(null)}
                />
            )}
        </div>
    );
};

export default FacultyManagement;
