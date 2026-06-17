// Redirecting to the central db module to maintain a single PrismaClient instance
const prisma = require('./config/db');

module.exports = prisma;