import React, { useContext, useState } from 'react';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import StatusModal from '../components/StatusModal';

const Settings = () => {
    const { logout } = useContext(AuthContext);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Status Modal State
    const [statusModal, setStatusModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'success'
    });

    const handleClearDB = async (password) => {
        if (!password) return;

        setLoading(true);
        try {
            const res = await axios.delete('/api/allocations', {
                data: { password } // Send password in body
            });
            setIsDeleteModalOpen(false); // Close delete modal

            // Show Success Modal
            setStatusModal({
                isOpen: true,
                title: 'Success!',
                message: res.data.msg,
                type: 'success'
            });
        } catch (err) {
            console.error('Clear DB Error:', err);
            const errMsg = err.response?.data?.msg || err.response?.data || err.message;

            setStatusModal({
                isOpen: true,
                title: 'Error',
                message: errMsg,
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto pb-20 font-sans text-retro-dark pt-10 px-4">

            <header className="mb-8">
                <h1 className="text-2xl font-black text-retro-dark tracking-tight">Settings</h1>
            </header>

            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">

                {/* Section: Account */}
                <section>
                    <h2 className="text-[10px] font-black text-retro-secondary uppercase tracking-widest mb-2 pl-2">Account</h2>
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-retro-dark text-retro-cream flex items-center justify-center text-lg font-black border border-retro-dark">
                                    <i className="bi bi-person-fill"></i>
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-retro-dark">Administrator</h3>
                                    <p className="text-[10px] font-bold text-retro-secondary uppercase tracking-wide">Privileged Access</p>
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                className="px-4 py-1.5 rounded-lg font-bold text-retro-dark border-2 border-retro-dark/10 hover:border-retro-dark hover:bg-retro-dark hover:text-white transition-all text-xs flex items-center gap-2 bg-retro-cream/20"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </section>

                {/* Section: System */}
                <section>
                    <h2 className="text-[10px] font-black text-retro-secondary uppercase tracking-widest mb-2 pl-2">System Management</h2>
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden divide-y-2 divide-retro-dark/5">
                        <div className="p-4 flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-black text-retro-dark">Reset Allocation Data</h3>
                                <p className="text-[10px] font-bold text-retro-secondary leading-relaxed mt-0.5 max-w-sm">
                                    Permanently delete all exam duties and records. Irreversible.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsDeleteModalOpen(true)}
                                className="shrink-0 px-4 py-1.5 rounded-lg font-bold text-retro-red border-2 border-retro-red/20 hover:border-retro-red hover:bg-retro-red hover:text-white transition-all text-xs flex items-center gap-2"
                            >
                                <i className="bi bi-trash-fill"></i>
                                Delete
                            </button>
                        </div>
                    </div>
                </section>

                {/* Section: Information */}
                <section>
                    <h2 className="text-[10px] font-black text-retro-secondary uppercase tracking-widest mb-2 pl-2">Information</h2>
                    <div className="bg-retro-white rounded-xl shadow-paper border-2 border-retro-dark overflow-hidden divide-y-2 divide-retro-dark/5">

                        {/* About */}
                        <div className="p-5">
                            <h3 className="text-xs font-black text-retro-dark mb-3 uppercase tracking-wide flex items-center gap-2">
                                <i className="bi bi-info-circle-fill text-retro-blue"></i> About The Project
                            </h3>
                            <div className="space-y-3 text-[11px] font-medium text-retro-secondary leading-relaxed">
                                <p>
                                    This project was conceptualized under the guidance of <span className="font-bold text-retro-dark">Dr. T. N. Chandrika</span>, Department of Electronics and Telecommunication Engineering, Siddaganga Institute of Technology Tumkur. whose vision, mentorship, and academic leadership were instrumental in shaping the development of the system.
                                </p>
                                <div className="bg-retro-cream/30 p-3 rounded-lg border border-retro-dark/5">
                                    <p className="font-bold text-retro-dark mb-1">Developed by Students:</p>
                                    <ul className="space-y-1 pl-1">
                                        <li className="flex items-start gap-2">
                                            <span className="text-retro-blue">•</span>
                                            <span><span className="font-bold">Harsha T. C.</span> — AI & Data Science (1SI24AD064)</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-retro-blue">•</span>
                                            <span><span className="font-bold"></span></span>
                                        </li>
                                    </ul>
                                </div>
                                <p className="opacity-80">
                                    The project reflects a strong collaboration between faculty guidance and student innovation, aiming to deliver a technology-driven solution for academic examination management.
                                </p>
                            </div>
                        </div>

                        {/* Contact */}
                        <div className="p-5 bg-retro-dark/5">
                            <h3 className="text-xs font-black text-retro-dark mb-3 uppercase tracking-wide flex items-center gap-2">
                                <i className="bi bi-headset text-retro-dark"></i> Contact Support
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="flex items-center gap-2 text-[11px] font-bold text-retro-secondary">
                                    <i className="bi bi-envelope text-lg opacity-50"></i>
                                    <span>chandruharsha8@gmail.com</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-bold text-retro-secondary">
                                    <i className="bi bi-phone text-lg opacity-50"></i>
                                    <span>73491 17072</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-bold text-retro-secondary">
                                    <i className="bi bi-geo-alt text-lg opacity-50"></i>
                                    <span>Telecom Dept.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="text-center pt-4 opacity-30 hover:opacity-100 transition-opacity">
                    <p className="text-[9px] font-black uppercase tracking-widest">Exam Allocation System v1.0</p>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleClearDB}
                loading={loading}
            />

            {/* Status Modal (Success/Error) */}
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

export default Settings;
