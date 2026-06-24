const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const Faculty = require('../models/Faculty');
const SessionData = require('../models/SessionData');

const tools = [{
    functionDeclarations: [
        {
            name: "extractDatesForScheduling",
            description: "When the user wants to schedule or allot exams, extract the specific dates they mentioned. The UI will then ask them for room counts.",
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    dates: { 
                        type: SchemaType.ARRAY, 
                        items: { type: SchemaType.STRING }, 
                        description: "List of dates in YYYY-MM-DD format." 
                    }
                },
                required: ["dates"]
            }
        },
        {
            name: "modifyFacultyDetails",
            description: "POWERFUL TOOL: Use this to add a new faculty member OR edit ANY details of an existing one (including designation, name, initials, phone, email, department).",
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    operation: { type: SchemaType.STRING, description: "Either 'add' or 'edit'" },
                    targetIdentifier: { type: SchemaType.STRING, description: "The name or initials of the faculty to edit/add (e.g. 'SK', 'John Doe'). Used to find them." },
                    newName: { type: SchemaType.STRING, description: "New name to set (if updating name or adding)" },
                    newInitials: { type: SchemaType.STRING, description: "New initials to set" },
                    designation: { type: SchemaType.STRING, description: "Designation, e.g., Professor, Associate Professor, Assistant Professor" },
                    department: { type: SchemaType.STRING, description: "Department, e.g., CSE, ECE" },
                    phone: { type: SchemaType.STRING, description: "Phone number or contact detail" },
                    email: { type: SchemaType.STRING, description: "Email address" }
                },
                required: ["operation", "targetIdentifier"]
            }
        },
        {
            name: "readFacultyDuties",
            description: "Fetch the allotted exam duties (dates, rooms, sessions) for a specific faculty member using their name or initials.",
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    identifier: { type: SchemaType.STRING, description: "Name or initials of the faculty member (e.g. 'SK', 'John Doe')" }
                },
                required: ["identifier"]
            }
        },
        {
            name: "downloadSessionPdf",
            description: "When the user asks to download a PDF report or allotment for a specific date/session/dept.",
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
                    session: { type: SchemaType.STRING, description: "morning or afternoon" },
                    department: { type: SchemaType.STRING, description: "Department context if mentioned, otherwise empty." }
                },
                required: ["date", "session"]
            }
        },
        {
            name: "standardReply",
            description: "Reply conversationally to the user if no other tool is applicable. Use markdown.",
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    text: { type: SchemaType.STRING, description: "The conversational response." }
                },
                required: ["text"]
            }
        }
    ]
}];

const systemInstruction = `You are Core AI, the advanced autonomous administrator of the Exam Allotment System.
Today's date is ${new Date().toISOString().split('T')[0]}.
Always use one of your tools. 
1. If the user wants to schedule or allot exams but hasn't provided specific dates, use 'standardReply' to ask them which dates (and any holidays to skip) they want to schedule for.
2. If the user mentions scheduling for specific dates, call 'extractDatesForScheduling'.
3. If the user wants to add or update faculty, use 'modifyFacultyDetails'. You have full permission to change their designation, initials, name, or any other field.
4. If they ask for a faculty's assigned duties/rooms, use 'readFacultyDuties'.
5. If they ask to download a PDF, use 'downloadSessionPdf'.
6. Otherwise, use 'standardReply'.
Do not ask follow up questions about room counts; just extract dates and the UI will handle it!`;

let cachedModel = null;
function getModel() {
    if (cachedModel) return cachedModel;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key is not configured in .env');
    const genAI = new GoogleGenerativeAI(apiKey);
    cachedModel = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        tools: tools,
        systemInstruction,
        generationConfig: { temperature: 0.2 }
    });
    return cachedModel;
}

