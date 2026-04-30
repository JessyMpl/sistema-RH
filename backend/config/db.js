// backend/config/db.js
require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// 1. Creamos la piscina de conexiones usando tu URL de Neon
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 2. Le pasamos esa conexión al adaptador oficial
const adapter = new PrismaPg(pool);

// 3. Inicializamos Prisma pasándole explícitamente el adaptador, ¡como lo pide la v7!
const prisma = new PrismaClient({ adapter });

module.exports = prisma;