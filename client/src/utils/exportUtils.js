import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { LOGO_BASE64 } from './logoBase64.js';

// Helper to format date
const formatDate = (dateStr) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString(undefined, options);
};

// Watermark HTML - using table for better Word compatibility
const getWatermark = () => `
    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -10; pointer-events: none; overflow: hidden; display: flex; align-items: center; justify-content: center;">
         <img src="${LOGO_BASE64}" style="width: 500px; opacity: 0.02; transform: rotate(-15deg);" alt="Watermark" />
    </div>
`;

// Helper to add watermark to PDF
const addWatermarkToPDF = (doc) => {
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        try {
            // Save graphics state
            if (doc.saveGraphicsState) doc.saveGraphicsState();

            // Set transparency
            if (doc.setGState) {
                // Determine if GState is available on doc or API
                const GState = doc.GState || (jsPDF.API && jsPDF.API.GState);
                if (GState) {
                    doc.setGState(new GState({ opacity: 0.02 }));
                }
            }

            const imgWidth = 120;
            const imgHeight = 120;
            const x = (doc.internal.pageSize.getWidth() - imgWidth) / 2;
            const y = (doc.internal.pageSize.getHeight() - imgHeight) / 2;

            doc.addImage(LOGO_BASE64, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST', 0);

            // Restore graphics state (resets opacity)
            if (doc.restoreGraphicsState) doc.restoreGraphicsState();

        } catch (e) {
            console.warn("Watermark error:", e);
        }
    }
};

export const generateDeputyReport = (allocations, config) => {
    let docContent = '';
    const dates = Object.keys(allocations).sort();

    dates.forEach(date => {
        ['morning', 'afternoon'].forEach(session => {
            const deputies = allocations[date]?.[session]?.deputies || [];
            const invigilators = allocations[date]?.[session]?.invigilators || [];

            if (deputies.length === 0 && invigilators.length === 0) return;

            const sessionLabel = session === 'morning' ? 'MORNING' : 'AFTERNOON';
            const sessionCode = session === 'morning' ? 'AM' : 'PM';
            const roomCount = config[date]?.[session]?.rooms || 0;
            const relieverCount = config[date]?.[session]?.relievers || 0;
            const totalInvigilators = invigilators.length;

            docContent += `
                <div style="position: relative; overflow: hidden; padding: 20px;">
                    <!-- Watermark Container -->
                    ${getWatermark()}
                    
                    <!-- Content Container -->
                    <div style="position: relative; z-index: 10;">
                        <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 20px;">SIDDAGANGA INSTITUTE OF TECHNOLOGY, TUMAKURU - 572103</div>
                        <div style="margin-bottom: 15px;">
                            <span style="display: inline-block; margin-right: 30px;"><strong>Date of Exam:</strong> ${formatDate(date)} ${sessionCode}</span>
                            <span style="display: inline-block; margin-right: 30px;"><strong>Number of Rooms:</strong> ${roomCount}</span>
                            <span style="display: inline-block; margin-right: 30px;"><strong>Reliever:</strong> ${relieverCount}</span>
                            <span style="display: inline-block; margin-right: 30px;"><strong>Total Invigilators:</strong> ${totalInvigilators}</span>
                        </div>
                        <div style="font-weight: bold; font-size: 14px; margin: 20px 0 10px 0; text-align: center;">${sessionLabel} SESSION</div>
                        
                        <div style="font-weight: bold; margin: 15px 0 5px 0;">List of Deputy Superintendents</div>
                        <table style="border-collapse: collapse; width: 100%; margin-bottom: 15px;">
                            <tr>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Sl No</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Name</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Designation</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Initials</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Contact No</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Dept</th>
                            </tr>
                            ${deputies.length > 0 ? deputies.map((dep, idx) => `
                                <tr>
                                    <td style="border: 1px solid #000; padding: 5px;">${idx + 1}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.name}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.designation}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.initials}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.phone || dep.contact || dep.mobile || ''}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.department || dep.dept || ''}</td>
                                </tr>
                            `).join('') : `<tr><td colspan="6" style="border: 1px solid #000; padding: 5px; text-align: center;">No Deputy Superintendents allocated</td></tr>`}
                        </table>

                        <div style="font-weight: bold; margin: 15px 0 5px 0;">List of Invigilators</div>
                        <table style="border-collapse: collapse; width: 100%; margin-bottom: 15px;">
                            <tr>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Sl No</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Name</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Designation</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Initials</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Contact No</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Dept</th>
                                <th style="border: 1px solid #000; padding: 5px; text-align: left;">Alloted Room / Relieving ( R )</th>
                            </tr>
                            ${invigilators.length > 0 ? invigilators.map((inv, idx) => `
                                <tr>
                                    <td style="border: 1px solid #000; padding: 5px;">${idx + 1}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.name}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.designation}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.initials}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.phone || inv.contact || inv.mobile || ''}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.department || inv.dept || ''}</td>
                                    <td style="border: 1px solid #000; padding: 5px;"></td>
                                </tr>
                            `).join('') : `<tr><td colspan="7" style="border: 1px solid #000; padding: 5px; text-align: center;">No Invigilators allocated</td></tr>`}
                        </table>
                    </div>
                </div>
                <br style="page-break-after: always;" />
            `;
        });
    });

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Exam Allotment Report</title>
             <style>
                body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
            </style>
        </head>
        <body>
            ${docContent}
        </body>
        </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    saveAs(blob, `SIT_Exam_Allotment_${new Date().toISOString().split('T')[0]}.doc`);
};

