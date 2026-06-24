import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

// Custom Formatter for basic markdown (bold and lists)
const FormattedMessage = ({ text }) => {
    const createMarkup = (content) => {
        let formatted = content
            .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-[#111827]">$1</strong>')
            .replace(/\n/g, '<br/>')
            .replace(/- (.*?)(<br\/>|$)/g, '<li class="ml-4 list-disc marker:text-[#9CA3AF]">$1</li>');
        return { __html: formatted };
    };
    return <div className="leading-relaxed tracking-wide" dangerouslySetInnerHTML={createMarkup(text)} />;
};

const MatrixForm = ({ dates, onSubmit }) => {
    const [config, setConfig] = useState({});

    useEffect(() => {
        const initialConfig = {};
        if (dates && Array.isArray(dates)) {
            dates.forEach(d => {
                initialConfig[d] = { morning: { rooms: 0 }, afternoon: { rooms: 0 } };
            });
        }
        setConfig(initialConfig);
    }, [dates]);

    const handleRoomChange = (date, session, val) => {
        setConfig(prev => ({
            ...prev,
            [date]: { ...prev[date], [session]: { rooms: parseInt(val) || 0 } }
        }));
    };

    if (!dates || dates.length === 0) return null;

    return (
        <div className="mt-3 bg-[#FAFAFA] border border-[#E5E7EB] rounded-lg p-3 shadow-inner">
            <h4 className="font-semibold text-[13px] text-[#111827] mb-2 flex items-center gap-1.5">
                <i className="bi bi-grid-3x3-gap"></i> Room Allocation Matrix
            </h4>
            <div className="max-h-[200px] overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-[#E5E7EB] scrollbar-track-transparent">
                {dates.map(d => (
                    <div key={d} className="bg-white p-2 rounded border border-[#E5E7EB] shadow-sm">
                        <div className="text-[12px] font-semibold text-[#111827] mb-1.5 bg-[#F3F4F6] inline-block px-2 py-0.5 rounded-full">{d}</div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-[10px] font-medium text-[#6B7280] block mb-1 uppercase tracking-wider">Morning</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    value={config[d]?.morning?.rooms || 0}
                                    onChange={(e) => handleRoomChange(d, 'morning', e.target.value)}
                                    className="w-full text-[13px] font-medium p-1.5 border border-[#E5E7EB] rounded focus:ring-1 focus:ring-[#111827] focus:border-[#111827] outline-none transition-shadow"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-medium text-[#6B7280] block mb-1 uppercase tracking-wider">Afternoon</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    value={config[d]?.afternoon?.rooms || 0}
                                    onChange={(e) => handleRoomChange(d, 'afternoon', e.target.value)}
                                    className="w-full text-[13px] font-medium p-1.5 border border-[#E5E7EB] rounded focus:ring-1 focus:ring-[#111827] focus:border-[#111827] outline-none transition-shadow"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <button 
                onClick={() => onSubmit(dates, config)}
                className="mt-3 w-full bg-[#111827] text-white text-[12px] font-medium py-2 rounded hover:bg-[#374151] hover:shadow-md transition-all active:scale-[0.98]"
            >
                Start Auto-Allotment
            </button>
        </div>
    );
};

const AIChatOverlay = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [messages, setMessages] = useState(() => {
        const saved = localStorage.getItem('ai_chat_history');
        if (saved) return JSON.parse(saved);
        return [{ role: 'ai', text: 'System initialized. I am **Core AI**. Ready to manage schedules, manipulate the database, and execute administrative workflows.' }];
    });

    const [position, setPosition] = useState({ x: window.innerWidth - 440, y: window.innerHeight - 650 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const chatEndRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        localStorage.setItem('ai_chat_history', JSON.stringify(messages));
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };

    const handleMouseUp = () => setIsDragging(false);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const startListening = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Your browser does not support voice input.');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event) => setInput(event.results[0][0].transcript);
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
    };

    const handleMatrixSubmit = async (dates, config) => {
        setMessages(prev => [...prev, { role: 'user', text: `Submitted room configuration for ${dates.length} dates.` }]);
        setMessages(prev => [...prev, { role: 'ai', text: `Initiating auto-allocation...` }]);
        navigate('/exam-allotment', { state: { aiMacro: { dates, config } } });
        await new Promise(r => setTimeout(r, 800));
    };

    const processAction = async (actionObj) => {
        if (actionObj.action === 'REQUIRE_ROOM_COUNTS') {
            setMessages(prev => [...prev, { role: 'ai', text: actionObj.reply, type: 'MATRIX_FORM', payload: actionObj.payload }]);
            return;
        }

        setMessages(prev => [...prev, { role: 'ai', text: actionObj.reply || 'Command acknowledged. Executing...' }]);

        if (actionObj.action === 'AUTO_WORKFLOW') {
            navigate('/exam-allotment', { state: { aiMacro: actionObj.payload } });
            await new Promise(r => setTimeout(r, 800));
        } else if (actionObj.action === 'DOWNLOAD_PDF') {
            navigate('/room-allotment');
            await new Promise(r => setTimeout(r, 600));
            window.dispatchEvent(new CustomEvent('ai-download-pdf', { detail: actionObj.payload }));
        } else if (actionObj.action === 'NAVIGATE_FILTER') {
            navigate(actionObj.payload.page, { state: { aiFilter: actionObj.payload.filter } });
            await new Promise(r => setTimeout(r, 600));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsLoading(true);

        try {
            const res = await axios.post('/api/chat/agent', { prompt: userMsg });
            const actions = Array.isArray(res.data) ? res.data : [res.data];
            for (const actionObj of actions) {
                await processAction(actionObj);
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'ai', text: '**CRITICAL ERROR:** Connection to Nexus Engine lost.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="font-sans z-[9999]" style={isOpen ? { position: 'fixed', left: position.x, top: position.y } : { position: 'fixed', bottom: 32, right: 32 }}>
            {!isOpen && (
                <button onClick={() => setIsOpen(true)} className="relative w-16 h-16 rounded-full flex items-center justify-center group cursor-pointer shadow-xl hover:shadow-2xl transition-all duration-300 bg-[#FFFFFF] border border-[#E5E7EB]">
                    <div className="relative z-10 flex items-center justify-center">
                        <i className="bi bi-robot text-2xl text-[#111827]"></i>
                    </div>
                    {/* Subtle pulse ring indicating active state */}
                    <div className="absolute -inset-1 border border-[#E5E7EB] rounded-full animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-50"></div>
                </button>
            )}

            {isOpen && (
                <div 
                    className="w-[400px] bg-[#FAFAFA] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.15)] border border-[#E5E7EB] flex flex-col h-[600px] transition-all duration-300"
                    style={{ borderRadius: '16px', overflow: 'hidden' }}
                >
                    <div 
                        onMouseDown={handleMouseDown}
                        className="bg-[#FFFFFF] px-5 py-4 flex justify-between items-center text-[#111827] cursor-move select-none border-b border-[#E5E7EB]"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#FAFAFA] border border-[#E5E7EB] flex items-center justify-center">
                                <i className="bi bi-robot text-[#111827] text-lg"></i>
                            </div>
                            <div>
                                <h3 className="font-semibold tracking-wide text-sm text-[#111827]">Core AI</h3>
                                <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider font-medium flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> System Online
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-center">
                            <button onClick={() => setMessages([{ role: 'ai', text: 'Memory wiped. Awaiting new instructions.' }])} className="text-[#9CA3AF] hover:text-[#111827] transition-colors text-sm flex items-center justify-center w-7 h-7 rounded hover:bg-[#FAFAFA]" title="Clear Chat">
                                <i className="bi bi-trash3"></i>
                            </button>
                            <button onClick={() => setIsOpen(false)} className="text-[#9CA3AF] hover:text-[#111827] transition-colors text-sm flex items-center justify-center w-7 h-7 rounded hover:bg-[#FAFAFA]">
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#FAFAFA] flex flex-col relative scrollbar-thin scrollbar-thumb-[#E5E7EB]">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-[13px] leading-relaxed shadow-sm ${
                                    m.role === 'user' ? 'bg-[#111827] text-[#FFFFFF] rounded-br-sm font-medium' : 'bg-[#FFFFFF] text-[#111827] rounded-bl-sm border border-[#E5E7EB]'
                                }`}>
                                    {m.role === 'ai' ? <FormattedMessage text={m.text} /> : m.text}
                                    {m.type === 'MATRIX_FORM' && m.payload && m.payload.dates && (
                                        <MatrixForm 
                                            dates={m.payload.dates} 
                                            onSubmit={(dates, config) => handleMatrixSubmit(dates, config)} 
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-5 py-4 bg-[#FFFFFF] border border-[#E5E7EB] flex items-center gap-2 shadow-sm">
                                    <div className="flex gap-1">
                                      <div className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                      <div className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                      <div className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                    <span className="text-[11px] font-medium text-[#9CA3AF] ml-1">Processing</span>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Quick Prompts */}
                    <div className="px-5 pb-2 pt-2 flex gap-2 overflow-x-auto scrollbar-none bg-[#FAFAFA]">
                        <button onClick={() => setInput("Who has the most duties?")} className="whitespace-nowrap px-4 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-full text-xs font-medium text-[#374151] hover:text-[#111827] hover:border-[#9CA3AF] transition-all shadow-sm">Duty Stats</button>
                        <button onClick={() => setInput("Schedule tomorrow 10 rooms")} className="whitespace-nowrap px-4 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-full text-xs font-medium text-[#374151] hover:text-[#111827] hover:border-[#9CA3AF] transition-all shadow-sm">Schedule Tomorrow</button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 bg-[#FFFFFF] border-t border-[#E5E7EB] flex items-center gap-3">
                        <button 
                            type="button" 
                            onClick={startListening}
                            className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-300 ${isListening ? 'bg-red-500 text-white shadow-md animate-pulse' : 'bg-[#FAFAFA] text-[#9CA3AF] hover:text-[#111827] border border-[#E5E7EB] shadow-sm'}`}
                        >
                            <i className={isListening ? "bi bi-mic-fill" : "bi bi-mic"}></i>
                        </button>
                        <input 
                            type="text" 
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Enter command..."
                            className="flex-1 bg-[#FAFAFA] text-[#111827] placeholder-[#9CA3AF] px-4 py-2.5 rounded-full border border-[#E5E7EB] focus:ring-1 focus:ring-[#111827] focus:border-[#111827] text-[13px] transition-all shadow-sm outline-none"
                        />
                        <button type="submit" disabled={isLoading || !input.trim()} className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-[#111827] text-[#FFFFFF] rounded-full shadow-sm hover:bg-[#374151] transition-all disabled:opacity-50">
                            <i className="bi bi-send-fill text-xs ml-0.5"></i>
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default AIChatOverlay;
