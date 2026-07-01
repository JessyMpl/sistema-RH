const express = require('express');
const router = express.Router();
const prisma = require('../config/db'); 
const multer = require('multer'); 
const xlsx = require('xlsx'); 

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// NUEVO: OBTENER CATÁLOGO DE ÁREAS
// ==========================================
router.get('/areas', async (req, res) => {
  try {
    const areas = await prisma.areaAdscripcion.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    });
    res.json(areas);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar catálogo de áreas.' });
  }
});

// ==========================================
// 1. OBTENER CATÁLOGO DE EMPLEADOS
// ==========================================
router.get('/', async (req, res) => {
  try {
    const empleados = await prisma.servidorPublico.findMany({
      include: {
        horario: true,
        area: true, // 💡 IMPORTANTE: Traemos el catálogo
        historial: { orderBy: { fecha: 'desc' } }
      },
      orderBy: { nombreCompleto: 'asc' }
    });

    // 💡 EL DISFRAZ: Para que el frontend y reportes no truenen, mapeamos el area.nombre a 'departamento'
    const empleadosDisfrazados = empleados.map(emp => ({
      ...emp,
      departamento: emp.area ? emp.area.nombre : null
    }));

    res.json(empleadosDisfrazados);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar empleados.' });
  }
});

// ==========================================
// 2. ALTA MANUAL
// ==========================================
router.post('/', async (req, res) => {
  const { numeroEmpleado, nombreCompleto, departamento, regimen, horarioId, fechaIngreso } = req.body;
  try {
    let areaAsignadaId = null;

    // 💡 Si nos mandan un departamento en texto, lo buscamos en el catálogo o lo creamos
    if (departamento && String(departamento).trim() !== '') {
      const deptoLimpio = String(departamento).trim().toUpperCase();
      const area = await prisma.areaAdscripcion.upsert({
        where: { nombre: deptoLimpio },
        update: {}, // No hace nada si existe
        create: { nombre: deptoLimpio }
      });
      areaAsignadaId = area.id;
    }

    const dataNuevo = {
      numeroEmpleado: String(numeroEmpleado).trim(),
      nombreCompleto: String(nombreCompleto).trim().toUpperCase(),
      areaId: areaAsignadaId,
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
        historial: {
          create: [{
            tipoMovimiento: "ALTA EN SISTEMA",
            datoNuevo: departamento || "SIN ÁREA ASIGNADA"
          }]
        }
      },
      include: { area: true } // Devolvemos con el área poblada
    });
    
    res.json({ ...nuevo, departamento: nuevo.area ? nuevo.area.nombre : null });
  } catch (error) {
    console.error("Error al registrar:", error); 
    res.status(400).json({ error: 'Error al registrar. Verifica que el ID no esté duplicado.' });
  }
});

// ==========================================
// 3. EDITAR EMPLEADO
// ==========================================
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombreCompleto, numeroEmpleado, departamento, regimen, horarioId, activo, fechaBaja, motivoBaja, fechaIngreso } = req.body;

    if (isNaN(id)) return res.status(400).json({ error: 'ID no válido.' });

    const empleadoActual = await prisma.servidorPublico.findUnique({ 
      where: { id },
      include: { area: true }
    });
    if (!empleadoActual) return res.status(404).json({ error: 'Empleado no encontrado' });

    const isActivo = activo === true || activo === 'true' || activo === 1;
    const deptoLimpio = departamento ? String(departamento).trim().toUpperCase() : null;
    const regimenLimpio = String(regimen).trim();

    let nuevaAreaId = empleadoActual.areaId;

    // 💡 Si el departamento cambió, actualizamos el catálogo
    const nombreDeptoActual = empleadoActual.area ? empleadoActual.area.nombre : null;
    if (deptoLimpio !== nombreDeptoActual) {
      if (deptoLimpio) {
        const area = await prisma.areaAdscripcion.upsert({
          where: { nombre: deptoLimpio },
          update: {},
          create: { nombre: deptoLimpio }
        });
        nuevaAreaId = area.id;
      } else {
        nuevaAreaId = null;
      }
    }

    const nuevosMovimientos = [];

    if (deptoLimpio !== nombreDeptoActual) {
      nuevosMovimientos.push({
        tipoMovimiento: "CAMBIO DE DEPARTAMENTO",
        datoAnterior: nombreDeptoActual || "SIN ASIGNAR",
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

    let dataAActualizar = {
      nombreCompleto: String(nombreCompleto).trim().toUpperCase(),
      numeroEmpleado: String(numeroEmpleado).trim(),
      areaId: nuevaAreaId,
      regimen: regimenLimpio,
      activo: isActivo
    };

    if (horarioId && !isNaN(parseInt(horarioId))) {
      dataAActualizar.horario = { connect: { id: parseInt(horarioId) } };
    }

    if (fechaIngreso && fechaIngreso.trim() !== '') {
      dataAActualizar.fechaIngreso = new Date(`${fechaIngreso.split('T')[0]}T12:00:00Z`);
    }

    if (!isActivo) {
      dataAActualizar.fechaBaja = (fechaBaja && fechaBaja.trim() !== '') ? new Date(`${fechaBaja.split('T')[0]}T12:00:00Z`) : new Date();
      dataAActualizar.motivoBaja = motivoBaja ? String(motivoBaja).trim() : 'Baja general';
      if (empleadoActual.activo === true) {
        nuevosMovimientos.push({ tipoMovimiento: "BAJA", datoNuevo: dataAActualizar.motivoBaja });
      }
    } else {
      dataAActualizar.fechaBaja = null;
      dataAActualizar.motivoBaja = null;
    }

    if (nuevosMovimientos.length > 0) {
      dataAActualizar.historial = { create: nuevosMovimientos };
    }

    const empleadoActualizado = await prisma.servidorPublico.update({
      where: { id: id },
      data: dataAActualizar,
      include: { area: true }
    });

    res.json({ ...empleadoActualizado, departamento: empleadoActualizado.area ? empleadoActualizado.area.nombre : null });

  } catch (error) {
    console.error("====== ERROR FATAL EN PUT /EMPLEADOS ======\n", error);
    res.status(500).json({ error: 'Error interno al actualizar.' });
  }
});

