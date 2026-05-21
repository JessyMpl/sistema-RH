const express = require('express');
const router = express.Router();
const prisma = require('../database'); 
const multer = require('multer'); 
const xlsx = require('xlsx'); 

// 💡 SEGURO EN MEMORIA RAM (Para evitar problemas de carpetas y discos)
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 1. OBTENER CATÁLOGO DE EMPLEADOS
// ==========================================
router.get('/', async (req, res) => {
  try {
    const empleados = await prisma.servidorPublico.findMany({
      include: {
        horario: true // Agregamos esto para que el frontend pueda ver los detalles del horario
      },
      orderBy: { nombreCompleto: 'asc' }
    });
    res.json(empleados);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar empleados.' });
  }
});

// ==========================================
// 2. ALTA MANUAL
// ==========================================
router.post('/', async (req, res) => {
  const { numeroEmpleado, nombreCompleto, departamento, regimen, horarioId } = req.body;
  try {
    const nuevo = await prisma.servidorPublico.create({
      data: { 
        numeroEmpleado: String(numeroEmpleado), 
        nombreCompleto, 
        departamento, 
        regimen, 
        horarioId: parseInt(horarioId),
        activo: true // Garantizamos que entre activo
      } 
    });
    res.json(nuevo);
  } catch (error) {
    console.error("Error de Prisma:", error); 
    res.status(400).json({ error: 'Error al registrar. Verifica que el ID no esté duplicado.' });
  }
});

// ==========================================
// 3. EDITAR EMPLEADO (Blindado contra errores de validación)
// ==========================================
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombreCompleto, numeroEmpleado, departamento, regimen, horarioId, activo, fechaBaja, motivoBaja } = req.body;

    // 1. Validar ID
    if (isNaN(id)) return res.status(400).json({ error: 'ID del empleado no válido.' });

    // 2. Forzar el valor booleano estricto (Evita errores de texto "true"/"false")
    const isActivo = activo === true || activo === 'true' || activo === 1;

    // 3. Construir el objeto base con datos limpios
    let dataAActualizar = {
      nombreCompleto: String(nombreCompleto).trim(),
      numeroEmpleado: String(numeroEmpleado).trim(),
      departamento: departamento ? String(departamento).trim() : null,
      regimen: String(regimen).trim(),
      activo: isActivo
    };

    // 4. Conexión segura de la relación Horario (Solo si existe un horarioId válido)
    if (horarioId && !isNaN(parseInt(horarioId))) {
      dataAActualizar.horario = {
        connect: { id: parseInt(horarioId) }
      };
    }

    // 5. Lógica estricta para Bajas
    if (!isActivo) {
      // Si mandaron fecha, la limpiamos. Si no, usamos la fecha de hoy por defecto.
      if (fechaBaja && fechaBaja.trim() !== '') {
        // Cortamos en la 'T' por si viene con horas y la forzamos a medianoche UTC
        const fechaLimpia = fechaBaja.split('T')[0];
        dataAActualizar.fechaBaja = new Date(`${fechaLimpia}T12:00:00Z`);
      } else {
        dataAActualizar.fechaBaja = new Date();
      }
      dataAActualizar.motivoBaja = motivoBaja ? String(motivoBaja).trim() : 'Baja general';
      
    } else {
      // Garantizamos que Prisma borre los datos de baja si se reactiva al empleado
      dataAActualizar.fechaBaja = null;
      dataAActualizar.motivoBaja = null;
    }

    // 6. Ejecutar la actualización
    const empleadoActualizado = await prisma.servidorPublico.update({
      where: { id: id },
      data: dataAActualizar
    });

    res.json(empleadoActualizado);

  } catch (error) {
    // Console log detallado para ver exactamente en dónde llora Prisma si vuelve a fallar
    console.error("====== ERROR FATAL EN PUT /EMPLEADOS ======");
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar.', detalle: error.message });
  }
});


// ==========================================
// 4. IMPORTACIÓN MASIVA OPTIMIZADA
// ==========================================
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
      
      const entradaLimpia = String(rawEntrada).trim();
      
      let regimenLimpio = String(rawRegimen).trim().toUpperCase();
      if (regimenLimpio === 'EXCENTO') regimenLimpio = 'EXENTO';

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