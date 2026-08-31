const express = require('express');
const router = express.Router();
const prisma = require('../config/db'); 

// ==============================================================================
// 💡 MOTOR LÓGICO DE JUSTIFICACIONES FRACCIONADAS E HISTÓRICAS
// ==============================================================================
async function construirTransaccionesJustificacion(ast, servidorId, motivo, folio, observaciones, siglas, cobertura) {
  let nuevaEntrada = ast.entrada;
  let nuevaSalida = ast.salida;

  if (cobertura === 'ENTRADA') nuevaEntrada = siglas;
  else if (cobertura === 'SALIDA') nuevaSalida = siglas;
  else if (cobertura === 'COMPLETO') {
    nuevaEntrada = siglas;
    nuevaSalida = siglas;
  }

  let nuevaIncidencia = 'JUSTIFICADA';
  const noTieneEntrada = !nuevaEntrada || nuevaEntrada === 'SR' || nuevaEntrada === '---';
  const noTieneSalida = !nuevaSalida || nuevaSalida === 'SR' || nuevaSalida === '---';

  if (noTieneEntrada && noTieneSalida) {
    nuevaIncidencia = 'FALTA';
  } else if (noTieneEntrada && !noTieneSalida) {
    nuevaIncidencia = 'OMISION_E';
  } else if (!noTieneEntrada && noTieneSalida) {
    nuevaIncidencia = 'OMISION_S';
  } else {
    if ((ast.incidencia === 'RETARDO' || ast.incidencia === 'RETARDO_ESPECIAL' || ast.incidencia === 'RETARDO_Y_OMISION') && cobertura === 'SALIDA') {
       nuevaIncidencia = ast.incidencia === 'RETARDO_ESPECIAL' ? 'RETARDO_ESPECIAL' : 'RETARDO';
    } else {
       nuevaIncidencia = 'JUSTIFICADA';
    }
  }

  let coberturaFinal = cobertura;
  const isJustified = (val) => ['JU', 'CS', 'IN', 'DE', 'LI'].includes(val);
  if (isJustified(nuevaEntrada) && isJustified(nuevaSalida)) {
    coberturaFinal = 'COMPLETO';
  }

  let minutos = ast.minutosRetardo;
  if (cobertura === 'ENTRADA' || cobertura === 'COMPLETO') minutos = 0;

  // 🔥 MAGIA HISTÓRICA: Buscamos si ya existe una justificación previa.
  // En lugar de sobreescribirla, CONCATENAMOS los textos para conservar la historia.
  const justifPrevia = await prisma.justificacion.findUnique({
    where: { asistenciaId: Number(ast.id) }
  });

  let finalMotivo = motivo;
  let finalFolio = folio || null;
  let finalObs = observaciones || null;

  if (justifPrevia) {
    // Concatenar motivos evitando duplicados exactos
    if (!justifPrevia.motivo.includes(motivo)) {
      finalMotivo = `[${justifPrevia.cobertura}] ${justifPrevia.motivo}  +  [${cobertura}] ${motivo}`;
    }
    
    // Concatenar folios
    if (folio && justifPrevia.folioDocumento && !justifPrevia.folioDocumento.includes(folio)) {
      finalFolio = `${justifPrevia.folioDocumento} | ${folio}`;
    } else if (!finalFolio) {
      finalFolio = justifPrevia.folioDocumento;
    }

    // Concatenar observaciones
    if (observaciones && justifPrevia.observaciones && !justifPrevia.observaciones.includes(observaciones)) {
      finalObs = `${justifPrevia.observaciones} | ${observaciones}`;
    } else if (!finalObs) {
      finalObs = justifPrevia.observaciones;
    }
  }

  return [
    prisma.justificacion.upsert({
      where: { asistenciaId: Number(ast.id) },
      update: {
        motivo: finalMotivo,
        folioDocumento: finalFolio,
        observaciones: finalObs,
        cobertura: coberturaFinal,
        fechaRegistro: new Date() // Actualizamos fecha para que resalte en el historial reciente
      },
      create: {
        asistenciaId: Number(ast.id),
        servidorId: Number(servidorId),
        motivo: finalMotivo,
        folioDocumento: finalFolio,
        observaciones: finalObs,
        cobertura: coberturaFinal
      }
    }),
    prisma.asistencia.update({
      where: { id: Number(ast.id) },
      data: {
        entrada: nuevaEntrada,
        salida: nuevaSalida,
        incidencia: nuevaIncidencia,
        minutosRetardo: minutos
      }
    })
  ];
}