// ==========================================
// 4. IMPORTACIÓN MASIVA OPTIMIZADA
// ==========================================
router.post('/importar', upload.single('archivoExcel'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; 
    const dataExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // 1. Extraemos y guardamos todas las áreas únicas del Excel en el catálogo
    const nombresAreasSet = new Set();
    dataExcel.forEach(fila => {
      const depto = fila['DEPARTAMENTO'] || fila['Departamento'] || fila['departamento'];
      if (depto) nombresAreasSet.add(String(depto).trim().toUpperCase());
    });

    const areasMap = new Map(); // Mapa para rápido acceso: 'SISTEMAS' => 3
    for (const nombreArea of nombresAreasSet) {
      const area = await prisma.areaAdscripcion.upsert({
        where: { nombre: nombreArea },
        update: {},
        create: { nombre: nombreArea }
      });
      areasMap.set(nombreArea, area.id);
    }

    const empleadosAProcesar = [];

    for (const fila of dataExcel) {
      const rawNumEmp = fila['ID'] || fila['NumeroEmpleado'] || fila['numeroEmpleado'];
      const rawNombre = fila['NOMBRE'] || fila['Nombre'] || fila['nombreCompleto'] || fila['Name'];
      const rawDepto = fila['DEPARTAMENTO'] || fila['Departamento'] || fila['departamento'];
      const rawRegimen = fila['REGIMEN'] || fila['Regimen'] || fila['regimen'] || 'NORMAL';
      const rawEntrada = fila['ENTRADA'] || fila['Entrada'] || fila['entrada'] || ''; 
      
      if (!rawNumEmp || !rawNombre) continue;

      const numEmpLimpio = String(rawNumEmp).trim();
      const nombreLimpio = String(rawNombre).trim().replace(/'/g, "''").toUpperCase();
      const deptoLimpio = rawDepto ? String(rawDepto).trim().toUpperCase() : null;
      const areaIdAsignada = deptoLimpio ? areasMap.get(deptoLimpio) : 'NULL';
      
      const entradaLimpia = String(rawEntrada).trim();
      let regimenLimpio = String(rawRegimen).trim().toUpperCase();
      if (regimenLimpio === 'EXCENTO') regimenLimpio = 'EXENTO';

      let horarioIdCalculado = 2; // NORMAL
      if (regimenLimpio === 'LISTA') horarioIdCalculado = 3;
      else if (regimenLimpio === 'EXENTO') horarioIdCalculado = 6; 
      else if (regimenLimpio === 'ESPECIAL') horarioIdCalculado = entradaLimpia.includes('7') ? 1 : 4;

      empleadosAProcesar.push({
        numeroEmpleado: numEmpLimpio,
        nombreCompleto: nombreLimpio,
        areaId: areaIdAsignada,
        regimen: regimenLimpio,
        horarioId: horarioIdCalculado
      });
    }

    const TAMANO_LOTE = 1000; 
    let registrados = 0;

    for (let i = 0; i < empleadosAProcesar.length; i += TAMANO_LOTE) {
      const lote = empleadosAProcesar.slice(i, i + TAMANO_LOTE);
      
      const values = lote.map(emp => {
        return `('${emp.numeroEmpleado}', '${emp.nombreCompleto}', ${emp.areaId}, '${emp.regimen}', ${emp.horarioId})`;
      }).join(',\n');

      const query = `
        INSERT INTO "ServidorPublico" ("numeroEmpleado", "nombreCompleto", "areaId", "regimen", "horarioId")
        VALUES ${values}
        ON CONFLICT ("numeroEmpleado") DO UPDATE SET
          "nombreCompleto" = EXCLUDED."nombreCompleto",
          "areaId" = EXCLUDED."areaId",
          "regimen" = EXCLUDED."regimen",
          "horarioId" = EXCLUDED."horarioId";
      `;

      await prisma.$executeRawUnsafe(query);
      registrados += lote.length;
    }

    res.json({ mensaje: `Se procesaron ${registrados} registros exitosamente.` });

  } catch (error) {
    console.error("DETALLE DEL ERROR FATAL:", error);
    res.status(500).json({ error: 'Error al procesar el archivo Excel.', detalle: error.message || String(error) });
  }
});

module.exports = router;