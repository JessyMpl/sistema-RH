// backend/index.js
const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors()); 
app.use(express.json()); 

// --- AQUÍ IMPORTAMOS Y USAMOS TUS NUEVAS RUTAS ---
const horariosRoutes = require('./routes/horariosRoutes');
app.use('/api/horarios', horariosRoutes);
// -------------------------------------------------

// Ruta de prueba para saber que el servidor vive
app.get('/api/estado', (req, res) => {
    res.json({ mensaje: "¡El servidor backend está funcionando correctamente!" });
});

// Puerto de conexión
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo sin problemas en el puerto ${PORT}`);
});