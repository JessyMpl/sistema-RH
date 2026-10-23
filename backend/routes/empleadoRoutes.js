const express = require('express');
const router = express.Router();
const prisma = require('../config/db'); 
const multer = require('multer'); 
const xlsx = require('xlsx'); 

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 1. OBTENER CATÁLOGO DE EMPLEADOS Y ÁREAS
// ==========================================
router.get('/areas', async (req, res) => {
  try {
    const areas = await prisma.areaAdscripcion.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
    res.json(areas);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar catálogo de áreas.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const empleados = await prisma.servidorPublico.findMany({
      include: { horario: true, area: true, historial: { orderBy: { fecha: 'desc' } } },
      orderBy: { nombreCompleto: 'asc' }
    });
    const empleadosDisfrazados = empleados.map(emp => ({ ...emp, departamento: emp.area ? emp.area.nombre : null }));
    res.json(empleadosDisfrazados);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar empleados.' });
  }
});

// ==========================================
// 2. ALTA Y EDICIÓN MANUAL
// ==========================================
router.post('/', async (req, res) => {
  const { numeroEmpleado, nombreCompleto, departamento, regimen, horarioId, fechaIngreso } = req.body;
  try {
    let areaAsignadaId = null;
    if (departamento && String(departamento).trim() !== '') {
      const deptoLimpio = String(departamento).trim().toUpperCase();
      const area = await prisma.areaAdscripcion.upsert({ where: { nombre: deptoLimpio }, update: {}, create: { nombre: deptoLimpio } });
      areaAsignadaId = area.id;
    }

    const dataNuevo = {
      numeroEmpleado: String(numeroEmpleado).trim(),
      nombreCompleto: String(nombreCompleto).trim().toUpperCase(),
      areaId: areaAsignadaId,
      regimen: String(regimen).trim(),
      horarioId: parseInt(horarioId),
      activo: true,
      fechaIngreso: fechaIngreso ? new Date(`${String(fechaIngreso).split('T')[0]}T12:00:00Z`) : null
    };

    const nuevo = await prisma.servidorPublico.create({
      data: { ...dataNuevo, historial: { create: [{ tipoMovimiento: "ALTA EN SISTEMA", datoNuevo: departamento || "SIN ÁREA ASIGNADA" }] } },
      include: { area: true }
    });
    res.json({ ...nuevo, departamento: nuevo.area ? nuevo.area.nombre : null });
  } catch (error) {
    res.status(400).json({ error: 'Error al registrar. Verifica que el ID no esté duplicado.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombreCompleto, numeroEmpleado, departamento, regimen, horarioId, activo, fechaBaja, motivoBaja, fechaIngreso } = req.body;
    if (isNaN(id)) return res.status(400).json({ error: 'ID no válido.' });

    const empleadoActual = await prisma.servidorPublico.findUnique({ where: { id }, include: { area: true } });
    if (!empleadoActual) return res.status(404).json({ error: 'Empleado no encontrado' });

    const isActivo = activo === true || activo === 'true' || activo === 1;
    const deptoLimpio = (departamento && String(departamento).trim() !== '') ? String(departamento).trim().toUpperCase() : null;
    const regimenLimpio = String(regimen).trim();

    let nuevaAreaId = empleadoActual.areaId;
    const nombreDeptoActual = empleadoActual.area ? empleadoActual.area.nombre : null;
    
    if (deptoLimpio !== nombreDeptoActual) {
      if (deptoLimpio) {
        const area = await prisma.areaAdscripcion.upsert({ where: { nombre: deptoLimpio }, update: {}, create: { nombre: deptoLimpio } });
        nuevaAreaId = area.id;
      } else {
        nuevaAreaId = null;
      }
    }

    const nuevosMovimientos = [];
    if (deptoLimpio !== nombreDeptoActual) nuevosMovimientos.push({ tipoMovimiento: "CAMBIO DE DEPARTAMENTO", datoAnterior: nombreDeptoActual || "SIN ASIGNAR", datoNuevo: deptoLimpio || "SIN ASIGNAR" });
    if (empleadoActual.regimen !== regimenLimpio) nuevosMovimientos.push({ tipoMovimiento: "CAMBIO DE RÉGIMEN", datoAnterior: String(empleadoActual.regimen), datoNuevo: regimenLimpio });

    let dataAActualizar = {
      nombreCompleto: String(nombreCompleto).trim().toUpperCase(),
      numeroEmpleado: String(numeroEmpleado).trim(),
      areaId: nuevaAreaId,
      regimen: regimenLimpio,
      activo: isActivo,
      horarioId: (horarioId && !isNaN(parseInt(horarioId))) ? parseInt(horarioId) : empleadoActual.horarioId,
      fechaIngreso: (fechaIngreso && String(fechaIngreso).trim() !== '') ? new Date(`${String(fechaIngreso).split('T')[0]}T12:00:00Z`) : null
    };

    if (!isActivo) {
      dataAActualizar.fechaBaja = (fechaBaja && String(fechaBaja).trim() !== '') ? new Date(`${String(fechaBaja).split('T')[0]}T12:00:00Z`) : new Date();
      dataAActualizar.motivoBaja = motivoBaja ? String(motivoBaja).trim() : 'Baja general';
      if (empleadoActual.activo === true) nuevosMovimientos.push({ tipoMovimiento: "BAJA", datoNuevo: dataAActualizar.motivoBaja });
    } else {
      dataAActualizar.fechaBaja = null;
      dataAActualizar.motivoBaja = null;
    }

    if (nuevosMovimientos.length > 0) dataAActualizar.historial = { create: nuevosMovimientos };

    const empleadoActualizado = await prisma.servidorPublico.update({ where: { id: id }, data: dataAActualizar, include: { area: true } });
    res.json({ ...empleadoActualizado, departamento: empleadoActualizado.area ? empleadoActualizado.area.nombre : null });
  } catch (error) {
    res.status(500).json({ error: 'Error interno al actualizar.' });
  }
});

// ==========================================
// 3. RUTA: IMPORTAR PERSONAL (A, B, C, D, E) ANTI-TIMEOUT
// ==========================================
router.post('/sincronizar-plantilla', upload.single('archivoNominal'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo Excel.' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    // header: 1 obliga a leer el Excel como posiciones exactas [0, 1, 2, 3, 4]
    const rawData = xlsx.utils.sheet_to_json(hoja, { header: 1, defval: '' });

    const empleadosProcesados = [];
    const areasSet = new Set();
    const numEmpleadosExcel = [];
    
    // Ignoramos la fila 0 (Títulos) y empezamos en la fila 1
    for (let i = 1; i < rawData.length; i++) {
      const fila = rawData[i];
      const numEmp = String(fila[0] || '').trim().replace(/^0+/, '');          // Columna A: ID
      const nombreCompleto = String(fila[1] || '').trim().toUpperCase();        // Columna B: Nombre
      const areaNombre = String(fila[2] || '').trim().toUpperCase();            // Columna C: Depto
      let regimenFinal = String(fila[3] || '').trim().toUpperCase();            // Columna D: Regimen
      const entradaRaw = String(fila[4] || '').trim();                          // Columna E: Entrada (7 o 9)

      if (!numEmp || !nombreCompleto) continue; 

      if (regimenFinal === 'EXCENTO') regimenFinal = 'EXENTO';
      if (!regimenFinal) regimenFinal = 'NORMAL';

      let horarioIdCalculado = 2; 
      if (regimenFinal === 'LISTA') horarioIdCalculado = 3;
      else if (regimenFinal === 'EXENTO') horarioIdCalculado = 6;
      else if (regimenFinal === 'ESPECIAL') horarioIdCalculado = entradaRaw.includes('7') ? 1 : 4;

      empleadosProcesados.push({ numEmp, areaNombre, nombreCompleto, regimenFinal, horarioIdCalculado });
      if (areaNombre) areasSet.add(areaNombre);
      numEmpleadosExcel.push(numEmp);
    }

    // MAPEO DE ÁREAS SEGURO
    const areasMapeadas = {};
    for (const nombre of areasSet) {
      const areaDB = await prisma.areaAdscripcion.upsert({ where: { nombre }, update: {}, create: { nombre, activo: true } });
      areasMapeadas[nombre] = areaDB.id;
    }

    const empleadosDB = await prisma.servidorPublico.findMany();
    const mapaEmpleadosDB = new Map();
    empleadosDB.forEach(e => mapaEmpleadosDB.set(e.numeroEmpleado, e));

    const toCreate = [];
    const toUpdate = [];

    // CLASIFICAR DATOS RÁPIDO EN MEMORIA
    for (const emp of empleadosProcesados) {
      const areaId = areasMapeadas[emp.areaNombre] || null;
      const existe = mapaEmpleadosDB.get(emp.numEmp);
      
      if (existe) {
         if (existe.regimen !== emp.regimenFinal || existe.areaId !== areaId || existe.nombreCompleto !== emp.nombreCompleto || existe.fechaBaja) {
             const nuevosMovimientos = [];
             if (existe.fechaBaja) nuevosMovimientos.push({ tipoMovimiento: "REINGRESO / REACTIVACIÓN", datoNuevo: "ACTIVO" });
             if (existe.regimen !== emp.regimenFinal) nuevosMovimientos.push({ tipoMovimiento: "CAMBIO DE RÉGIMEN", datoAnterior: existe.regimen, datoNuevo: emp.regimenFinal });

             toUpdate.push({
               id: existe.id,
               data: {
                 nombreCompleto: emp.nombreCompleto,
                 regimen: emp.regimenFinal,
                 areaId: areaId,
                 horarioId: emp.horarioIdCalculado,
                 fechaBaja: null, 
                 activo: true,
                 historial: nuevosMovimientos.length > 0 ? { create: nuevosMovimientos } : undefined
               }
             });
         }
      } else {
         toCreate.push({
           numeroEmpleado: emp.numEmp,
           nombreCompleto: emp.nombreCompleto,
           regimen: emp.regimenFinal,
           areaId: areaId,
           horarioId: emp.horarioIdCalculado,
           activo: true,
           historial: { create: [{ tipoMovimiento: "ALTA POR IMPORTACIÓN", datoNuevo: emp.areaNombre || "SIN ÁREA" }] }
         });
      }
    }

    // PROCESAMIENTO POR LOTES PARA EVITAR EL TIMEOUT (504)
    const chunkSize = 50;
    for (let i = 0; i < toCreate.length; i += chunkSize) {
      const chunk = toCreate.slice(i, i + chunkSize);
      await Promise.all(chunk.map(c => prisma.servidorPublico.create({ data: c })));
    }
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
      const chunk = toUpdate.slice(i, i + chunkSize);
      await Promise.all(chunk.map(u => prisma.servidorPublico.update({ where: { id: u.id }, data: u.data })));
    }

    // BAJAS LÓGICAS (Solo se hace 1 petición instantánea a la base de datos)
    const bajasGeneradas = await prisma.servidorPublico.updateMany({
      where: { activo: true, NOT: { numeroEmpleado: { in: numEmpleadosExcel } } },
      data: { activo: false, fechaBaja: new Date(), motivoBaja: 'Baja por actualización de padrón' }
    });

    res.json({ 
      mensaje: 'Plantilla sincronizada exitosamente.',
      resultados: { altas: toCreate.length, modificaciones: toUpdate.length, bajas: bajasGeneradas.count }
    });

  } catch (error) {
    console.error("Error en sincronización nominal:", error);
    res.status(500).json({ error: 'Hubo un error al procesar el padrón nominal.' });
  }
});

module.exports = router;