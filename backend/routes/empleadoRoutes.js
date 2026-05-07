const express = require('express');
const router = express.Router();
const prisma = require('../database'); 
const multer = require('multer'); // Herramienta para recibir archivos
const xlsx = require('xlsx'); // Herramienta para leer Excel
const fs = require('fs');

// Configuración para guardar el Excel temporalmente en la carpeta 'uploads'
const upload = multer({ dest: 'uploads/' });

// 1. Obtener catálogo
router.get('/', async (req, res) => {
  try {
    const empleados = await prisma.servidorPublico.findMany({
      orderBy: { nombreCompleto: 'asc' }
    });
    res.json(empleados);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar empleados.' });
  }
});

// 2. Alta manual (¡Ya actualizado para recibir el horarioId de tu pantalla!)
router.post('/', async (req, res) => {
  const { numeroEmpleado, nombreCompleto, departamento, regimen, horarioId } = req.body;
  
  try {
    const nuevo = await prisma.servidorPublico.create({
      data: { 
        numeroEmpleado: String(numeroEmpleado), 
        nombreCompleto, 
        departamento, 
        regimen, 
        horarioId: parseInt(horarioId) // <-- Ahora guarda el ID real que eliges en Vue
      } 
    });
    res.json(nuevo);
  } catch (error) {
    console.error("Error de Prisma:", error); 
    res.status(400).json({ error: 'Error al registrar. Verifica que el ID no esté duplicado.' });
  }
});

// 3. IMPORTACIÓN MASIVA DESDE EXCEL
router.post('/importar', upload.single('archivoExcel'), async (req, res) => {
  // Si no llega el archivo, mandamos error
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  try {
    // Leemos el archivo temporal que subió Multer
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; // Tomamos la primera hoja del Excel
    const dataExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    //ESTA LINEA ES PARA VER EN LA CONSOLA CÓMO ESTÁ LEYENDO LOS DATOS, ASÍ PUEDES AJUSTAR LOS NOMBRES DE LAS COLUMNAS EN EL CÓDIGo SI ES NECESARIO
   // console.log("Lo que lee de la primera fila:", dataExcel[0]);

    let registrados = 0;

for (const fila of dataExcel) {
      // 1. Leemos los datos en bruto
      const rawNumEmp = fila['ID'] || fila['NumeroEmpleado'] || fila['numeroEmpleado'];
      const rawNombre = fila['NOMBRE'] || fila['Nombre'] || fila['nombreCompleto'] || fila['Name'];
      const rawDepto = fila['DEPARTAMENTO'] || fila['Departamento'] || fila['departamento'];
      const rawRegimen = fila['REGIMEN'] || fila['Regimen'] || fila['regimen'] || 'NORMAL';
      
      if (!rawNumEmp || !rawNombre) continue;

      // 2. Limpiamos los espacios en blanco accidentales (.trim) y convertimos a texto
      const numEmpLimpio = String(rawNumEmp).trim();
      const nombreLimpio = String(rawNombre).trim();
      const deptoLimpio = rawDepto ? String(rawDepto).trim() : null;
      const regimenLimpio = String(rawRegimen).trim().toUpperCase();

      // upsert: Si el empleado existe, lo actualiza. Si no existe, lo crea.
      await prisma.servidorPublico.upsert({
        where: { numeroEmpleado: numEmpLimpio },
        update: {
          nombreCompleto: nombreLimpio,
          departamento: deptoLimpio,
          regimen: regimenLimpio
        },
        create: {
          numeroEmpleado: numEmpLimpio,
          nombreCompleto: nombreLimpio,
          departamento: deptoLimpio,
          regimen: regimenLimpio,
          horarioId: 2 // Por defecto a la carga masiva
        }
      });
      registrados++;
    }

    // Borramos el archivo Excel temporal de la carpeta uploads para no llenar el servidor
    fs.unlinkSync(req.file.path);

    // Respondemos con éxito al frontend
    res.json({ mensaje: `Se procesaron y guardaron ${registrados} servidores públicos exitosamente.` });

  } catch (error) {
    console.error("Error importando Excel:", error);
    res.status(500).json({ error: 'Ocurrió un error al procesar el archivo Excel.' });
  }
});

module.exports = router;