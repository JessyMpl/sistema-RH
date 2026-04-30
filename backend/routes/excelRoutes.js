// backend/routes/excelRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

// Configuramos el "diablito" para que guarde el archivo en la memoria del servidor
const upload = multer({ storage: multer.memoryStorage() });

// Abrimos la ventanilla. Cuando llegue un archivo, multer lo recibe.
router.post('/subir-asistencias', upload.single('archivoExcel'), (req, res) => {
    // Si llega hasta aquí, significa que agarró el archivo sin que se le cayera
    res.json({ mensaje: "¡El recepcionista recibió tu archivo correctamente y está listo para leerlo!" });
});

module.exports = router;