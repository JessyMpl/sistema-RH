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
        area: true, // Traemos el catálogo
        historial: { orderBy: { fecha: 'desc' } }
      },
      orderBy: { nombreCompleto: 'asc' }
    });

    // EL DISFRAZ: Mapeamos el area.nombre a 'departamento'
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

    if (departamento && String(departamento).trim() !== '') {
      const deptoLimpio = String(departamento).trim().toUpperCase();
      const area = await prisma.areaAdscripcion.upsert({
        where: { nombre: deptoLimpio },
        update: {}, 
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
      dataNuevo.fechaIngreso = new Date(`${String(fechaIngreso).split('T')[0]}T12:00:00Z`);
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
      include: { area: true }
    });
    
    res.json({ ...nuevo, departamento: nuevo.area ? nuevo.area.nombre : null });
  } catch (error) {
    console.error("Error al registrar:", error); 
    res.status(400).json({ error: 'Error al registrar. Verifica que el ID no esté duplicado.' });
  }
});

// ==========================================
// 3. EDITAR EMPLEADO (Blindado)
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
    
    // Blindaje de nulos
    const deptoLimpio = (departamento && String(departamento).trim() !== '') ? String(departamento).trim().toUpperCase() : null;
    const regimenLimpio = String(regimen).trim();

    let nuevaAreaId = empleadoActual.areaId;

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
        datoAnterior: String(empleadoActual.regimen),
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

    // Usamos el ID escalar directo
    if (horarioId && !isNaN(parseInt(horarioId))) {
      dataAActualizar.horarioId = parseInt(horarioId);
    }

    // Blindaje de Fechas
    if (fechaIngreso && String(fechaIngreso).trim() !== '') {
      dataAActualizar.fechaIngreso = new Date(`${String(fechaIngreso).split('T')[0]}T12:00:00Z`);
    } else {
      dataAActualizar.fechaIngreso = null;
    }

    if (!isActivo) {
      dataAActualizar.fechaBaja = (fechaBaja && String(fechaBaja).trim() !== '') ? new Date(`${String(fechaBaja).split('T')[0]}T12:00:00Z`) : new Date();
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
    res.status(500).json({ 
      error: 'Error interno al actualizar.', 
      detalle: error.message || String(error) 
    });
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

    const nombresAreasSet = new Set();
    dataExcel.forEach(fila => {
      const depto = fila['DEPARTAMENTO'] || fila['Departamento'] || fila['departamento'];
      if (depto) nombresAreasSet.add(String(depto).trim().toUpperCase());
    });

    const areasMap = new Map(); 
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

      let horarioIdCalculado = 2; 
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

// ==========================================
// 5. RUTA: SINCRONIZADOR NOMINAL (ALTAS, MODIFICACIONES Y BAJAS LÓGICAS)
// ==========================================
router.post('/sincronizar-plantilla', upload.single('archivoNominal'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo nominal de Excel.' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(hoja, { header: 1, defval: '' });

    const empleadosProcesados = [];
    const areasSet = new Set();
    
    // 1. EXTRAER Y TRADUCIR DATOS (Asumimos que fila 0 son títulos, empezamos en 1)
    for (let i = 1; i < rawData.length; i++) {
      const fila = rawData[i];
      const numEmp = String(fila[0] || '').trim().replace(/^0+/, ''); // Columna A
      const areaNombre = String(fila[1] || '').trim().toUpperCase();  // Columna B
      const nombreCompleto = String(fila[2] || '').trim().toUpperCase(); // Columna C
      const horarioRaw = String(fila[3] || '').trim().toLowerCase();  // Columna D

      if (!numEmp || !nombreCompleto) continue; 

      let regimenFinal = 'NORMAL';
      let horarioIdCalculado = 2; 

      if (horarioRaw.includes('lista')) { regimenFinal = 'LISTA'; horarioIdCalculado = 3; }
      else if (horarioRaw.includes('especial')) { regimenFinal = 'ESPECIAL'; horarioIdCalculado = 4; }
      else if (horarioRaw.includes('exento')) { regimenFinal = 'EXENTO'; horarioIdCalculado = 6; }

      empleadosProcesados.push({ numEmp, areaNombre, nombreCompleto, regimenFinal, horarioIdCalculado });
      if (areaNombre) areasSet.add(areaNombre);
    }

    // 2. MAPEAR ÁREAS (Crea las áreas nuevas si no existen)
    const areasMapeadas = {};
    for (const nombre of areasSet) {
      let areaDB = await prisma.areaAdscripcion.findFirst({ where: { nombre } });
      if (!areaDB) {
        areaDB = await prisma.areaAdscripcion.create({ data: { nombre, activo: true } });
      }
      areasMapeadas[nombre] = areaDB.id;
    }

    // 3. OBTENER EMPLEADOS ACTUALES PARA COMPARACIÓN RÁPIDA (O(1))
    const empleadosDB = await prisma.servidorPublico.findMany();
    const mapaEmpleadosDB = new Map();
    empleadosDB.forEach(e => mapaEmpleadosDB.set(e.numeroEmpleado, e));

    const numEmpleadosExcel = [];
    let altas = 0;
    let modificaciones = 0;

    // 4. PROCESAR ALTAS Y MODIFICACIONES
    for (const emp of empleadosProcesados) {
      numEmpleadosExcel.push(emp.numEmp);
      const areaId = areasMapeadas[emp.areaNombre] || null;
      const existe = mapaEmpleadosDB.get(emp.numEmp);
      
      if (existe) {
         // Si detecta un cambio en régimen, área, nombre o si estaba de baja y regresó
         if (existe.regimen !== emp.regimenFinal || existe.areaId !== areaId || existe.nombreCompleto !== emp.nombreCompleto || existe.fechaBaja) {
             const nuevosMovimientos = [];
             
             if (existe.fechaBaja) {
                nuevosMovimientos.push({ tipoMovimiento: "REINGRESO / REACTIVACIÓN", datoNuevo: "ACTIVO" });
             }
             if (existe.regimen !== emp.regimenFinal) {
                nuevosMovimientos.push({ tipoMovimiento: "CAMBIO DE RÉGIMEN SINC", datoAnterior: existe.regimen, datoNuevo: emp.regimenFinal });
             }

             await prisma.servidorPublico.update({
               where: { id: existe.id },
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
             modificaciones++;
         }
      } else {
         // Si no existe, ALTA NUEVA
         await prisma.servidorPublico.create({
           data: {
             numeroEmpleado: emp.numEmp,
             nombreCompleto: emp.nombreCompleto,
             regimen: emp.regimenFinal,
             areaId: areaId,
             horarioId: emp.horarioIdCalculado,
             activo: true,
             historial: { create: [{ tipoMovimiento: "ALTA POR SINCRONIZACIÓN", datoNuevo: emp.areaNombre || "SIN ÁREA" }] }
           }
         });
         altas++;
      }
    }

    // 5. BAJAS LÓGICAS (Soft Delete) - Protege el historial
    const bajasGeneradas = await prisma.servidorPublico.updateMany({
      where: {
        activo: true,
        fechaBaja: null,
        NOT: { numeroEmpleado: { in: numEmpleadosExcel } }
      },
      data: {
        activo: false,
        fechaBaja: new Date(),
        motivoBaja: 'Baja automática por sincronización nominal'
      }
    });

    res.json({ 
      mensaje: 'Plantilla sincronizada exitosamente.',
      resultados: { altas, modificaciones, bajas: bajasGeneradas.count }
    });

  } catch (error) {
    console.error("Error en sincronización nominal:", error);
    res.status(500).json({ error: 'Hubo un error al procesar el padrón nominal.' });
  }
});

module.exports = router;