export const generateRoomReport = (sessionData, customFilename) => {
    let docContent = '';

    Object.keys(sessionData).forEach(date => {
        Object.keys(sessionData[date]).forEach(session => {
            const sessionInfo = sessionData[date][session];
            if (!sessionInfo.invigilators || sessionInfo.invigilators.length === 0) return;

            const sessionLabel = session === 'morning' ? 'MORNING' : 'AFTERNOON';

            docContent += `
                <div style="position: relative; overflow: hidden; padding: 20px;">
                    ${getWatermark()}
                    <div style="position: relative; z-index: 10;">
                        <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 20px;">SIDDAGANGA INSTITUTE OF TECHNOLOGY, TUMAKURU - 572103</div>
                        <div style="margin-bottom: 15px;">
                            <strong>Date:</strong> ${date} (${sessionLabel})
                        </div>

                        ${sessionInfo.deputies && sessionInfo.deputies.length > 0 ? `
                        <div style="font-weight: bold; margin: 15px 0 5px 0;">Deputy Superintendents</div>
                        <table style="border-collapse: collapse; width: 100%; margin-bottom: 15px;">
                            <tr>
                                <th style="border: 1px solid #000; padding: 5px;">Sl No</th>
                                <th style="border: 1px solid #000; padding: 5px;">Name</th>
                                <th style="border: 1px solid #000; padding: 5px;">Initials</th>
                                <th style="border: 1px solid #000; padding: 5px;">Mobile</th>
                                <th style="border: 1px solid #000; padding: 5px;">Dept</th>
                                <th style="border: 1px solid #000; padding: 5px;">Room</th>
                            </tr>
                            ${sessionInfo.deputies.map((dep, idx) => `
                                <tr>
                                    <td style="border: 1px solid #000; padding: 5px;">${idx + 1}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.name}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.initials || '-'}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.contact || '-'}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${dep.department || dep.dept || ''}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">-</td>
                                </tr>
                            `).join('')}
                        </table>
                        ` : ''}
                        
                        <div style="font-weight: bold; margin: 15px 0 5px 0;">Invigilators</div>
                        <table style="border-collapse: collapse; width: 100%; margin-bottom: 15px;">
                            <tr>
                                <th style="border: 1px solid #000; padding: 5px;">Sl No</th>
                                <th style="border: 1px solid #000; padding: 5px;">Name</th>
                                <th style="border: 1px solid #000; padding: 5px;">Initials</th>
                                <th style="border: 1px solid #000; padding: 5px;">Mobile</th>
                                <th style="border: 1px solid #000; padding: 5px;">Dept</th>
                                <th style="border: 1px solid #000; padding: 5px;">Room</th>
                            </tr>
                            ${sessionInfo.invigilators.map((inv) => `
                                <tr>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.slNo}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.name}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.initials || '-'}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.contact || '-'}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.dept}</td>
                                    <td style="border: 1px solid #000; padding: 5px;">${inv.room}</td>
                                </tr>
                            `).join('')}
                        </table>
                    </div>
                </div>
                <br style="page-break-after: always;" />
             `;
        });
    });

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Room Allotment</title>
            <style>body { font-family: Arial, sans-serif; }</style>
        </head>
        <body>${docContent}</body>
        </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const filename = customFilename || `Room_Allotment_Report_${new Date().toISOString().split('T')[0]}.doc`;
    saveAs(blob, filename);
};

