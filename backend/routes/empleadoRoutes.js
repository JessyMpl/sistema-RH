const express = require('express');
const router = express.Router();
const prisma = require('../database'); 
const multer = require('multer'); 
const xlsx = require('xlsx'); 

// 💡 SEGURO EN MEMORIA RAM (Para evitar problemas de carpetas y discos)
const upload = multer({ storage: multer.memoryStorage() });

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

// 3. IMPORTACIÓN MASIVA OPTIMIZADA
router.post('/importar', upload.single('archivoExcel'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; 
    const dataExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const empleadosAProcesar = [];

    // Limpieza y preparación de registros
    for (const fila of dataExcel) {
      const rawNumEmp = fila['ID'] || fila['NumeroEmpleado'] || fila['numeroEmpleado'];
      const rawNombre = fila['NOMBRE'] || fila['Nombre'] || fila['nombreCompleto'] || fila['Name'];
      const rawDepto = fila['DEPARTAMENTO'] || fila['Departamento'] || fila['departamento'];
      const rawRegimen = fila['REGIMEN'] || fila['Regimen'] || fila['regimen'] || 'NORMAL';
      const rawEntrada = fila['ENTRADA'] || fila['Entrada'] || fila['entrada'] || ''; 
      
      if (!rawNumEmp || !rawNombre) continue;

      const numEmpLimpio = String(rawNumEmp).trim();
      const nombreLimpio = String(rawNombre).trim().replace(/'/g, "''");
      const deptoLimpio = rawDepto ? String(rawDepto).trim().replace(/'/g, "''") : null;
      
      // 💡 AQUÍ ESTABA EL ERROR: Declaramos la variable que se nos había perdido
      const entradaLimpia = String(rawEntrada).trim();
      
      let regimenLimpio = String(rawRegimen).trim().toUpperCase();
      if (regimenLimpio === 'EXCENTO') regimenLimpio = 'EXENTO';

      let horarioIdCalculado = 2; // NORMAL

      if (regimenLimpio === 'LISTA') {
        horarioIdCalculado = 3;
      } else if (regimenLimpio === 'EXENTO') {
        horarioIdCalculado = 6; 
      } else if (regimenLimpio === 'ESPECIAL') {
        // Y aquí usamos la variable correctamente
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

    // Procesamiento masivo con SQL (SQL Nivel Dios)
    const TAMANO_LOTE = 1000; 
    let registrados = 0;

    for (let i = 0; i < empleadosAProcesar.length; i += TAMANO_LOTE) {
      const lote = empleadosAProcesar.slice(i, i + TAMANO_LOTE);
      
      const values = lote.map(emp => {
        const deptoValor = emp.departamento ? `'${emp.departamento}'` : 'NULL';
        return `('${emp.numeroEmpleado}', '${emp.nombreCompleto}', ${deptoValor}, '${emp.regimen}', ${emp.horarioId})`;
      }).join(',\n');

      const query = `
        INSERT INTO "ServidorPublico" ("numeroEmpleado", "nombreCompleto", "departamento", "regimen", "horarioId")
        VALUES ${values}
        ON CONFLICT ("numeroEmpleado") DO UPDATE SET
          "nombreCompleto" = EXCLUDED."nombreCompleto",
          "departamento" = EXCLUDED."departamento",
          "regimen" = EXCLUDED."regimen",
          "horarioId" = EXCLUDED."horarioId";
      `;

      await prisma.$executeRawUnsafe(query);
      registrados += lote.length;
    }

    res.json({ mensaje: `Se procesaron ${registrados} registros exitosamente.` });

  } catch (error) {
    console.error("DETALLE DEL ERROR FATAL:", error);
    res.status(500).json({ 
      error: 'Error al procesar el archivo Excel.', 
      detalle: error.message || String(error) 
    });
  }
});

module.exports = router;