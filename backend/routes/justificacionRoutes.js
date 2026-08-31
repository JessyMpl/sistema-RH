const express = require('express');
const router = express.Router();
const prisma = require('../config/db'); 

// ==============================================================================
// 1. OBTENER INCIDENCIAS PENDIENTES DE JUSTIFICAR
// ==============================================================================
router.get('/pendientes', async (req, res) => {
  try {
    const pendientes = await prisma.asistencia.findMany({
      where: {
        AND: [
          {
            incidencia: {
              in: ['RETARDO', 'RETARDO_ESPECIAL', 'OMISION_E', 'OMISION_S', 'RETARDO_Y_OMISION', 'FALTA']
            }
          },
          {
            justificacion: null 
          }
        ]
      },
      include: {
        servidor: {
          select: {
            id: true,
            numeroEmpleado: true,
            nombreCompleto: true,
            area: { select: { nombre: true } }, 
            regimen: true
          }
        }
      },
      orderBy: {
        fecha: 'desc'
      }
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

    // Buscamos todas las asistencias generadas en ese rango para el empleado
    const asistencias = await prisma.asistencia.findMany({
      where: {
        servidorId: Number(servidorId),
        fecha: { gte: start, lte: end }
      }
    });

    if (asistencias.length === 0) {
      return res.status(404).json({ error: "No se encontraron registros de asistencia en el rango seleccionado." });
    }

    const dataAsistencia = {
      minutosRetardo: 0,
      incidencia: "JUSTIFICADA" 
    };

    if (cobertura === 'ENTRADA') dataAsistencia.entrada = siglas;
    else if (cobertura === 'SALIDA') dataAsistencia.salida = siglas;
    else if (cobertura === 'COMPLETO') {
      dataAsistencia.entrada = siglas;
      dataAsistencia.salida = siglas;
    }

    const transacciones = [];
    
    for (const ast of asistencias) {
      // 1. Borramos justificaciones previas en esos días (para evitar errores de duplicidad)
      transacciones.push(
        prisma.justificacion.deleteMany({
          where: { asistenciaId: Number(ast.id) }
        })
      );

      // 2. Creamos la nueva justificación
      transacciones.push(
        prisma.justificacion.create({
          data: {
            asistenciaId: Number(ast.id),
            servidorId: Number(ast.servidorId),
            motivo: motivo,
            folioDocumento: folio || null,
            observaciones: observaciones || null,
            cobertura: cobertura
          }
        })
      );
      
      // 3. Actualizamos el registro de asistencia
      transacciones.push(
        prisma.asistencia.update({
          where: { id: Number(ast.id) },
          data: dataAsistencia
        })
      );
    }

    await prisma.$transaction(transacciones);

    res.json({ 
      mensaje: asistencias.length > 1 
        ? `Se justificaron ${asistencias.length} días exitosamente.` 
        : "Justificación procesada y guardada exitosamente." 
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
    const dataAsistencia = {
      minutosRetardo: 0,
      incidencia: "JUSTIFICADA" 
    };

    if (cobertura === 'ENTRADA') dataAsistencia.entrada = siglas;
    else if (cobertura === 'SALIDA') dataAsistencia.salida = siglas;
    else if (cobertura === 'COMPLETO') {
      dataAsistencia.entrada = siglas;
      dataAsistencia.salida = siglas;
    }

    const transacciones = [];
    
    for (const ast of asistencias) {
      transacciones.push(
        prisma.justificacion.create({
          data: {
            asistenciaId: Number(ast.id),
            servidorId: Number(ast.servidorId),
            motivo: motivo,
            folioDocumento: folio || null,
            observaciones: observaciones || null,
            cobertura: cobertura
          }
        })
      );
      transacciones.push(
        prisma.asistencia.update({
          where: { id: Number(ast.id) },
          data: dataAsistencia
        })
      );
    }

    await prisma.$transaction(transacciones, {
      maxWait: 10000, 
      timeout: 60000  
    });

    res.json({ mensaje: `Se justificaron ${asistencias.length} registros exitosamente.` });
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
        servidor: {
          select: {
            numeroEmpleado: true,
            nombreCompleto: true,
            area: { select: { nombre: true } }
          }
        },
        asistencia: {
          select: {
            fecha: true,
            entrada: true,
            salida: true
          }
        }
      },
      orderBy: {
        fechaRegistro: 'desc'
      }
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
      asistencia: {
        fecha: item.asistencia?.fecha || null
      }
    }));

    res.json(respuestaFormateada);
  } catch (error) {
    console.error("Error al recuperar el archivo histórico:", error);
    res.status(500).json({ error: "Error al recuperar el historial de justificaciones." });
  }
});

module.exports = router;