export const generateDepartmentReport = (sessionData, targetDept = null) => {
    // 1. Extract all unique dates and sessions
    const dates = Object.keys(sessionData).sort();
    if (dates.length === 0) return;

    // Create a mapping of Date -> Sessions for report headers
    const dateHeaders = [];
    dates.forEach(date => {
        ['morning', 'afternoon'].forEach(session => {
            if (sessionData[date][session]) {
                dateHeaders.push({ date, session, label: `${date.split(',')[0]} (${session === 'morning' ? 'AM' : 'PM'})` });
            }
        });
    });

    // 2. Aggregate data by Department -> Faculty
    const deptData = {};

    dates.forEach(date => {
        ['morning', 'afternoon'].forEach(session => {
            const sessionInfo = sessionData[date]?.[session];
            if (!sessionInfo) return;

            // Helper to process people
            const processPerson = (person, role) => {
                if (!person.name || person.name.startsWith('Test Faculty')) return;

                const dept = person.department || person.dept || 'Unknown';
                if (!deptData[dept]) deptData[dept] = {};

                // Use Name + Initials as unique key
                const cleanName = person.name.trim();
                const cleanInitials = (person.initials || '').trim();
                const key = `${cleanName}_${cleanInitials}`;

                if (!deptData[dept][key]) {
                    deptData[dept][key] = {
                        name: cleanName,
                        initials: cleanInitials,
                        designation: person.designation || '',
                        isDeputy: role === 'Deputy',
                        duties: {}
                    };
                } else if (role === 'Deputy') {
                    deptData[dept][key].isDeputy = true;
                }

                // Record duty
                const duty = person.room || (role === 'Deputy' ? 'Deputy' : 'Invigilator');
                deptData[dept][key].duties[`${date}_${session}`] = duty;
            };

            if (sessionInfo.deputies) sessionInfo.deputies.forEach(p => processPerson(p, 'Deputy'));
            if (sessionInfo.invigilators) sessionInfo.invigilators.forEach(p => processPerson(p, 'Invigilator'));
        });
    });

    // 3. Generate HTML
    let docContent = '';

    const allDepts = Object.keys(deptData).sort();
    let departmentsToExport = allDepts;
    if (targetDept) {
        const normalizedTarget = targetDept.toLowerCase().replace(/[^a-z0-9]/g, '');
        const match = allDepts.find(d => {
            const normD = d.toLowerCase().replace(/[^a-z0-9]/g, '');
            return normD.includes(normalizedTarget) || normalizedTarget.includes(normD);
        });
        if (match) {
            departmentsToExport = [match];
        } else {
            const partialMatch = allDepts.find(d => d.toLowerCase().includes(targetDept.toLowerCase().split(' ')[0]));
            departmentsToExport = partialMatch ? [partialMatch] : [targetDept];
        }
    }

    departmentsToExport.forEach((dept, index) => {
        if (!deptData[dept]) return;

        const fullFacultyList = Object.values(deptData[dept]);
        const deputyList = fullFacultyList.filter(f => f.isDeputy).sort((a, b) => a.name.localeCompare(b.name));
        const invigilatorList = fullFacultyList.filter(f => !f.isDeputy).sort((a, b) => a.name.localeCompare(b.name));

        const renderTable = (list, title) => {
            if (list.length === 0) return '';
            return `
                ${title ? `<div style="font-weight: bold; font-size: 14px; margin-top: 15px; margin-bottom: 10px;">${title}</div>` : ''}
                <table style="border-collapse: collapse; width: 100%; font-size: 10px; margin-bottom: 20px;">
                    <thead>
                        <tr>
                            <th style="border: 1px solid #000; padding: 4px;">Sl. No.</th>
                            <th style="border: 1px solid #000; padding: 4px;">Name of the Faculty</th>
                            <th style="border: 1px solid #000; padding: 4px;">Initials</th>
                            <th style="border: 1px solid #000; padding: 4px;">Designation</th>
                            <th style="border: 1px solid #000; padding: 4px;">Allocated Dates</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.map((fac, idx) => {
                const dutyStrings = [];
                dates.forEach(date => {
                    ['morning', 'afternoon'].forEach(session => {
                        const key = `${date}_${session}`;
                        if (fac.duties[key]) {
                            const sessionLabel = session === 'morning' ? 'AM' : 'PM';
                            let shortDate = date;
                            try {
                                const d = new Date(date);
                                if (!isNaN(d.getTime())) {
                                    const day = String(d.getDate()).padStart(2, '0');
                                    const month = String(d.getMonth() + 1).padStart(2, '0');
                                    const year = d.getFullYear();
                                    shortDate = `${day}-${month}-${year}`;
                                }
                            } catch (e) { /* ignore */ }

                            dutyStrings.push(`${shortDate} (${sessionLabel})`);
                        }
                    });
                });
                const dutyContent = dutyStrings.length > 0 ? dutyStrings.join(' <b>,</b> ') : '-';
                return `
                                <tr>
                                    <td style="border: 1px solid #000; padding: 4px; text-align: center;">${idx + 1}</td>
                                    <td style="border: 1px solid #000; padding: 4px;">${fac.name}</td>
                                    <td style="border: 1px solid #000; padding: 4px;">${fac.initials}</td>
                                    <td style="border: 1px solid #000; padding: 4px;">${fac.designation}</td>
                                    <td style="border: 1px solid #000; padding: 4px;">${dutyContent}</td>
                                </tr>
                            `;
            }).join('')}
                    </tbody>
                </table>
            `;
        };

        const pageBreak = index > 0 ? '<br style="page-break-before: always; mso-break-type: section-break;" />' : '';

        docContent += `
            ${pageBreak}
            <div style="padding: 20px; font-family: Arial, sans-serif; position: relative; overflow: hidden;">
                ${getWatermark()}
                <div style="position: relative; z-index: 10;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="font-weight: bold; font-size: 16px;">SIDDAGANGA INSTITUTE OF TECHNOLOGY, TUMAKURU - 572103</div>
                        <div style="font-weight: bold; font-size: 14px; margin-top: 5px;">ALLOTMENT OF INVIGILATION DUTY FOR SEMESTER EXAMINATIONS</div>
                        <div style="font-weight: bold; font-size: 14px; margin-top: 5px; text-decoration: underline;">${dept.toUpperCase()} - EXAM ALLOTMENT</div>
                    </div>

                    <div style="font-size: 11px; margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">General Instructions :</div>
                        <ol style="margin: 0; padding-left: 20px;">
                            <li style="margin-bottom: 3px;">Deputy chief Supdts are requested to report to duty one hour before the schedule time of the commencement of examinations.</li>
                            <li style="margin-bottom: 3px;">Room Supdts/Relieving Supdts are requested to report to duty HALF an hour before the scheduled time of the start of the examinations.</li>
                            <li style="margin-bottom: 3px;">Request letter for mutual exchange of duty should be sent through Heads of the concerned Depts to the principal.</li>
                            <li style="margin-bottom: 3px;">Mutual exchange is permitted in the same cadre and block transfer of invigilation work is not permitted.</li>
                            <li style="margin-bottom: 3px;">Deputy Supdts/Relieving Supdts are requested to refer to the circular issued by VTU on the DUTIES and RESPONSIBILITIES and follow the same.</li>
                        </ol>
                        <div style="margin-top: 8px; font-style: italic;">Kind cooperation & involvement of every one is solicited for the Smooth conduct of examinations.</div>
                    </div>
                    
                    ${renderTable(deputyList, 'DEPUTY CHIEF SUPERINTENDENTS')}
                    ${renderTable(invigilatorList, 'FACULTY / INVIGILATORS')}
                </div>
            </div>
        `;
    });

    const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="UTF-8">
            <title>Department Allotment Report</title>
            <!--[if gte mso 9]>
            <xml>
            <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            </w:WordDocument>
            </xml>
            <![endif]-->
            <style>
                @page {
                    size: 29.7cm 21cm;
                    mso-page-orientation: landscape;
                    margin: 1cm;
                }
                body { 
                    font-family: Arial, sans-serif; 
                }
            </style>
        </head>
        <body>
            <div>
                ${docContent}
            </div>
        </body>
        </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const filename = targetDept
        ? `${targetDept}_Exam_Allotment_${new Date().toISOString().split('T')[0]}.doc`
        : `Dept_Wise_Allotment_${new Date().toISOString().split('T')[0]}.doc`;
    saveAs(blob, filename);
};

