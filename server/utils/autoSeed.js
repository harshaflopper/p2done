const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Faculty = require('../models/Faculty');
const Department = require('../models/Department');

const LEGACY_DATA_PATH = 'D:/wrappedwebsite/allotment/static/faculty_json/';

const seedDatabase = async (force = false) => {
    try {
        const facultyCount = await Faculty.countDocuments();
        if (facultyCount >= 100 && !force) {
            console.log(`Database already has ${facultyCount} faculty members. Skipping auto-seed.`);
            return;
        }

        console.log('Database is empty. Starting auto-seed...');

        // Ensure no indexes block us (optional, but good for safety)
        try {
            await Faculty.collection.dropIndexes();
        } catch (e) {
            // Ignore if no indexes exist
        }

        const files = fs.readdirSync(LEGACY_DATA_PATH);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        console.log(`Found ${jsonFiles.length} source files.`);

        let totalImported = 0;

        for (const file of jsonFiles) {
            const filePath = path.join(LEGACY_DATA_PATH, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const facultyList = JSON.parse(fileContent);

            if (facultyList.length === 0) continue;

            // Simplified department extraction
            let deptName = facultyList[0].department;
            if (!deptName) {
                const parts = file.replace('.json', '').split('.');
                deptName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
            }

            // Ensure Department exists
            let department = await Department.findOne({ name: deptName });
            if (!department) {
                department = new Department({ name: deptName });
                await department.save();
            }

            // Map and Insert
            const facultyDocs = facultyList.map(fac => ({
                name: fac.Name || fac.name,
                initials: fac.Initials || fac.initials || 'N/A',
                designation: fac.Designation || fac.designation,
                department: deptName,
                email: fac.Email || fac.email || '',
                phone: fac.Phone || fac.phone || '',
                isActive: fac.isActive !== undefined ? fac.isActive : true
            }));

            if (facultyDocs.length > 0) {
                await Faculty.insertMany(facultyDocs);
                totalImported += facultyDocs.length;
            }
        }

        console.log(`Auto-seed completed. Imported ${totalImported} faculty members.`);

    } catch (error) {
        console.error('Auto-seed failed:', error);
    }
};

module.exports = seedDatabase;
