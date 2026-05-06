const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx'); // <-- Importamos nuestra nueva herramienta

// Configuramos multer para que guarde el archivo en la memoria temporal (RAM)
const upload = multer({ storage: multer.memoryStorage() });

// Ruta POST para recibir y leer el archivo
router.post('/subir-asistencias', upload.single('archivoExcel'), (req, res) => {
  try {
    // 1. Verificamos que sí haya llegado un archivo
    if (!req.file) {
      return res.status(400).json({ error: 'No se envió ningún archivo.' });
    }

    // 2. Usamos xlsx para leer el archivo desde la memoria (buffer)
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

    // 3. Seleccionamos la primera hoja del Excel
    const nombrePrimeraHoja = workbook.SheetNames[0];
    const hoja = workbook.Sheets[nombrePrimeraHoja];

    // 4. Convertimos esa hoja a un formato JSON que Node.js entienda detectando la fecha correctamente 
   const datosExcel = xlsx.utils.sheet_to_json(hoja, { raw: false });

    // 5. Devolvemos los datos al Frontend (a tu Panel en Vue)
    res.json({
      mensaje: '¡Excel procesado exitosamente!',
      totalRegistros: datosExcel.length, // Le decimos cuántas filas encontró
      datos: datosExcel // Aquí van los datos crudos para verlos en consola
    });

  } catch (error) {
    console.error('Error procesando el Excel:', error);
    res.status(500).json({ error: 'Hubo un error al intentar leer el archivo Excel.' });
  }
});

module.exports = router;