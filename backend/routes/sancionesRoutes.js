const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const exceljs = require('exceljs'); 

// ==============================================================================
// FUNCIÓN INTERNA: MOTOR MATEMÁTICO REUTILIZABLE
// ==============================================================================
async function obtenerSancionesCalculadas(mes, anio) {
  const fechaInicio = new Date(Date.UTC(anio, mes, 1, 0, 0, 0));
  const fechaFin = new Date(Date.UTC(anio, parseInt(mes) + 1, 0, 23, 59, 59));

  const asistenciasMes = await prisma.asistencia.findMany({
    where: {
      fecha: { gte: fechaInicio, lte: fechaFin }
    },
    include: {
      servidor: { select: { id: true, numeroEmpleado: true, nombreCompleto: true, area: { select: { nombre: true } } } }
    }
  });

  const conteosMap = {};
  
  asistenciasMes.forEach(registro => {
    const s = registro.servidor;
    if (!conteosMap[s.id]) {
      conteosMap[s.id] = {
        servidorId: s.id,
        numeroEmpleado: s.numeroEmpleado,
        nombreCompleto: s.nombreCompleto,
        departamento: s.area ? s.area.nombre : 'Sin Área',
        totalFaltas: 0,
        totalRetardos: 0,
        totalOmisiones: 0,
        totalMinutosRetardo: 0 
      };
    }

    if (registro.minutosRetardo && registro.minutosRetardo > 0) {
      conteosMap[s.id].totalMinutosRetardo += Number(registro.minutosRetardo);
    }

    const estatus = String(registro.incidencia || '').trim().toUpperCase();
    
    if (estatus === 'FALTA' || estatus === 'OMISION_E' || estatus === 'OMISION_S' || estatus === 'RETARDO_Y_OMISION') {
      conteosMap[s.id].totalFaltas++;
      if (estatus.includes('OMISION')) {
        conteosMap[s.id].totalOmisiones++;
      }
    } 
    else if (estatus === 'RETARDO' || estatus === 'RETARDO_ESPECIAL') {
      conteosMap[s.id].totalRetardos++;
    }
  });

  const sancionesPropuestas = [];
  
  Object.values(conteosMap).forEach(emp => {
    // OFICIO A: Por concepto de Retardos (Puntualidad)
    if (emp.totalRetardos > 0) {
      let diasCastigoRetardos = 0;
      let textoRetardos = "";

      if (emp.totalRetardos === 1) textoRetardos = "Llamada de atención verbal";
      else if (emp.totalRetardos === 2) textoRetardos = "Severa llamada de atención escrita";
      else if (emp.totalRetardos === 3) textoRetardos = "Amonestación escrita";
      else if (emp.totalRetardos === 4) { textoRetardos = "Suspensión s/goce de sueldo"; diasCastigoRetardos = 1; }
      else if (emp.totalRetardos === 5) { textoRetardos = "Suspensión s/goce de sueldo"; diasCastigoRetardos = 2; }
      else if (emp.totalRetardos === 6) { textoRetardos = "Suspensión s/goce de sueldo"; diasCastigoRetardos = 3; }
      else if (emp.totalRetardos >= 7) { textoRetardos = "Suspensión s/goce de sueldo"; diasCastigoRetardos = 4; }

      sancionesPropuestas.push({
        servidorId: emp.servidorId,
        numeroEmpleado: emp.numeroEmpleado,
        nombreCompleto: emp.nombreCompleto,
        departamento: emp.departamento,
        tipoSancion: "RETARDOS",
        totalRetardos: emp.totalRetardos,
        totalFaltas: 0,
        totalOmisiones: 0,
        totalMinutosRetardo: emp.totalMinutosRetardo, 
        sancionTexto: textoRetardos, // 🔥 AQUÍ ESTÁ LA CORRECCIÓN CLAVE
        diasDescuento: diasCastigoRetardos
      });
    }

    // OFICIO B: Por concepto de Faltas / Inasistencias (Asistencia)
    if (emp.totalFaltas > 0) {
      let diasCastigoFaltas = 0;
      let textoFaltas = "";

      if (emp.totalFaltas === 1) textoFaltas = "Amonestación escrita";
      else if (emp.totalFaltas === 2) { textoFaltas = "Suspensión s/goce de sueldo"; diasCastigoFaltas = 3; }
      else if (emp.totalFaltas === 3) { textoFaltas = "Suspensión s/goce de sueldo"; diasCastigoFaltas = 8; }
      else if (emp.totalFaltas > 3) { textoFaltas = "Baja Definitiva (Norma 20301/206-03)"; diasCastigoFaltas = 8; }

      sancionesPropuestas.push({
        servidorId: emp.servidorId,
        numeroEmpleado: emp.numeroEmpleado,
        nombreCompleto: emp.nombreCompleto,
        departamento: emp.departamento,
        tipoSancion: "FALTAS",
        totalRetardos: 0,
        totalFaltas: emp.totalFaltas,
        totalOmisiones: emp.totalOmisiones,
        totalMinutosRetardo: 0, 
        sancionTexto: textoFaltas,
        diasDescuento: diasCastigoFaltas
      });
    }
  });

  return sancionesPropuestas.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
}

