const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Faculty = require('./models/Faculty');
const SessionData = require('./models/SessionData');

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const facultyCount = await Faculty.countDocuments();
        console.log('Faculty Count in DB:', facultyCount);

        const sessionCount = await SessionData.countDocuments();
        console.log('SessionData Count in DB:', sessionCount);

        if (facultyCount > 0) {
            const sample = await Faculty.findOne().lean();
            console.log('Sample Faculty:', JSON.stringify(sample, null, 2));
        } else {
            console.log('DB Faculty collection is 0! Running autoSeed...');
            const seedDatabase = require('./utils/autoSeed');
            await seedDatabase();
            const newCount = await Faculty.countDocuments();
            console.log('New Faculty Count after autoSeed:', newCount);
        }

        mongoose.disconnect();
    } catch (err) {
        console.error('Test error:', err);
    }
}

test();