// ==============================================================================
// 1. OBTENER INCIDENCIAS PENDIENTES DE JUSTIFICAR
// ==============================================================================
router.get('/pendientes', async (req, res) => {
  try {
    const pendientes = await prisma.asistencia.findMany({
      where: {
        incidencia: {
          in: ['RETARDO', 'RETARDO_ESPECIAL', 'OMISION_E', 'OMISION_S', 'RETARDO_Y_OMISION', 'FALTA']
        }
      },
      include: {
        servidor: {
          select: { id: true, numeroEmpleado: true, nombreCompleto: true, area: { select: { nombre: true } }, regimen: true }
        }
      },
      orderBy: { fecha: 'desc' }
    });

    const respuesta = pendientes.map(p => ({
      ...p,
      servidor: {
        id: p.servidor.id,
        numeroEmpleado: p.servidor.numeroEmpleado,
        nombreCompleto: p.servidor.nombreCompleto,
        departamento: p.servidor.area ? p.servidor.area.nombre : 'Sin Área',
        regimen: p.servidor.regimen
      }
    }));

    res.json(respuesta);
  } catch (error) {
    console.error("Error al recuperar asistencias pendientes:", error);
    res.status(500).json({ error: "Error al recuperar incidencias pendientes de la base de datos." });
  }
});

// ==============================================================================
// 2. REGISTRAR JUSTIFICACIÓN (INDIVIDUAL / POR RANGO)
// ==============================================================================
router.post('/registrar-rango', async (req, res) => {
  const { servidorId, fechaInicio, fechaFin, motivo, folio, observaciones, siglas, cobertura } = req.body;

  if (!servidorId || !fechaInicio || !fechaFin || !motivo || !siglas || !cobertura) {
    return res.status(400).json({ error: "Faltan parámetros requeridos para procesar el rango." });
  }

  try {
    const start = new Date(`${fechaInicio}T00:00:00Z`);
    const end = new Date(`${fechaFin}T23:59:59Z`);

    const asistencias = await prisma.asistencia.findMany({
      where: { servidorId: Number(servidorId), fecha: { gte: start, lte: end } }
    });

    if (asistencias.length === 0) {
      return res.status(404).json({ error: "No se encontraron registros de asistencia en el rango seleccionado." });
    }

    const transacciones = [];
    for (const ast of asistencias) {
      // 💡 Ahora esperamos a que el motor analice el pasado antes de agregar las transacciones
      const txs = await construirTransaccionesJustificacion(ast, servidorId, motivo, folio, observaciones, siglas, cobertura);
      transacciones.push(...txs);
    }

    await prisma.$transaction(transacciones);

    res.json({ 
      mensaje: asistencias.length > 1 ? `Se justificaron ${asistencias.length} días exitosamente.` : "Justificación procesada y guardada exitosamente." 
    });

  } catch (error) {
    console.error("Error crítico durante la justificación por rango:", error);
    res.status(500).json({ error: "No se pudo completar el registro debido a un fallo interno." });
  }
});

// ==============================================================================
// 2.5 REGISTRAR JUSTIFICACIÓN MASIVA (MÚLTIPLES PERSONAS, 1 DÍA)
// ==============================================================================
router.post('/registrar-masiva', async (req, res) => {
  const { asistencias, motivo, folio, observaciones, siglas, cobertura } = req.body;

  if (!asistencias || asistencias.length === 0 || !motivo || !siglas || !cobertura) {
    return res.status(400).json({ error: "Faltan parámetros requeridos para procesar." });
  }

  try {
    const ids = asistencias.map(a => Number(a.id));
    const asistenciasDB = await prisma.asistencia.findMany({
      where: { id: { in: ids } }
    });

    const transacciones = [];
    for (const ast of asistenciasDB) {
      const txs = await construirTransaccionesJustificacion(ast, ast.servidorId, motivo, folio, observaciones, siglas, cobertura);
      transacciones.push(...txs);
    }

    await prisma.$transaction(transacciones, { maxWait: 10000, timeout: 60000 });

    res.json({ mensaje: `Se justificaron ${asistenciasDB.length} registros exitosamente.` });
  } catch (error) {
    console.error("Error crítico durante justificación masiva:", error);
    res.status(500).json({ error: "No se pudo completar el registro masivo por un fallo interno." });
  }
});

// ==============================================================================
// 3. CONSULTAR ARCHIVO HISTÓRICO DE JUSTIFICACIONES
// ==============================================================================
router.get('/historial', async (req, res) => {
  try {
    const historial = await prisma.justificacion.findMany({
      include: {
        servidor: { select: { numeroEmpleado: true, nombreCompleto: true, area: { select: { nombre: true } } } },
        asistencia: { select: { fecha: true, entrada: true, salida: true } }
      },
      orderBy: { fechaRegistro: 'desc' }
    });

    const respuestaFormateada = historial.map(item => ({
      id: item.id,
      fechaRegistro: item.fechaRegistro,
      motivo: item.motivo,
      cobertura: item.cobertura,
      folio: item.folioDocumento || 'N/A',
      servidor: {
        numeroEmpleado: item.servidor?.numeroEmpleado || 'N/A',
        nombreCompleto: item.servidor?.nombreCompleto || 'Desconocido',
        departamento: item.servidor?.area ? item.servidor.area.nombre : 'Sin Área' 
      },
      asistencia: { fecha: item.asistencia?.fecha || null }
    }));

    res.json(respuestaFormateada);
  } catch (error) {
    console.error("Error al recuperar el archivo histórico:", error);
    res.status(500).json({ error: "Error al recuperar el historial de justificaciones." });
  }
});

module.exports = router;