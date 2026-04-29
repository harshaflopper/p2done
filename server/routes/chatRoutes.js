const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Faculty = require('../models/Faculty');
const SessionData = require('../models/SessionData');

const queryCache = new Map();
const CACHE_TTL = 1000 * 5; // 5 seconds (just to prevent rapid double-clicks, keep DB fresh)

// POST /api/chat/schedule
router.post('/schedule', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'Gemini API key is not configured in .env' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

        const systemInstruction = `
You are a highly intelligent scheduling assistant for an exam allotment system. 
The user will give you a natural language prompt about scheduling exams for specific dates and specifying room requirements for morning and afternoon sessions.
Today's date is ${new Date().toISOString().split('T')[0]}. Assume the current year is ${new Date().getFullYear()} if not specified.
Extract the dates and the room requirements.
If they say "schedule exams for May 12th and 13th with 10 rooms in the morning and 5 in the afternoon", you should apply those room counts to all dates mentioned.
You MUST respond with a pure JSON object in exactly this format, and nothing else (no markdown blocks, no text before or after):
{
  "dates": ["YYYY-MM-DD", "YYYY-MM-DD"],
  "config": {
    "YYYY-MM-DD": {
      "morning": { "rooms": X },
      "afternoon": { "rooms": Y }
    }
  }
}
If a session (morning or afternoon) is not mentioned or they say to "skip" it, set "rooms": 0.
Make sure all dates mentioned are valid YYYY-MM-DD strings.
`;

        const result = await (async () => {
            let retries = 3;
            while (retries > 0) {
                try {
                    return await model.generateContent(`${systemInstruction}\n\nUser prompt: "${prompt}"`);
                } catch (e) {
                    if (e.status === 503 && retries > 1) {
                        console.log("503 received, retrying in 2 seconds...");
                        await new Promise(r => setTimeout(r, 2000));
                        retries--;
                    } else {
                        throw e;
                    }
                }
            }
        })();
        
        const responseText = result.response.text();
        
        let parsedJSON;
        try {
            const jsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            parsedJSON = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error("Failed to parse Gemini response as JSON:", responseText);
            return res.status(500).json({ error: 'Failed to generate a valid schedule structure from prompt.' });
        }

        res.json(parsedJSON);

    } catch (err) {
        console.error('Chat schedule error:', err);
        res.status(500).json({ error: 'Server error processing chat schedule' });
    }
});

