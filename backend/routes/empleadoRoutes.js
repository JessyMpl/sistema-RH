const express = require('express');
const router = express.Router();
const prisma = require('../database'); 
const multer = require('multer'); 
const xlsx = require('xlsx'); 
const fs = require('fs');

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

// 2. Alta manual
router.post('/', async (req, res) => {
  const { numeroEmpleado, nombreCompleto, departamento, regimen, horarioId } = req.body;
  try {
    const nuevo = await prisma.servidorPublico.create({
      data: { 
        numeroEmpleado: String(numeroEmpleado), 
        nombreCompleto, 
        departamento, 
        regimen, 
        horarioId: parseInt(horarioId) 
      } 
    });
    res.json(nuevo);
  } catch (error) {
    console.error("Error de Prisma:", error); 
    res.status(400).json({ error: 'Error al registrar. Verifica que el ID no esté duplicado.' });
  }
});

// 3. IMPORTACIÓN MASIVA (CON LOTES PARA SOPORTAR CIENTOS DE REGISTROS)
router.post('/importar', upload.single('archivoExcel'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; 
    const dataExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // A. LIMPIEZA DE DATOS
    const empleadosAProcesar = [];

    for (const fila of dataExcel) {
      const rawNumEmp = fila['ID'] || fila['NumeroEmpleado'] || fila['numeroEmpleado'];
      const rawNombre = fila['NOMBRE'] || fila['Nombre'] || fila['nombreCompleto'] || fila['Name'];
      const rawDepto = fila['DEPARTAMENTO'] || fila['Departamento'] || fila['departamento'];
      const rawRegimen = fila['REGIMEN'] || fila['Regimen'] || fila['regimen'] || 'NORMAL';
      const rawEntrada = fila['ENTRADA'] || fila['Entrada'] || fila['entrada'] || ''; 
      
      if (!rawNumEmp || !rawNombre) continue;

      const numEmpLimpio = String(rawNumEmp).trim();
      const nombreLimpio = String(rawNombre).trim();
      const deptoLimpio = rawDepto ? String(rawDepto).trim() : null;
      const regimenLimpio = String(rawRegimen).trim().toUpperCase();
      const entradaLimpia = String(rawEntrada).trim();

      // B. ASIGNACIÓN DE HORARIOS (Incluyendo tu ID 6 de Exentos)
      let horarioIdCalculado = 2; // NORMAL

      if (regimenLimpio === 'LISTA') {
        horarioIdCalculado = 3;
      } else if (regimenLimpio === 'EXENTO') {
        horarioIdCalculado = 6; 
      } else if (regimenLimpio === 'ESPECIAL') {
        horarioIdCalculado = entradaLimpia.includes('7') ? 1 : 4;
      }

      empleadosAProcesar.push({
        numeroEmpleado: numEmpLimpio,
        nombreCompleto: nombreLimpio,
        departamento: deptoLimpio,
        regimen: regimenLimpio,
        horarioId: horarioIdCalculado
      });
    }

    // C. PROCESAMIENTO EN LOTES (De 50 en 50 para que Neon no sufra)
    const TAMANO_LOTE = 50; 
    let registrados = 0;

    for (let i = 0; i < empleadosAProcesar.length; i += TAMANO_LOTE) {
      const lote = empleadosAProcesar.slice(i, i + TAMANO_LOTE);
      
      const operacionesLote = lote.map(emp => 
        prisma.servidorPublico.upsert({
          where: { numeroEmpleado: emp.numeroEmpleado },
          update: {
            nombreCompleto: emp.nombreCompleto,
            departamento: emp.departamento,
            regimen: emp.regimen,
            horarioId: emp.horarioId
          },
          create: {
            numeroEmpleado: emp.numeroEmpleado,
            nombreCompleto: emp.nombreCompleto,
            departamento: emp.departamento,
            regimen: emp.regimen,
            horarioId: emp.horarioId
          }
        })
      );

      // Enviamos este lote de 50 registros a la BD
      await prisma.$transaction(operacionesLote, { timeout: 30000 });
      registrados += lote.length;
    }

    // D. LIMPIEZA DEL ARCHIVO TEMPORAL
    fs.unlinkSync(req.file.path);

    res.json({ mensaje: `Se procesaron ${registrados} registros exitosamente.` });

  } catch (error) {
    console.error("Error importando Excel:", error);
    res.status(500).json({ error: 'Error al procesar el archivo Excel.' });
  }
});

module.exports = router;