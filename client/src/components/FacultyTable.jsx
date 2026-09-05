import React, { useContext } from 'react';
import AuthContext from '../context/AuthContext';

const getDesignationRank = (designation) => {
    const d = (designation || '').toLowerCase().trim();
    if (d.includes('professor') && !d.includes('assistant') && !d.includes('asst') && !d.includes('associate') && !d.includes('assoc')) {
        return 1; // Professor
    }
    if (d.includes('associate') || d.includes('assoc')) {
        return 2; // Associate Professor
    }
    if (d.includes('assistant') || d.includes('asst')) {
        return 3; // Assistant Professor
    }
    return 4; // Others / Lecturers
};

const FacultyTable = ({ faculty, onToggleStatus, onDelete, onViewDuties }) => {
    const { user } = useContext(AuthContext);

    if (faculty.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-80 rounded-xl bg-retro-white border-2 border-dashed border-retro-border">
                <div className="w-16 h-16 rounded-full bg-retro-cream flex items-center justify-center mb-4 text-retro-secondary">
                    <i className="bi bi-clipboard-x text-3xl"></i>
                </div>
                <h3 className="text-retro-secondary font-bold">Directory Empty</h3>
            </div>
        );
    }

    const sortedFaculty = [...faculty].sort((a, b) => {
        const rankA = getDesignationRank(a.designation);
        const rankB = getDesignationRank(b.designation);

        if (rankA !== rankB) {
            return rankA - rankB; // Professor -> Associate -> Assistant -> Others
        }

        const deptA = (a.department || '').toLowerCase();
        const deptB = (b.department || '').toLowerCase();
        if (deptA < deptB) return -1;
        if (deptA > deptB) return 1;

        return (a.name || '').localeCompare(b.name || '');
    });

    return (
        <div className="w-full">
            {/* Retro Card Container */}
            <div className="rounded-xl bg-retro-white border-2 border-retro-dark overflow-hidden shadow-paper">

                {/* Header */}
                <div className="px-8 py-5 border-b-2 border-retro-dark bg-retro-cream/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <i className="bi bi-table text-retro-secondary"></i>
                        <h2 className="text-sm font-black text-retro-dark uppercase tracking-widest">List</h2>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-retro-white border-2 border-retro-dark text-[10px] font-bold text-retro-dark shadow-sm">
                        {faculty.length} Faculty
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[11px] text-retro-secondary uppercase tracking-wider font-bold border-b-2 border-retro-border bg-retro-white">
                                <th className="px-8 py-4 pl-10 w-[30%]">Name</th>
                                <th className="px-6 py-4 w-[20%]">Role</th>
                                <th className="px-6 py-4 w-[20%]">Department</th>
                                <th className="px-6 py-4 w-[10%] text-center">Status</th>
                                <th className="px-8 py-4 w-[20%] text-right pr-10">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-retro-border">
                            {sortedFaculty.map((fac) => (
                                <tr
                                    key={fac._id}
                                    className="group hover:bg-retro-cream/30 transition-colors duration-200"
                                >
                                    {/* Identity */}
                                    <td className="px-8 py-4 pl-10">
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-lg bg-retro-blue border-2 border-retro-dark flex items-center justify-center text-xs font-bold text-white shadow-[2px_2px_0px_rgba(0,0,0,1)] group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:shadow-none transition-all">
                                                    {fac.initials}
                                                </div>
                                                {fac.isActive && (
                                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white"></div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-bold text-retro-dark text-sm">
                                                    {fac.name}
                                                </div>
                                                <div className="text-[10px] text-retro-secondary font-mono tracking-wide">
                                                    {fac.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Role */}
                                    <td className="px-6 py-4">
                                        <span className="text-xs text-retro-dark font-bold bg-retro-cream px-2 py-1 rounded border border-retro-border">
                                            {fac.designation}
                                        </span>
                                    </td>

                                    {/* Department */}
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-retro-blue"></span>
                                            <span className="text-xs text-retro-secondary font-bold truncate">
                                                {fac.department}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Status Toggle */}
                                    <td className="px-6 py-4 text-center">
                                        {user && user.role === 'admin' ? (
                                            <button
                                                onClick={() => onToggleStatus(fac._id)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-2 transition-all ${fac.isActive
                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-600 hover:bg-emerald-200'
                                                    : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                                                    }`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${fac.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                                                {fac.isActive ? 'Active' : 'Offline'}
                                            </button>
                                        ) : (
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-2 ${fac.isActive
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                : 'bg-slate-50 text-slate-500 border-slate-200'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${fac.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                                                {fac.isActive ? 'Active' : 'Offline'}
                                            </span>
                                        )}
                                    </td>

                                    {/* Actions */}
                                    <td className="px-8 py-4 pr-10 text-right">
                                        <div className="flex items-center justify-end gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => onViewDuties(fac)}
                                                className="px-3 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105"
                                            >
                                                DUTIES
                                            </button>

                                            {user && user.role === 'admin' && (
                                                <button
                                                    onClick={() => onDelete(fac._id)}
                                                    className="px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105"
                                                >
                                                    DELETE
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default FacultyTable;
