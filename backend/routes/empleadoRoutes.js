const express = require('express');
const router = express.Router();
const prisma = require('../config/db'); 
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
        horario: true,
        historial: {
          orderBy: { fecha: 'desc' } // Traemos el historial ordenado por el más reciente
        }
      },
      orderBy: { nombreCompleto: 'asc' }
    });
    res.json(empleados);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar empleados.' });
  }
});

// ==========================================
// 2. ALTA MANUAL (Ahora con fecha de ingreso y bitácora)
// ==========================================
router.post('/', async (req, res) => {
  const { numeroEmpleado, nombreCompleto, departamento, regimen, horarioId, fechaIngreso } = req.body;
  try {
    const dataNuevo = {
      numeroEmpleado: String(numeroEmpleado).trim(),
      nombreCompleto: String(nombreCompleto).trim().toUpperCase(),
      departamento: departamento ? String(departamento).trim() : null,
      regimen: String(regimen).trim(),
      horarioId: parseInt(horarioId),
      activo: true
    };

    if (fechaIngreso) {
      dataNuevo.fechaIngreso = new Date(`${fechaIngreso.split('T')[0]}T12:00:00Z`);
    }

    const nuevo = await prisma.servidorPublico.create({
      data: {
        ...dataNuevo,
        // Registramos su alta oficial en la bitácora automáticamente
        historial: {
          create: [{
            tipoMovimiento: "ALTA EN SISTEMA",
            datoNuevo: dataNuevo.departamento || "SIN ÁREA ASIGNADA"
          }]
        }
      }
    });
    res.json(nuevo);
  } catch (error) {
    console.error("Error al registrar:", error); 
    res.status(400).json({ error: 'Error al registrar. Verifica que el ID no esté duplicado.' });
  }
});

// ==========================================
// 3. EDITAR EMPLEADO (Inteligente: Detecta cambios automáticamente)
// ==========================================
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombreCompleto, numeroEmpleado, departamento, regimen, horarioId, activo, fechaBaja, motivoBaja, fechaIngreso } = req.body;

    if (isNaN(id)) return res.status(400).json({ error: 'ID no válido.' });

    // 1. Traemos al empleado como está AHORITA para poder comparar
    const empleadoActual = await prisma.servidorPublico.findUnique({ where: { id } });
    if (!empleadoActual) return res.status(404).json({ error: 'Empleado no encontrado' });

    const isActivo = activo === true || activo === 'true' || activo === 1;
    const deptoLimpio = departamento ? String(departamento).trim() : null;
    const regimenLimpio = String(regimen).trim();

    // 2. LÓGICA DE DETECCIÓN DE CAMBIOS PARA LA BITÁCORA
    const nuevosMovimientos = [];

    if (empleadoActual.departamento !== deptoLimpio) {
      nuevosMovimientos.push({
        tipoMovimiento: "CAMBIO DE DEPARTAMENTO",
        datoAnterior: empleadoActual.departamento || "SIN ASIGNAR",
        datoNuevo: deptoLimpio || "SIN ASIGNAR"
      });
    }

    if (empleadoActual.regimen !== regimenLimpio) {
      nuevosMovimientos.push({
        tipoMovimiento: "CAMBIO DE RÉGIMEN",
        datoAnterior: empleadoActual.regimen,
        datoNuevo: regimenLimpio
      });
    }

    // 3. Preparamos los datos para actualizar
    let dataAActualizar = {
      nombreCompleto: String(nombreCompleto).trim().toUpperCase(),
      numeroEmpleado: String(numeroEmpleado).trim(),
      departamento: deptoLimpio,
      regimen: regimenLimpio,
      activo: isActivo
    };

    if (horarioId && !isNaN(parseInt(horarioId))) {
      dataAActualizar.horario = { connect: { id: parseInt(horarioId) } };
    }

    if (fechaIngreso && fechaIngreso.trim() !== '') {
      dataAActualizar.fechaIngreso = new Date(`${fechaIngreso.split('T')[0]}T12:00:00Z`);
    }

    // Bajas
    if (!isActivo) {
      dataAActualizar.fechaBaja = (fechaBaja && fechaBaja.trim() !== '') 
        ? new Date(`${fechaBaja.split('T')[0]}T12:00:00Z`) 
        : new Date();
      dataAActualizar.motivoBaja = motivoBaja ? String(motivoBaja).trim() : 'Baja general';
      
      // Si antes estaba activo y ahora es baja, lo registramos
      if (empleadoActual.activo === true) {
        nuevosMovimientos.push({ tipoMovimiento: "BAJA", datoNuevo: dataAActualizar.motivoBaja });
      }
    } else {
      dataAActualizar.fechaBaja = null;
      dataAActualizar.motivoBaja = null;
    }

    // 4. Si hubo movimientos, le decimos a Prisma que los guarde anidados
    if (nuevosMovimientos.length > 0) {
      dataAActualizar.historial = { create: nuevosMovimientos };
    }

    const empleadoActualizado = await prisma.servidorPublico.update({
      where: { id: id },
      data: dataAActualizar
    });

    res.json(empleadoActualizado);

  } catch (error) {
    console.error("====== ERROR FATAL EN PUT /EMPLEADOS ======\n", error);
    res.status(500).json({ error: 'Error interno al actualizar.' });
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
      const nombreLimpio = String(rawNombre).trim().replace(/'/g, "''").toUpperCase();
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