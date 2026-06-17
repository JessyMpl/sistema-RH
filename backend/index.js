// backend/index.js
const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors()); 
// AQUÍ AGRANDAMOS EL BUZÓN A 50 MEGA BYTES PARA PODER RECIBIR ARCHIVOS EXCEL DE TAMAÑO CONSIDERABLE 
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- AQUÍ IMPORTAMOS Y USAMOS TUS RUTAS ---
const horariosRoutes = require('./routes/horariosRoutes');
app.use('/api/horarios', horariosRoutes);

const excelRoutes = require('./routes/excelRoutes');
app.use('/api/excel', excelRoutes);

const empleadoRoutes = require('./routes/empleadoRoutes');
app.use('/api/empleados', empleadoRoutes);

const justificacionRoutes = require('./routes/justificacionRoutes');
app.use('/api/justificaciones', justificacionRoutes);
// -------------------------------------------------

// 💡 Aproveché para agrupar tus authRoutes aquí arriba con las demás
// (Es mejor práctica cargar todas las rutas antes de encender el servidor)
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// Nuevas rutas de integración con Script (Cron) y App Electron
const attendanceRoutes = require('./routes/attendanceRoutes');
app.use('/api/v1/attendance', attendanceRoutes);
// -------------------------------------------------

// Ruta de prueba
app.get('/api/estado', (req, res) => {
    res.json({ mensaje: "¡El servidor backend está funcionando correctamente!" });
});

// Puerto de conexión
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo sin problemas en el puerto ${PORT}`);
});