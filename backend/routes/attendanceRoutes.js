const express = require('express');
const router = express.Router();
const prisma = require('../config/db');

// Validar token de autenticación
function isValidToken(token) {
  const secretToken = process.env.RH_API_TOKEN || "tu_token_secreto_aqui";
  return token === secretToken;
}

// Controlador genérico para procesar lotes de registros de asistencia
async function processAttendanceBatch(req, res, expectedSource) {
  try {
    console.log(req.body);
    // 1. Validar autenticación
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token de autenticación requerido' });
    }
    const token = authHeader.substring(7); // Quitar 'Bearer '
    if (!isValidToken(token)) {
      return res.status(401).json({ success: false, message: 'Token de autenticación inválido o expirado' });
    }

    // 2. Validar payload
    const { records, source, syncDate, clockIp, clockName } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'El campo "records" es requerido y debe ser un arreglo no vacío' });
    }

    if (records.length > 100) {
      return res.status(413).json({ success: false, message: 'El lote excede el máximo de 100 registros' });
    }

    if (source !== expectedSource) {
      return res.status(400).json({ success: false, message: `El campo "source" debe ser "${expectedSource}"` });
    }

    if (expectedSource === 'app-manual' && !clockIp) {
      return res.status(400).json({ success: false, message: 'El campo "clockIp" es requerido para cargas manuales' });
    }

    // 3. Filtrar y validar registros uno a uno
    const validData = [];
    let errors = 0;
    const parsedSyncDate = syncDate ? new Date(syncDate) : new Date();

    for (const rec of records) {
      const { employeeId, timestamp, serialNumber, cardNumber } = rec;

// Validar campos obligatorios
      if (!employeeId || !timestamp || !serialNumber) {
        errors++;
        continue;
      }

      // 💡 Regresamos a la normalidad: Node lo leerá como hora local de México
      // y la base de datos lo guardará correctamente en UTC.
      const parsedTimestamp = new Date(timestamp);
      
      if (isNaN(parsedTimestamp.getTime())) {
        errors++;
        continue;
      }

      validData.push({
        employeeId: String(employeeId).trim(),
        timestamp: parsedTimestamp,
        serialNumber: String(serialNumber).trim(),
        cardNumber: cardNumber ? String(cardNumber).trim() : '',
        source: source,
        clockIp: clockIp ? String(clockIp).trim() : '',
        clockName: clockName ? String(clockName).trim() : '',
        syncDate: isNaN(parsedSyncDate.getTime()) ? new Date() : parsedSyncDate
      });
    }

    // Si todos los registros del lote tenían errores, responder con error o estado múltiple
    if (validData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Ninguno de los registros proporcionados es válido.',
        data: {
          received: records.length,
          inserted: 0,
          duplicated: 0,
          errors: errors
        }
      });
    }

    // 4. Inserción masiva en la BD con deduplicación (skipDuplicates utiliza la restricción única uq_attendance_record)
    const result = await prisma.attendanceRecord.createMany({
      data: validData,
      skipDuplicates: true
    });

    const receivedCount = records.length;
    const insertedCount = result.count;
    const duplicatedCount = validData.length - insertedCount;

    const responsePayload = {
      success: errors === 0,
      message: errors === 0 ? 'Lote procesado correctamente' : 'Lote procesado con algunos errores de validación',
      data: {
        received: receivedCount,
        inserted: insertedCount,
        duplicated: duplicatedCount,
        errors: errors
      }
    };

    // Agregar datos específicos en el endpoint de la App Electron si aplica
    if (expectedSource === 'app-manual') {
      responsePayload.data.clockIp = clockIp;
      responsePayload.data.clockName = clockName || '';
    }

    // Retornar 207 Multi-Status si hubo registros válidos insertados pero también errores individuales de formato
    return res.status(errors > 0 ? 207 : 200).json(responsePayload);

  } catch (error) {
    console.error(`Error crítico procesando lote de asistencia (${expectedSource}):`, error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al guardar los registros.',
      error: error.message || String(error)
    });
  }
}

