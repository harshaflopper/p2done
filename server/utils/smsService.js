/**
 * Service to send SMS notifications using Vendel.cc API.
 * Endpoint: POST https://app.vendel.cc/api/sms/send
 * Headers: X-API-Key: vk_..., Content-Type: application/json
 * Payload: { "recipients": ["+917349117072"], "body": "Message text..." }
 */
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const sendNativeHttpRequest = (targetUrl, payloadObj, apiKey) => {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const postData = JSON.stringify(payloadObj);

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            family: 4,
            rejectUnauthorized: false,
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: async () => {
                        try {
                            return JSON.parse(body || '{}');
                        } catch (e) {
                            return { status: 'failure', raw: body };
                        }
                    },
                    text: async () => body
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.write(postData);
        req.end();
    });
};

const sendSMS = async ({ numbers, message }) => {
    require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

    const apiKey = process.env.VENDEL_API_KEY;
    const dryRunEnv = String(process.env.SMS_DRY_RUN).toLowerCase().trim();

    const isDryRun = dryRunEnv === 'true';

    // Helper to format mobile number with E.164 country code '+91'
    const formatNumber = (num) => {
        const clean = String(num).replace(/[^0-9]/g, '').slice(-10);
        if (clean.length === 10) return `+91${clean}`;
        return clean;
    };

    const targetList = Array.isArray(numbers)
        ? numbers.map(formatNumber).filter(n => n.length === 13)
        : [formatNumber(numbers)].filter(n => n.length === 13);

    if (targetList.length === 0) {
        return {
            success: false,
            error: 'No valid 10-digit mobile number provided.'
        };
    }

    if (isDryRun) {
        console.log(`\n=================== [VENDEL.CC SMS DRY RUN] ===================`);
        console.log(`Recipients : ${JSON.stringify(targetList)}`);
        console.log(`Message    : ${message}`);
        console.log(`================================================================\n`);
        return {
            success: true,
            dryRun: true,
            provider: 'vendel',
            message: `[DRY RUN] Vendel.cc SMS to ${targetList.join(', ')} logged to console successfully.`
        };
    }

    try {
        console.log(`[VENDEL DISPATCH] Sending POST to https://app.vendel.cc/api/sms/send for ${targetList.join(', ')}...`);

        const payloadObj = {
            recipients: targetList,
            body: message
        };

        const endpoints = [
            'https://app.vendel.cc/api/sms/send',
            'https://vendel.cc/api/v1/sms/send',
            'http://app.vendel.cc/api/sms/send'
        ];

        let lastErr = null;
        let resData = null;
        let successfulUrl = null;

        for (const url of endpoints) {
            try {
                console.log(`[VENDEL DISPATCH] Attempting request to ${url}...`);

                let rawRes = null;
                try {
                    rawRes = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'application/json, text/plain, */*',
                            'Content-Type': 'application/json',
                            'X-API-Key': apiKey,
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(payloadObj),
                        signal: AbortSignal.timeout(7000)
                    });
                } catch (fetchErr) {
                    console.log(`[VENDEL DISPATCH] Fetch POST to ${url} failed (${fetchErr.message}). Retrying via native HTTP/HTTPS...`);
                    rawRes = await sendNativeHttpRequest(url, payloadObj, apiKey);
                }

                if (rawRes) {
                    const rawText = await rawRes.text();
                    console.log(`[VENDEL API RESPONSE (${url})]:`, rawText.substring(0, 300));

                    try {
                        const parsed = JSON.parse(rawText);
                        if (parsed && typeof parsed === 'object') {
                            resData = parsed;
                            successfulUrl = url;
                            break;
                        }
                    } catch (parseErr) {
                        console.log(`[VENDEL DISPATCH] Non-JSON response from ${url}.`);
                    }
                }
            } catch (err) {
                console.log(`[VENDEL DISPATCH] Endpoint ${url} failed: ${err.message}`);
                lastErr = err;
            }
        }

        if (!resData) {
            return {
                success: false,
                provider: 'vendel',
                error: lastErr ? lastErr.message : 'Vendel.cc API endpoints returned invalid response. Please verify VENDEL_API_KEY in server/.env.'
            };
        }

        const isSuccess = resData.success === true || resData.status === 'accepted' || resData.status === 'queued' || resData.status === 'success' || resData.status === 'sent' || !!resData.id || !!resData.message_id || (Array.isArray(resData.message_ids) && resData.message_ids.length > 0);
        const msgId = resData.id || resData.message_id || (Array.isArray(resData.message_ids) ? resData.message_ids[0] : (Array.isArray(resData.ids) ? resData.ids[0] : null));
        const errorMsg = !isSuccess ? (resData.message || resData.error || `Vendel.cc dispatch status: ${resData.status || 'failed'}`) : null;

        return {
            success: isSuccess,
            provider: 'vendel',
            endpoint: successfulUrl,
            msgId: msgId,
            data: resData,
            message: isSuccess ? `SMS sent successfully via Vendel.cc (ID: ${msgId || 'Queued'})` : null,
            error: errorMsg
        };

    } catch (error) {
        console.error('Vendel Dispatch Error:', error.message);
        return {
            success: false,
            provider: 'vendel',
            error: error.message
        };
    }
};

module.exports = { sendSMS };