// POST /api/chat/agent
router.post('/agent', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'Gemini API key is not configured' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { temperature: 0.7 }
        });

        const systemInstruction = `
You are a global AI Assistant for an exam allotment app. You act as a highly intelligent System Administrator.
You can perform SINGLE actions or CHAINED actions.
To chain actions, simply return a JSON ARRAY of action objects instead of a single object.

Actions you can take:
1. "AUTO_WORKFLOW": Schedule and Allocate Exams.
   Payload: { "dates": ["YYYY-MM-DD"], "config": { "YYYY-MM-DD": { "morning": { "rooms": X }, "afternoon": { "rooms": Y } } } }
2. "DOWNLOAD_PDF": Download PDFs for room allotment.
   Payload: { "date": "YYYY-MM-DD", "downloadType": "department" (or "room"), "department": "DEPT_NAME" }
3. "NAVIGATE_FILTER": Navigate the user to a page and automatically filter data.
   Payload: { "page": "/faculty", "filter": "DEPT_NAME" }
4. "DATA_QUERY": Provide a highly specific, intelligent, and human-like answer based on the live database context below. 
   - NEVER give robotic or vague answers (e.g., do not say "assigned to a room" or "room number not specified"). 
   - State EXACT room numbers (e.g. "GJCB101"), dates, and sessions naturally. 
   - If the context says "(Room: Unassigned)", explicitly and smartly inform the user: "Dr. [Name] is scheduled for duty in the [Session], but the physical room allocation hasn't been randomized yet."
   - Be highly professional, warm, and precise. Act like a high-level, extremely intelligent executive assistant. You must sound "wow" and "next-level".
   Payload: {} (The conversational answer goes in the "reply" field).
5. "NONE": Just chatting.

Example of a CHAINED response (array):
[
  { "reply": "I am scheduling May 12th.", "action": "AUTO_WORKFLOW", "payload": { "dates": ["2026-05-12"], "config": {"2026-05-12": {"morning": {"rooms": 10}, "afternoon": {"rooms": 5}}} } },
  { "reply": "And downloading the CS PDF.", "action": "DOWNLOAD_PDF", "payload": { "date": "2026-05-12", "downloadType": "department", "department": "COMPUTER SCIENCE AND ENGINEERING" } }
]

Example of a SINGLE response (object):
{ "reply": "Dr. Smith has 2 duties.", "action": "DATA_QUERY", "payload": {} }

CRITICAL INSTRUCTION FOR DEPARTMENTS: 
If the user asks for a department, map their request to one of these EXACT strings:
- "COMPUTER SCIENCE AND ENGINEERING" (for CS, CSE)
- "ECE  ELECTRONICS AND COMMUNICATION ENGINEERING" (for EC, ECE)
- "MECHANICAL ENGINEERING" (for mech)
- "CIVIL ENGINEERING" (for cv)
- "EEE  ELECTRICAL ENGINEERING" (for ee)
- "INFORMATION SCIENCE AND ENGINEERING" (for is, ise)
- "IT ELECTRONICS AND INSTRUMENTATION" (for it)
- "INDUSTRIAL ENGINEERING AND MANAGEMENT" (for iem)
- "TELECOMMUNICATION AND ENGINEERING" (for tc)
- "CHEMICAL ENGINEERING" (for chem)
- "BIO-TECHNOLOGY" (for bt)
- "MCA", "MBA", "PHYSICS", "CHEMISTRY", "MATHEMATICS"

DATABASE CONTEXT (LIVE DATA):
[DB_CONTEXT_PLACEHOLDER]

Assume current year is ${new Date().getFullYear()}. Today is ${new Date().toISOString().split('T')[0]}.
Only return valid JSON (either an object or an array of objects). Do not use markdown.
`;

        // Fetch DB Context
        const faculties = await Faculty.find({}).lean();
        const sessions = await SessionData.find({}).lean();
        
        let dbSummary = "Faculty Count: " + faculties.length + "\\n";
        // To save tokens, only provide high-level stats or a condensed list
        const condensedFaculty = faculties.map(f => {
             const duties = (f.duties || []).map(d => `${d.date} ${d.session} (Room: ${d.room || 'Unassigned'}, Role: ${d.role || 'Any'})`).join(', ');
             return `${f.name} (${f.department}) - Duties: ${duties || 'None'}`;
        }).join('\\n');
        dbSummary += "Faculty Data:\\n" + condensedFaculty;
        
        const finalSystemInstruction = systemInstruction.replace('[DB_CONTEXT_PLACEHOLDER]', dbSummary);

        const cacheKey = prompt.trim().toLowerCase();
        if (queryCache.has(cacheKey)) {
            const cached = queryCache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                return res.json(cached.data);
            } else {
                queryCache.delete(cacheKey);
            }
        }

        const tryGemini = async () => {
            let retries = 2;
            while (retries > 0) {
                try {
                    const result = await model.generateContent(`${finalSystemInstruction}\n\nUser prompt: "${prompt}"`);
                    return result.response.text();
                } catch (e) {
                    if (e.status === 503 && retries > 1) {
                        await new Promise(r => setTimeout(r, 2000));
                        retries--;
                    } else {
                        throw e;
                    }
                }
            }
        };

        const tryGroq = async () => {
            const groqKey = process.env.GROQ_API_KEY;
            if (!groqKey) throw new Error("No GROQ_API_KEY available for fallback.");
            
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${groqKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", "content": finalSystemInstruction },
                        { role: "user", "content": prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                const errData = await response.text();
                throw new Error(`Groq API Error: ${response.status} ${errData}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        };

        let responseText = "";
        try {
            responseText = await tryGemini();
        } catch (e) {
            console.warn("Gemini failed/exhausted (e.g. 429 limit). Falling back to Groq. Reason:", e.message);
            try {
                responseText = await tryGroq();
            } catch (groqErr) {
                console.error("Groq fallback also failed:", groqErr.message);
                throw e; // throw original Gemini error if both fail
            }
        }
        
        let parsedJSON;
        try {
            let jsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            // Force string to start with a bracket
            const firstOpen = Math.max(jsonStr.indexOf('{') > -1 ? jsonStr.indexOf('{') : -1, jsonStr.indexOf('[') > -1 ? jsonStr.indexOf('[') : -1) === -1 ? -1 : Math.min(...[jsonStr.indexOf('{'), jsonStr.indexOf('[')].filter(i => i > -1));
            
            if (firstOpen !== -1) {
                jsonStr = jsonStr.substring(firstOpen);
            }

            // Strip conversational suffix
            const match = jsonStr.match(/(\{|\[)[\s\S]*(\}|\])/);
            if (match) {
                jsonStr = match[0];
            }
            
            // Robust self-healing: if parse fails due to cut-off, keep adding closing braces
            let parseSuccess = false;
            let attempts = 0;
            
            while (!parseSuccess && attempts < 10) {
                try {
                    parsedJSON = JSON.parse(jsonStr);
                    parseSuccess = true;
                } catch (e) {
                    if (jsonStr.startsWith('[')) {
                        jsonStr += ']';
                    } else {
                        jsonStr += '}';
                    }
                    attempts++;
                }
            }
            
            if (!parseSuccess) {
                // Fallback: If the AI just returned plain conversational text without brackets
                parsedJSON = { reply: responseText.trim(), action: "DATA_QUERY" };
            } else {
                queryCache.set(cacheKey, { timestamp: Date.now(), data: parsedJSON });
            }
        } catch (parseError) {
            console.error("Failed to parse agent JSON:", responseText);
            parsedJSON = { reply: responseText.trim(), action: "NONE" };
        }

        res.json(parsedJSON);
    } catch (err) {
        console.error('Agent error:', err);
        res.status(500).json({ error: 'Agent failed to process' });
    }
});

module.exports = router;