// Endpoint para el script automático (Cron)
router.post('/cron', (req, res) => processAttendanceBatch(req, res, 'hikvision-cron'));

// Endpoint para la app de escritorio (Electron)
router.post('/app', (req, res) => processAttendanceBatch(req, res, 'app-manual'));

// ==============================================================================
// 3. CONSULTAR REGISTROS DE ASISTENCIA CON FILTROS DE AÑO Y SEMANA
// ==============================================================================
router.get('/registros', async (req, res) => {
  try {
    let targetAnio = req.query.anio ? parseInt(req.query.anio) : null;
    let targetSemana = req.query.semana ? parseInt(req.query.semana) : null;

    // Si falta año o semana, intentar obtener la fecha de hoy para calcularlos
    if (!targetAnio || !targetSemana) {
      const hoy = new Date();
      const hoyFecha = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
      const hoyEnCalendario = await prisma.calendario.findUnique({
        where: { fecha: hoyFecha }
      });

      if (hoyEnCalendario) {
        targetAnio = targetAnio || hoyEnCalendario.anio;
        targetSemana = targetSemana || hoyEnCalendario.semana;
      } else {
        // Fallback por si la tabla no está poblada aún
        targetAnio = targetAnio || hoy.getFullYear();
        targetSemana = targetSemana || 1;
      }
    }

    // 1. Obtener la lista de días de la semana y año solicitados en la tabla calendario
    const diasSemana = await prisma.calendario.findMany({
      where: {
        anio: targetAnio,
        semana: targetSemana
      },
      orderBy: { fecha: 'asc' }
    });

    if (diasSemana.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontraron registros de calendario para el año ${targetAnio} y la semana ${targetSemana}. Asegúrate de correr el seed de calendario.`
      });
    }

    // 2. Extraer rango de fechas para la consulta de asistencias
    const fechas = diasSemana.map(d => d.fecha);
    const minFecha = new Date(Math.min(...fechas));
    const maxFecha = new Date(Math.max(...fechas));

    // Ajustar límites de hora para no perder ningún registro del día
    const startDate = new Date(minFecha.setUTCHours(0, 0, 0, 0));
    const endDate = new Date(maxFecha.setUTCHours(23, 59, 59, 999));

    // 3. Obtener los registros de asistencia en dicho rango
    const registros = await prisma.attendanceRecord.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    // 4. Mapear BigInt a string para evitar errores de serialización de JSON en Node
    const registrosFormateados = registros.map(reg => ({
      ...reg,
      id: reg.id.toString() // Evita: TypeError: Do not know how to serialize a BigInt
    }));

    res.json({
      success: true,
      anio: targetAnio,
      semana: targetSemana,
      dias: diasSemana,
      registros: registrosFormateados
    });

  } catch (error) {
    console.error("Error al consultar registros de asistencia:", error);
    res.status(500).json({
      success: false,
      message: "Error al consultar los registros de asistencia en la base de datos.",
      error: error.message || String(error)
    });
  }
});

// ==============================================================================
// 4. OBTENER CATÁLOGO DE FILTROS DE AÑO Y SEMANA DISPONIBLES EN EL CALENDARIO
// ==============================================================================
router.get('/filtros-disponibles', async (req, res) => {
  try {
    const combinaciones = await prisma.calendario.findMany({
      select: {
        anio: true,
        semana: true
      },
      distinct: ['anio', 'semana'],
      orderBy: [
        { anio: 'asc' },
        { semana: 'asc' }
      ]
    });

    // Agrupar semanas por año para facilitar su renderizado en el front
    const filtros = {};
    combinaciones.forEach(c => {
      if (!filtros[c.anio]) {
        filtros[c.anio] = [];
      }
      filtros[c.anio].push(c.semana);
    });

    res.json({
      success: true,
      filtros
    });
  } catch (error) {
    console.error("Error al obtener catálogo de filtros:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener el catálogo de filtros disponibles.",
      error: error.message || String(error)
    });
  }
});

module.exports = router;

