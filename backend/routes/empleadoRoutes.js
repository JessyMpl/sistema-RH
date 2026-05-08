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

// 3. IMPORTACIÓN MASIVA DESDE EXCEL
router.post('/importar', upload.single('archivoExcel'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; 
    const dataExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let registrados = 0;

    for (const fila of dataExcel) {
      // 1. Leemos los datos en bruto
      const rawNumEmp = fila['ID'] || fila['NumeroEmpleado'] || fila['numeroEmpleado'];
      const rawNombre = fila['NOMBRE'] || fila['Nombre'] || fila['nombreCompleto'] || fila['Name'];
      const rawDepto = fila['DEPARTAMENTO'] || fila['Departamento'] || fila['departamento'];
      const rawRegimen = fila['REGIMEN'] || fila['Regimen'] || fila['regimen'] || 'NORMAL';
      
      // NUEVO: Buscamos la columna de entrada (para diferenciar a los especiales)
      const rawEntrada = fila['ENTRADA'] || fila['Entrada'] || fila['entrada'] || ''; 
      
      if (!rawNumEmp || !rawNombre) continue;

      // 2. Limpiamos los datos
      const numEmpLimpio = String(rawNumEmp).trim();
      const nombreLimpio = String(rawNombre).trim();
      const deptoLimpio = rawDepto ? String(rawDepto).trim() : null;
      const regimenLimpio = String(rawRegimen).trim().toUpperCase();
      const entradaLimpia = String(rawEntrada).trim();

      // 3. LÓGICA DE HORARIOS DINÁMICOS BASADA EN NEON
      let horarioIdCalculado = 2; // Por defecto: NORMAL (ID 2)

      if (regimenLimpio === 'LISTA') {
        horarioIdCalculado = 3; // ID 3 para Lista de Asistencia
      } else if (regimenLimpio === 'ESPECIAL') {
        // Si en el Excel dice 7, le asignamos el ID 1 (Turno de las 7)
        if (entradaLimpia.includes('7')) {
          horarioIdCalculado = 1; 
        } else {
          // Si no dice 7, le asignamos el ID 4 (Turno de las 9)
          horarioIdCalculado = 4; 
        }
      }

      // 4. upsert: Si el empleado existe, lo actualiza. Si no existe, lo crea.
      await prisma.servidorPublico.upsert({
        where: { numeroEmpleado: numEmpLimpio },
        update: {
          nombreCompleto: nombreLimpio,
          departamento: deptoLimpio,
          regimen: regimenLimpio,
          horarioId: horarioIdCalculado // Corrige a los que tenían mal su ID
        },
        create: {
          numeroEmpleado: numEmpLimpio,
          nombreCompleto: nombreLimpio,
          departamento: deptoLimpio,
          regimen: regimenLimpio,
          horarioId: horarioIdCalculado // Asigna el correcto a los nuevos
        }
      });
      registrados++;
    }

    // Borramos el archivo Excel temporal
    fs.unlinkSync(req.file.path);

    res.json({ mensaje: `Se procesaron y guardaron ${registrados} servidores públicos exitosamente.` });

  } catch (error) {
    console.error("Error importando Excel:", error);
    res.status(500).json({ error: 'Ocurrió un error al procesar el archivo Excel.' });
  }
});

module.exports = router;