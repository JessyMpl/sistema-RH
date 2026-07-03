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
            area: { select: { nombre: true } }, // 💡 El arreglo: traemos el nombre desde el catálogo
            regimen: true
          }
        }
      },
      orderBy: {
        fecha: 'desc'
      }
    });

    // 💡 EL DISFRAZ: Mapeamos el nombre del área de vuelta a la propiedad 'departamento'
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
// 2. REGISTRAR JUSTIFICACIÓN (INDIVIDUAL)
// ==============================================================================
router.post('/registrar', async (req, res) => {
  const { asistenciaId, servidorId, motivo, folio, observaciones, siglas, cobertura } = req.body;

  if (!asistenciaId || !servidorId || !motivo || !siglas || !cobertura) {
    return res.status(400).json({ error: "Faltan parámetros requeridos para procesar." });
  }

  try {
    const dataAsistencia = {
      minutosRetardo: 0,
      incidencia: "JUSTIFICADA" 
    };

    if (cobertura === 'ENTRADA') {
      dataAsistencia.entrada = siglas; 
    } else if (cobertura === 'SALIDA') {
      dataAsistencia.salida = siglas;  
    } else if (cobertura === 'COMPLETO') {
      dataAsistencia.entrada = siglas;
      dataAsistencia.salida = siglas;
    }

    await prisma.$transaction([
      prisma.justificacion.create({
        data: {
          asistenciaId: Number(asistenciaId),
          servidorId: Number(servidorId),
          motivo: motivo,
          folioDocumento: folio || null,
          observaciones: observaciones || null,
          cobertura: cobertura
        }
      }),
      prisma.asistencia.update({
        where: { id: Number(asistenciaId) },
        data: dataAsistencia
      })
    ]);

    res.json({ mensaje: "Justificación procesada y guardada exitosamente." });
  } catch (error) {
    console.error("Error crítico durante la transacción de justificación:", error);
    res.status(500).json({ error: "No se pudo completar el registro debido a un fallo interno." });
  }
});

// ==============================================================================
// 2.5 REGISTRAR JUSTIFICACIÓN MASIVA
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
  maxWait: 10000, // 10 segundos máximo esperando conexión
  timeout: 60000  // 60 segundos para procesar todo el lote masivo
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
            area: { select: { nombre: true } } // 💡 El arreglo en el historial
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
        departamento: item.servidor?.area ? item.servidor.area.nombre : 'Sin Área' // 💡 Se manda por si el frontend decide mostrarlo en el historial futuro
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