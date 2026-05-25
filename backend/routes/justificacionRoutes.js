const express = require('express');
const router = express.Router();
const prisma = require('../config/db'); // Sincronizado con tu archivo db.js

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
              in: ['RETARDO', 'RETARDO_ESPECIAL', 'OMISION_E', 'OMISION_S', 'RETARDO_Y_OMISION']
            }
          },
          {
            justificacion: null // Filtra únicamente las que no tienen justificación
          }
        ]
      },
      include: {
        servidor: {
          select: {
            id: true,
            numeroEmpleado: true,
            nombreCompleto: true,
            departamento: true,
            regimen: true
          }
        }
      },
      orderBy: {
        fecha: 'desc'
      }
    });

    res.json(pendientes);
  } catch (error) {
    console.error("Error al recuperar asistencias pendientes:", error);
    res.status(500).json({ error: "Error al recuperar incidencias pendientes de la base de datos." });
  }
});

// ==============================================================================
// 2. REGISTRAR JUSTIFICACIÓN (PLANCHADO DINÁMICO POR COBERTURA)
// ==============================================================================
router.post('/registrar', async (req, res) => {
  const { asistenciaId, servidorId, motivo, folio, observaciones, siglas, cobertura } = req.body;

  if (!asistenciaId || !servidorId || !motivo || !siglas || !cobertura) {
    return res.status(400).json({ error: "Faltan parámetros requeridos para procesar." });
  }

  try {
    // Definición de cambios mínimos en el registro original de Asistencia
    const dataAsistencia = {
      minutosRetardo: 0,
      incidencia: "JUSTIFICADA" // Estatus para que se pinte de azul en Consultas e Incidencias
    };

    // Lógica quirúrgica: Solo se altera la celda correspondiente al alcance seleccionado
    if (cobertura === 'ENTRADA') {
      dataAsistencia.entrada = siglas; // Ejemplo: 'CS' o 'IN' en entrada, la salida se respeta
    } else if (cobertura === 'SALIDA') {
      dataAsistencia.salida = siglas;  // Ejemplo: 'CS' o 'IN' en salida, la entrada se respeta
    } else if (cobertura === 'COMPLETO') {
      dataAsistencia.entrada = siglas;
      dataAsistencia.salida = siglas;
    }

    // Transacción atómica de Prisma
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
            departamento: true
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
        nombreCompleto: item.servidor?.nombreCompleto || 'Desconocido'
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