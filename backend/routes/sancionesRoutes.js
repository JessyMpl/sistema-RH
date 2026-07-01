const express = require('express');
const router = express.Router();
const prisma = require('../config/db');

// ==============================================================================
// 1. MOTOR MATEMÁTICO: CALCULAR SANCIONES DEL MES
// ==============================================================================
router.get('/calcular', async (req, res) => {
  try {
    const { mes, anio } = req.query;

    if (!mes || !anio) {
      return res.status(400).json({ error: 'Faltan parámetros de mes y año.' });
    }

    // Aseguramos formato de fecha (el mes llega de 0 a 11 desde el frontend)
    const fechaInicio = new Date(Date.UTC(anio, mes, 1, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(anio, parseInt(mes) + 1, 0, 23, 59, 59));

    // Traemos TODAS las asistencias del mes
    const asistenciasMes = await prisma.asistencia.findMany({
      where: {
        fecha: { gte: fechaInicio, lte: fechaFin }
      },
      include: {
        // 💡 IMPORTANTE: Pedimos el nombre del área desde el catálogo
        servidor: { select: { id: true, numeroEmpleado: true, nombreCompleto: true, area: { select: { nombre: true } } } }
      }
    });

    // Agrupamos por empleado
    const empleadosMap = {};
    
    asistenciasMes.forEach(registro => {
      const s = registro.servidor;
      if (!empleadosMap[s.id]) {
        empleadosMap[s.id] = {
          servidorId: s.id,
          numeroEmpleado: s.numeroEmpleado,
          nombreCompleto: s.nombreCompleto,
          departamento: s.area ? s.area.nombre : 'Sin Área', // 💡 EL DISFRAZ
          totalFaltas: 0,
          totalRetardos: 0,
          totalOmisiones: 0,
          sancionAplicada: [], 
          diasDescuento: 0
        };
      }

      // 💡 BLINDAJE: Limpiamos el texto por si hay espacios invisibles y pasamos a mayúsculas
      const estatus = String(registro.incidencia || '').trim().toUpperCase();
      
      // REGLA: Faltas puras y Omisiones cuentan como INASISTENCIA
      if (estatus === 'FALTA' || estatus === 'OMISION_E' || estatus === 'OMISION_S' || estatus === 'RETARDO_Y_OMISION') {
        empleadosMap[s.id].totalFaltas++;
        
        // Seguimos contando la omisión de forma interna por si se requiere en auditorías
        if (estatus.includes('OMISION')) {
          empleadosMap[s.id].totalOmisiones++;
        }
      } 
      // REGLA: Retardos
      else if (estatus === 'RETARDO' || estatus === 'RETARDO_ESPECIAL') {
        empleadosMap[s.id].totalRetardos++;
      }
    });

    // Filtramos solo a los infractores y aplicamos normatividad
    const infractores = [];
    
    Object.values(empleadosMap).forEach(emp => {
      let diasCastigo = 0;
      let textosSancion = [];

      // REGLAS DE RETARDOS
      if (emp.totalRetardos === 1) textosSancion.push("Llamada de atención verbal (1 retardo)");
      else if (emp.totalRetardos === 2) textosSancion.push("Severa llamada de atención escrita (2 retardos)");
      else if (emp.totalRetardos === 3) textosSancion.push("Amonestación escrita (3 retardos)");
      else if (emp.totalRetardos === 4) { textosSancion.push("Suspensión de 1 día s/goce (4 retardos)"); diasCastigo += 1; }
      else if (emp.totalRetardos === 5) { textosSancion.push("Suspensión de 2 días s/goce (5 retardos)"); diasCastigo += 2; }
      else if (emp.totalRetardos === 6) { textosSancion.push("Suspensión de 3 días s/goce (6 retardos)"); diasCastigo += 3; }
      else if (emp.totalRetardos >= 7) { textosSancion.push("Suspensión de 4 días s/goce (7+ retardos)"); diasCastigo += 4; }

      // REGLAS DE FALTAS (Incluye omisiones de entrada/salida)
      if (emp.totalFaltas === 1) textosSancion.push("Amonestación escrita (1 falta/omisión)");
      else if (emp.totalFaltas === 2) { textosSancion.push("Suspensión de 3 días s/goce (2 faltas/omisiones)"); diasCastigo += 3; }
      else if (emp.totalFaltas === 3) { textosSancion.push("Suspensión de 8 días s/goce (3 faltas/omisiones)"); diasCastigo += 8; }
      else if (emp.totalFaltas > 3) { textosSancion.push("Baja / Ver norma 20301/206-03 (>3 faltas)"); diasCastigo += 8; }

      // Si tiene alguna incidencia, lo agregamos a la lista de sancionados
      if (emp.totalFaltas > 0 || emp.totalRetardos > 0 || emp.totalOmisiones > 0) {
        emp.diasDescuento = diasCastigo;
        emp.sancionTexto = textosSancion.length > 0 ? textosSancion.join(' | ') : 'Sin sanción grave';
        infractores.push(emp);
      }
    });

    infractores.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
    res.json(infractores);

  } catch (error) {
    console.error("Error calculando sanciones:", error);
    res.status(500).json({ error: 'Hubo un error al calcular las sanciones.' });
  }
});

// ==============================================================================
// 2. GUARDAR SANCIÓN Y EMITIR FOLIO OFICIAL
// ==============================================================================
router.post('/guardar', async (req, res) => {
  try {
    const { servidorId, mes, anio, totalRetardos, totalFaltas, totalOmisiones, sancionAplicada, diasDescuento, folioOficio } = req.body;

    const nuevaSancion = await prisma.sancionMensual.create({
      data: {
        servidorId,
        mes: parseInt(mes),
        anio: parseInt(anio),
        totalRetardos,
        totalFaltas,
        totalOmisiones,
        sancionAplicada,
        diasDescuento,
        folioOficio
      }
    });

    res.json({ mensaje: 'Sanción guardada y registrada en el expediente.', sancion: nuevaSancion });
  } catch (error) {
    console.error("Error guardando sanción:", error);
    // Error P2002 de Prisma es por duplicidad de registro único (@@unique)
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe una sanción generada para este servidor público en este mes.' });
    }
    res.status(500).json({ error: 'Hubo un error al guardar la sanción.' });
  }
});

// ==============================================================================
// 3. OBTENER HISTORIAL DE SANCIONES
// ==============================================================================
router.get('/historial', async (req, res) => {
  try {
    const historial = await prisma.sancionMensual.findMany({
      include: {
        // 💡 IMPORTANTE: Pedimos el nombre del área desde el catálogo
        servidor: { select: { numeroEmpleado: true, nombreCompleto: true, area: { select: { nombre: true } } } }
      },
      orderBy: [
        { anio: 'desc' }, 
        { mes: 'desc' }
      ]
    });

    // 💡 EL DISFRAZ: Formateamos el historial para que devuelva la estructura que espera Vue
    const historialFormateado = historial.map(sancion => ({
      ...sancion,
      servidor: {
        numeroEmpleado: sancion.servidor.numeroEmpleado,
        nombreCompleto: sancion.servidor.nombreCompleto,
        departamento: sancion.servidor.area ? sancion.servidor.area.nombre : 'Sin Área'
      }
    }));

    res.json(historialFormateado);
  } catch (error) {
    console.error("Error obteniendo historial:", error);
    res.status(500).json({ error: 'Error al consultar el expediente histórico.' });
  }
});

module.exports = router;