// ==============================================================================
// 1. MOTOR MATEMÁTICO: CALCULAR SANCIONES DEL MES
// ==============================================================================
router.get('/calcular', async (req, res) => {
  try {
    const { mes, anio } = req.query;
    if (!mes || !anio) return res.status(400).json({ error: 'Faltan parámetros de mes y año.' });

    const infractores = await obtenerSancionesCalculadas(mes, anio);
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
    const { servidorId, mes, anio, tipoSancion, totalRetardos, totalFaltas, totalOmisiones, sancionAplicada, diasDescuento, folioOficio } = req.body;

    const existeSancionIdem = await prisma.sancionMensual.findFirst({
      where: {
        servidorId,
        mes: parseInt(mes),
        anio: parseInt(anio),
        tipoSancion: tipoSancion
      }
    });

    if (existeSancionIdem) {
      return res.status(400).json({ error: `Ya se guardó y procesó el oficio de ${tipoSancion} para este servidor público en este mes.` });
    }

    const nuevaSancion = await prisma.sancionMensual.create({
      data: {
        servidorId,
        mes: parseInt(mes),
        anio: parseInt(anio),
        tipoSancion, 
        totalRetardos,
        totalFaltas,
        totalOmisiones,
        sancionAplicada,
        diasDescuento,
        folioOficio
      }
    });

    res.json({ mensaje: 'Sanción registrada de forma independiente en el expediente.', sancion: nuevaSancion });
  } catch (error) {
    console.error("Error guardando sanción:", error);
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
        servidor: { select: { numeroEmpleado: true, nombreCompleto: true, area: { select: { nombre: true } } } }
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { id: 'desc' }]
    });

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

// ==============================================================================
// 4. DESCARGAR REPORTE DE SANCIONES EN EXCEL (BACKEND)
// ==============================================================================
router.get('/descargar-excel', async (req, res) => {
  try {
    const { mes, anio } = req.query;
    if (!mes || !anio) return res.status(400).json({ error: 'Faltan parámetros de mes y año.' });

    const datosSanciones = await obtenerSancionesCalculadas(mes, anio);

    const mesesTexto = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const tituloReporte = `PROPUESTA DE MEDIDAS DISCIPLINARIAS - MES DE ${mesesTexto[parseInt(mes)].toUpperCase()} DEL AÑO ${anio}`;

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Sanciones Propuestas');

    worksheet.mergeCells('A1:H1');
    const celdaTitulo = worksheet.getCell('A1');
    celdaTitulo.value = tituloReporte;
    celdaTitulo.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    celdaTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B1C3A' } }; 
    celdaTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 40;

    worksheet.mergeCells('A2:H2');
    const celdaMeta = worksheet.getCell('A2');
    celdaMeta.value = `Fecha de generación del reporte: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`;
    celdaMeta.font = { name: 'Arial', italic: true, size: 10, color: { argb: 'FF333333' } };
    celdaMeta.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getRow(2).height = 20;

    worksheet.getRow(3).height = 10;

    const cabeceras = [
      "NÚM. EMPLEADO",
      "ÁREA DE ADSCRIPCIÓN",
      "SERVIDOR PÚBLICO",
      "CONCEPTO",
      "INCIDENCIAS",
      "DETALLE DE LA SANCIÓN NORMATIVA",
      "DÍAS DE SUSPENSIÓN",
      "MINUTOS ACUMULADOS"
    ];

    worksheet.getRow(4).values = cabeceras;
    worksheet.getRow(4).height = 26;

    for (let col = 1; col <= 8; col++) {
      const celdaHeader = worksheet.getCell(4, col);
      celdaHeader.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      celdaHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF924156' } }; 
      celdaHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      celdaHeader.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF475569' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    }

    let filaActual = 5;

    datosSanciones.forEach(emp => {
      const row = worksheet.getRow(filaActual);
      
      row.getCell(1).value = emp.numeroEmpleado;
      row.getCell(2).value = emp.departamento;
      row.getCell(3).value = emp.nombreCompleto;
      row.getCell(4).value = emp.tipoSancion;
      row.getCell(5).value = emp.tipoSancion === 'FALTAS' ? `${emp.totalFaltas} Falta(s)` : `${emp.totalRetardos} Retardo(s)`;
      row.getCell(6).value = emp.sancionTexto;
      row.getCell(7).value = emp.diasDescuento > 0 ? emp.diasDescuento : '-';
      row.getCell(8).value = emp.tipoSancion === 'RETARDOS' && emp.totalMinutosRetardo > 0 ? `${emp.totalMinutosRetardo} min` : '-';

      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };

      for (let col = 1; col <= 8; col++) {
        const celda = row.getCell(col);
        celda.font = { name: 'Arial', size: 10 };
        
        celda.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        if (emp.diasDescuento > 0) {
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        } else if (filaActual % 2 === 0) {
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      }

      row.height = 24;
      filaActual++;
    });

    worksheet.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const valueStr = cell.value ? String(cell.value) : '';
        if (valueStr.length > maxLen) maxLen = valueStr.length;
      });
      column.width = maxLen < 12 ? 12 : maxLen + 4;
    });

    res.setHeader('Content-Disposition', `attachment; filename=Propuesta_Sanciones_${mesesTexto[parseInt(mes)].toUpperCase()}_${anio}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Error al generar Excel de sanciones:", error);
    res.status(500).json({ error: 'No se pudo generar el archivo oficial de sanciones.' });
  }
});

module.exports = router;