export const generateRoomPDF = (sessionData, customFilename) => {
    try {
        const doc = new jsPDF();

        let isFirstPage = true;

        Object.keys(sessionData).forEach(date => {
            Object.keys(sessionData[date]).forEach(session => {
                const sessionInfo = sessionData[date][session];
                if (!sessionInfo.invigilators || sessionInfo.invigilators.length === 0) return;

                if (!isFirstPage) {
                    doc.addPage();
                }
                isFirstPage = false;

                const sessionLabel = session === 'morning' ? 'MORNING' : 'AFTERNOON';

                // Header Logo (Top-Left)
                doc.addImage(LOGO_BASE64, 'PNG', 4, 3.5, 22, 22);

                // Header Title
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text('SIDDAGANGA INSTITUTE OF TECHNOLOGY, TUMAKURU - 572103', 105, 15, { align: 'center' });

                doc.setFontSize(11);
                doc.setFont('helvetica', 'normal');
                doc.text(`Date: ${date} (${sessionLabel})`, 14, 28);

                let startY = 35;

                // Deputies Table
                if (sessionInfo.deputies && sessionInfo.deputies.length > 0) {
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Deputy Superintendents', 14, startY);
                    startY += 5;

                    const deputyHeaders = [['Sl No', 'Name', 'Initials', 'Mobile', 'Dept', 'Room']];
                    const deputyRows = sessionInfo.deputies.map((dep, idx) => [
                        idx + 1,
                        dep.name,
                        dep.initials || '-',
                        dep.contact || '-',
                        dep.department || dep.dept || '',
                        '-'
                    ]);

                    autoTable(doc, {
                        startY: startY,
                        head: deputyHeaders,
                        body: deputyRows,
                        theme: 'grid',
                        styles: { fontSize: 9, cellPadding: 2.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
                        headStyles: { fillColor: [170, 170, 170], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.3 },
                        bodyStyles: { textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 }
                    });

                    startY = doc.lastAutoTable.finalY + 10;
                }

                // Invigilators Table
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Invigilators', 14, startY);
                startY += 5;

                const invigHeaders = [['Sl No', 'Name', 'Initials', 'Mobile', 'Dept', 'Room']];
                const invigRows = sessionInfo.invigilators.map(inv => [
                    inv.slNo,
                    inv.name,
                    inv.initials || '-',
                    inv.contact || '-',
                    inv.dept,
                    inv.room
                ]);

                autoTable(doc, {
                    startY: startY,
                    head: invigHeaders,
                    body: invigRows,
                    theme: 'grid',
                    styles: { fontSize: 9, cellPadding: 2.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
                    headStyles: { fillColor: [170, 170, 170], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.3 },
                    bodyStyles: { textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 }
                });
            });
        });

        // Add watermark to all pages
        addWatermarkToPDF(doc);

        const filename = customFilename || `Room_Allotment_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);

    } catch (error) {
        console.error("PDF Generation Error:", error);
        alert("Failed to generate PDF. See console for details.");
    }
};

export const generateDepartmentPDF = (sessionData, targetDept = null) => {
    try {
        const dates = Object.keys(sessionData).sort();
        if (dates.length === 0) return;

        const deptData = {};

        dates.forEach(date => {
            ['morning', 'afternoon'].forEach(session => {
                const sessionInfo = sessionData[date]?.[session];
                if (!sessionInfo) return;

                const processPerson = (person, role) => {
                    if (!person.name || person.name.startsWith('Test Faculty')) return;

                    const dept = person.department || person.dept || 'Unknown';
                    if (!deptData[dept]) deptData[dept] = {};

                    const cleanName = person.name.trim();
                    const cleanInitials = (person.initials || '').trim();
                    const key = `${cleanName}_${cleanInitials}`;

                    if (!deptData[dept][key]) {
                        deptData[dept][key] = {
                            name: cleanName,
                            initials: cleanInitials,
                            designation: person.designation || '',
                            isDeputy: role === 'Deputy',
                            duties: {}
                        };
                    } else if (role === 'Deputy') {
                        deptData[dept][key].isDeputy = true;
                    }

                    const duty = person.room || (role === 'Deputy' ? 'Deputy' : 'Invigilator');
                    deptData[dept][key].duties[`${date}_${session}`] = duty;
                };

                if (sessionInfo.deputies) sessionInfo.deputies.forEach(p => processPerson(p, 'Deputy'));
                if (sessionInfo.invigilators) sessionInfo.invigilators.forEach(p => processPerson(p, 'Invigilator'));
            });
        });

        const doc = new jsPDF({ orientation: 'landscape' });
        let isFirstPage = true;

        let departmentsToExport = Object.keys(deptData).sort();
        if (targetDept) {
            const normalizedTarget = targetDept.toLowerCase().replace(/[^a-z0-9]/g, '');
            const match = departmentsToExport.find(d => {
                const normD = d.toLowerCase().replace(/[^a-z0-9]/g, '');
                return normD.includes(normalizedTarget) || normalizedTarget.includes(normD);
            });
            if (match) {
                departmentsToExport = [match];
            } else {
                // If AI hallucinated a department that truly doesn't exist, try to find a partial word match
                const partialMatch = departmentsToExport.find(d => d.toLowerCase().includes(targetDept.toLowerCase().split(' ')[0]));
                departmentsToExport = partialMatch ? [partialMatch] : [targetDept];
            }
        }

        departmentsToExport.forEach((dept) => {
            if (!deptData[dept]) return;

            const fullFacultyList = Object.values(deptData[dept]);
            const deputyList = fullFacultyList.filter(f => f.isDeputy).sort((a, b) => a.name.localeCompare(b.name));
            const invigilatorList = fullFacultyList.filter(f => !f.isDeputy).sort((a, b) => a.name.localeCompare(b.name));

            if (!isFirstPage) {
                doc.addPage();
            }
            isFirstPage = false;

            // Header Logo (Top-Left)
            doc.addImage(LOGO_BASE64, 'PNG', 12, 3.5, 24, 24);

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(15);
            doc.setFont('helvetica', 'bold');
            doc.text('SIDDAGANGA INSTITUTE OF TECHNOLOGY, TUMAKURU - 572103', 148.5, 15, { align: 'center' });

            doc.setFontSize(12);
            doc.text('ALLOTMENT OF INVIGILATION DUTY FOR SEMESTER EXAMINATIONS', 148.5, 23, { align: 'center' });

            doc.setFontSize(12);
            doc.text(`${dept.toUpperCase()} - EXAM ALLOTMENT`, 148.5, 30, { align: 'center' });

            doc.setFontSize(10);
            doc.text('General Instructions :', 14, 40);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);

            const instructions = [
                '1. Deputy chief Supdts are requested to report to duty one hour before the schedule time of the commencement of examinations.',
                '2. Room Supdts/Relieving Supdts are requested to report to duty HALF an hour before the scheduled time of the start of the examinations.',
                '3. Request letter for mutual exchange of duty should be sent through Heads of the concerned Depts to the principal.',
                '4. Mutual exchange is permitted in the same cadre and block transfer of invigilation work is not permitted.',
                '5. Deputy Supdts/Relieving Supdts are requested to refer to the circular issued by VTU on the DUTIES and RESPONSIBILITIES and follow the same.'
            ];

            let instrY = 45;
            instructions.forEach(inst => {
                const splitText = doc.splitTextToSize(inst, 270);
                doc.text(splitText, 14, instrY);
                instrY += (splitText.length * 4);
            });

            doc.setFont('helvetica', 'italic');
            doc.text('Kind cooperation & involvement of every one is solicited for the Smooth conduct of examinations.', 14, instrY + 2);

            let startY = instrY + 10;

            const renderTable = (list, title) => {
                if (list.length === 0) return;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.text(title, 14, startY);
                startY += 5;

                const headers = [['Sl. No.', 'Name of the Faculty', 'Initials', 'Designation', 'Allocated Dates']];
                const rows = list.map((fac, idx) => {
                    const dutyStrings = [];
                    dates.forEach(date => {
                        ['morning', 'afternoon'].forEach(session => {
                            const key = `${date}_${session}`;
                            if (fac.duties[key]) {
                                const sessionLabel = session === 'morning' ? 'AM' : 'PM';
                                let shortDate = date;
                                try {
                                    const d = new Date(date);
                                    if (!isNaN(d.getTime())) {
                                        const day = String(d.getDate()).padStart(2, '0');
                                        const month = String(d.getMonth() + 1).padStart(2, '0');
                                        const year = d.getFullYear();
                                        shortDate = `${day}-${month}-${year}`;
                                    }
                                } catch (e) { /* ignore */ }
                                dutyStrings.push(`${shortDate} (${sessionLabel})`);
                            }
                        });
                    });
                    return [
                        idx + 1,
                        fac.name,
                        fac.initials,
                        fac.designation,
                        dutyStrings.join(' , ')
                    ];
                });

                autoTable(doc, {
                    startY: startY,
                    head: headers,
                    body: rows,
                    theme: 'grid',
                    styles: { fontSize: 9, cellPadding: 2.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
                    headStyles: { fillColor: [170, 170, 170], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.3 },
                    bodyStyles: { textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
                    columnStyles: {
                        0: { cellWidth: 15, halign: 'center' },
                        1: { cellWidth: 50 },
                        2: { cellWidth: 20 },
                        3: { cellWidth: 40 },
                        4: { cellWidth: 'auto' }
                    }
                });

                startY = doc.lastAutoTable.finalY + 10;
            };

            renderTable(deputyList, 'DEPUTY CHIEF SUPERINTENDENTS');
            renderTable(invigilatorList, 'FACULTY / INVIGILATORS');
        });

        // Add watermark to all pages
        addWatermarkToPDF(doc);

        const filename = targetDept
            ? `${targetDept}_Exam_Allotment_${new Date().toISOString().split('T')[0]}.pdf`
            : `Dept_Wise_Allotment_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);

    } catch (error) {
        console.error("Dept PDF Generation Error:", error);
        alert("Failed to generate Dept PDF. See console for details.");
    }
};