// POST /api/chat/agent
router.post('/agent', async (req, res) => {
    try {
        let { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        if (prompt.length > 500) {
            prompt = prompt.substring(0, 500); // Truncate prompt to prevent abuse/costs
        }

        // FAST-PATH: Direct Initials Lookup (bypass AI to save limits/time)
        const trimmedPrompt = prompt.trim();
        if (trimmedPrompt.length > 0 && trimmedPrompt.length <= 4 && !trimmedPrompt.includes(' ')) {
            const faculty = await Faculty.findOne({
                initials: trimmedPrompt.toUpperCase()
            }).lean();

            if (faculty) {
                if (!faculty.duties || faculty.duties.length === 0) {
                    return res.json({ action: "DATA_QUERY", reply: `**${faculty.name}** currently has no allotted exam duties.` });
                }

                let mdReply = `**Exam Duties for ${faculty.name} (${faculty.initials})**\n\n`;
                faculty.duties.forEach(duty => {
                    mdReply += `- **${duty.date}** | ${duty.session} | Room: **${duty.room}** | Role: ${duty.role}\n`;
                });

                return res.json({ action: "DATA_QUERY", reply: mdReply });
            }
            // If not found, fall through to the AI agent just in case it means something else
        }

        let model;
        try {
            model = getModel();
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }

        const chat = model.startChat();
        let result;
        let attempt = 0;
        let maxRetries = 3;

        while (attempt < maxRetries) {
            try {
                result = await chat.sendMessage(prompt);
                break;
            } catch (apiErr) {
                if (apiErr.message && apiErr.message.includes('503') && attempt < maxRetries - 1) {
                    attempt++;
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.log(`Gemini 503 error, retrying in ${waitTime}ms (Attempt ${attempt})...`);
                    await new Promise(r => setTimeout(r, waitTime));
                } else {
                    console.error("Gemini API Error:", apiErr);
                    let errMsg = apiErr.message;
                    if (errMsg.includes('503')) {
                        errMsg = "The AI service is currently experiencing extremely high demand (503 Service Unavailable). Please try again in a minute.";
                    }
                    return res.json({ action: "DATA_QUERY", reply: "**API Error:** " + errMsg });
                }
            }
        }

        const call = result.response.functionCalls() ? result.response.functionCalls()[0] : null;

        if (call) {
            console.log("Function Call Triggered:", call.name);
            const args = call.args;

            if (call.name === 'extractDatesForScheduling') {
                // UI will handle rendering the matrix
                return res.json({ 
                    action: "REQUIRE_ROOM_COUNTS", 
                    payload: { dates: args.dates }, 
                    reply: "Please specify the room counts for the requested dates below:" 
                });
            }

            if (call.name === 'modifyFacultyDetails') {
                try {
                    const searchStr = args.targetIdentifier.trim();
                    let query = {
                        $or: [
                            { initials: searchStr.toUpperCase() },
                            { name: { $regex: new RegExp('^' + searchStr + '$', 'i') } }
                        ]
                    };
                    let existing = await Faculty.findOne(query);

                    if (args.operation === 'add' || (!existing && args.operation !== 'edit')) {
                        const newFac = new Faculty({
                            name: args.newName || args.targetIdentifier,
                            initials: args.newInitials || args.targetIdentifier.substring(0, 3).toUpperCase(),
                            department: args.department || "Unassigned",
                            designation: args.designation || "Assistant Professor",
                            phone: args.phone || "",
                            email: args.email || ""
                        });
                        await newFac.save();
                        return res.json({ action: "DATA_QUERY", reply: `Successfully added **${newFac.name}** (${newFac.initials})${newFac.department !== 'Unassigned' ? ' to ' + newFac.department : ''}.` });
                    } else if (existing) {
                        let updates = [];
                        if (args.newName) { existing.name = args.newName; updates.push(`name to ${args.newName}`); }
                        if (args.newInitials) { existing.initials = args.newInitials; updates.push(`initials to ${args.newInitials}`); }
                        if (args.department) { existing.department = args.department; updates.push(`department to ${args.department}`); }
                        if (args.designation) { existing.designation = args.designation; updates.push(`designation to ${args.designation}`); }
                        if (args.phone) { existing.phone = args.phone; updates.push(`phone to ${args.phone}`); }
                        if (args.email) { existing.email = args.email; updates.push(`email to ${args.email}`); }
                        
                        if (updates.length > 0) {
                            await existing.save();
                            return res.json({ action: "DATA_QUERY", reply: `Successfully updated **${existing.name}** (${existing.initials}): ${updates.join(', ')}.` });
                        } else {
                            return res.json({ action: "DATA_QUERY", reply: `Found **${existing.name}**, but no fields were provided to update.` });
                        }
                    } else {
                        return res.json({ action: "DATA_QUERY", reply: `Could not find any faculty matching "${searchStr}" to edit.` });
                    }
                } catch (dbErr) {
                    return res.json({ action: "DATA_QUERY", reply: "Database Error: " + dbErr.message });
                }
            }

            if (call.name === 'readFacultyDuties') {
                try {
                    const searchStr = args.identifier.trim();
                    const faculty = await Faculty.findOne({
                        $or: [
                            { initials: searchStr.toUpperCase() },
                            { name: { $regex: new RegExp(searchStr, 'i') } }
                        ]
                    }).lean();

                    if (!faculty) {
                        return res.json({ action: "DATA_QUERY", reply: `I couldn't find any faculty matching "${searchStr}".` });
                    }

                    if (!faculty.duties || faculty.duties.length === 0) {
                        return res.json({ action: "DATA_QUERY", reply: `**${faculty.name}** currently has no allotted exam duties.` });
                    }

                    let mdReply = `**Exam Duties for ${faculty.name} (${faculty.initials})**\n\n`;
                    faculty.duties.forEach(duty => {
                        mdReply += `- **${duty.date}** | ${duty.session} | Room: **${duty.room}** | Role: ${duty.role}\n`;
                    });

                    return res.json({ action: "DATA_QUERY", reply: mdReply });
                } catch (dbErr) {
                    return res.json({ action: "DATA_QUERY", reply: "Database Error: " + dbErr.message });
                }
            }

            if (call.name === 'downloadSessionPdf') {
                return res.json({ 
                    action: "DOWNLOAD_PDF", 
                    payload: { date: args.date, session: args.session, department: args.department }, 
                    reply: `Generating ${args.department || ''} PDF for ${args.date} (${args.session})...` 
                });
            }

            if (call.name === 'standardReply') {
                return res.json({ action: "DATA_QUERY", reply: args.text });
            }
        }

        // If no function call, use standard text
        const text = result.response.text();
        return res.json({ action: "DATA_QUERY", reply: text || "I didn't quite understand that." });

    } catch (err) {
        console.error('Agent error:', err);
        res.status(500).json({ action: "DATA_QUERY", reply: 'Agent failed to process your request.' });
    }
});

module.exports = router;
