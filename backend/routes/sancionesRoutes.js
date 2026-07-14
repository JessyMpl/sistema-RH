
const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const exceljs = require('exceljs'); 
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer');

// ==============================================================================
// FUNCIÓN AUXILIAR: FORMATEAR LISTA DE DÍAS
// ==============================================================================
function formatearDias(diasSet) {
  const dias = Array.from(diasSet).sort((a, b) => a - b);
  if (dias.length === 0) return "";
  if (dias.length === 1) return dias[0].toString();
  const ultimos = dias.pop();
  return dias.join(", ") + " y " + ultimos;
}

// ==============================================================================
// FUNCIÓN INTERNA: MOTOR MATEMÁTICO REUTILIZABLE
// ==============================================================================
async function obtenerSancionesCalculadas(mes, anio) {
  const fechaInicio = new Date(Date.UTC(anio, mes, 1, 0, 0, 0));
  const fechaFin = new Date(Date.UTC(anio, parseInt(mes) + 1, 0, 23, 59, 59));

  const asistenciasMes = await prisma.asistencia.findMany({
    where: { fecha: { gte: fechaInicio, lte: fechaFin } },
    include: { servidor: { select: { id: true, numeroEmpleado: true, nombreCompleto: true, area: { select: { nombre: true } } } } }
  });

  const conteosMap = {};
  
  asistenciasMes.forEach(registro => {
    const s = registro.servidor;
    if (!conteosMap[s.id]) {
      conteosMap[s.id] = {
        servidorId: s.id, numeroEmpleado: s.numeroEmpleado, nombreCompleto: s.nombreCompleto,
        departamento: s.area ? s.area.nombre : 'Sin Área', totalFaltas: 0, totalRetardos: 0,
        totalOmisiones: 0, totalMinutosRetardo: 0, diasFaltas: new Set(), diasRetardos: new Set()
      };
    }

    if (registro.minutosRetardo && registro.minutosRetardo > 0) conteosMap[s.id].totalMinutosRetardo += Number(registro.minutosRetardo);

    const estatus = String(registro.incidencia || '').trim().toUpperCase();
    const diaIncidencia = new Date(registro.fecha).getUTCDate();
    
    if (estatus === 'FALTA' || estatus === 'OMISION_E' || estatus === 'OMISION_S' || estatus === 'RETARDO_Y_OMISION') {
      conteosMap[s.id].totalFaltas++;
      conteosMap[s.id].diasFaltas.add(diaIncidencia); 
      if (estatus.includes('OMISION')) conteosMap[s.id].totalOmisiones++;
    } 
    else if (estatus === 'RETARDO' || estatus === 'RETARDO_ESPECIAL') {
      conteosMap[s.id].totalRetardos++;
      conteosMap[s.id].diasRetardos.add(diaIncidencia); 
    }
  });

  const sancionesPropuestas = [];
  
  Object.values(conteosMap).forEach(emp => {
    if (emp.totalRetardos > 0) {
      let diasCastigoRetardos = 0;
      let textoRetardos = "";

      if (emp.totalRetardos === 1) textoRetardos = "Llamada de atención verbal";
      else if (emp.totalRetardos === 2) textoRetardos = "Severa llamada de atención escrita";
      else if (emp.totalRetardos === 3) textoRetardos = "Amonestación escrita";
      else if (emp.totalRetardos === 4) { textoRetardos = "Suspensión de un día sin goce de sueldo"; diasCastigoRetardos = 1; }
      else if (emp.totalRetardos === 5) { textoRetardos = "Suspensión de dos días sin goce de sueldo"; diasCastigoRetardos = 2; }
      else if (emp.totalRetardos === 6) { textoRetardos = "Suspensión de tres días sin goce de sueldo"; diasCastigoRetardos = 3; }
      else if (emp.totalRetardos >= 7) { textoRetardos = "Suspensión de cuatro días sin goce de sueldo"; diasCastigoRetardos = 4; }

      sancionesPropuestas.push({
        servidorId: emp.servidorId, numeroEmpleado: emp.numeroEmpleado, nombreCompleto: emp.nombreCompleto,
        departamento: emp.departamento, tipoSancion: "RETARDOS", totalRetardos: emp.totalRetardos,
        totalFaltas: 0, totalOmisiones: 0, totalMinutosRetardo: emp.totalMinutosRetardo, 
        sancionTexto: textoRetardos, diasDescuento: diasCastigoRetardos, diasIncidenciaTexto: formatearDias(emp.diasRetardos)
      });
    }

    if (emp.totalFaltas > 0) {
      let diasCastigoFaltas = 0;
      let textoFaltas = "";

      if (emp.totalFaltas === 1) textoFaltas = "Amonestación escrita";
      else if (emp.totalFaltas === 2) { textoFaltas = "Suspensión de tres días sin goce de sueldo"; diasCastigoFaltas = 3; }
      else if (emp.totalFaltas === 3) { textoFaltas = "Suspensión de ocho días sin goce de sueldo"; diasCastigoFaltas = 8; }
      else if (emp.totalFaltas > 3) { textoFaltas = "Baja Definitiva (Norma 20301/206-03)"; diasCastigoFaltas = 8; }

      sancionesPropuestas.push({
        servidorId: emp.servidorId, numeroEmpleado: emp.numeroEmpleado, nombreCompleto: emp.nombreCompleto,
        departamento: emp.departamento, tipoSancion: "FALTAS", totalRetardos: 0,
        totalFaltas: emp.totalFaltas, totalOmisiones: emp.totalOmisiones, totalMinutosRetardo: 0, 
        sancionTexto: textoFaltas, diasDescuento: diasCastigoFaltas, diasIncidenciaTexto: formatearDias(emp.diasFaltas) 
      });
    }
  });

  return sancionesPropuestas.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
}

router.get('/calcular', async (req, res) => {
  try {
    const { mes, anio } = req.query;
    if (!mes || !anio) return res.status(400).json({ error: 'Faltan parámetros de mes y año.' });
    const infractores = await obtenerSancionesCalculadas(mes, anio);
    res.json(infractores);
  } catch (error) {
    res.status(500).json({ error: 'Hubo un error al calcular las sanciones.' });
  }
});

router.post('/guardar', async (req, res) => {
  try {
    const { servidorId, mes, anio, tipoSancion, totalRetardos, totalFaltas, totalOmisiones, sancionAplicada, diasDescuento, folioOficio } = req.body;

    const existeSancionIdem = await prisma.sancionMensual.findFirst({
      where: { servidorId, mes: parseInt(mes), anio: parseInt(anio), tipoSancion }
    });

    if (existeSancionIdem) return res.status(400).json({ error: `Ya se guardó y procesó el oficio de ${tipoSancion} para este servidor público en este mes.` });

    const nuevaSancion = await prisma.sancionMensual.create({
      data: { servidorId, mes: parseInt(mes), anio: parseInt(anio), tipoSancion, totalRetardos, totalFaltas, totalOmisiones, sancionAplicada, diasDescuento, folioOficio }
    });

    res.json({ mensaje: 'Sanción registrada.', sancion: nuevaSancion });
  } catch (error) {
    res.status(500).json({ error: 'Hubo un error al guardar la sanción.' });
  }
});

router.get('/historial', async (req, res) => {
  try {
    const historial = await prisma.sancionMensual.findMany({
      include: { servidor: { select: { numeroEmpleado: true, nombreCompleto: true, area: { select: { nombre: true } } } } },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { id: 'desc' }]
    });

    const historialFormateado = historial.map(sancion => ({
      ...sancion, servidor: { numeroEmpleado: sancion.servidor.numeroEmpleado, nombreCompleto: sancion.servidor.nombreCompleto, departamento: sancion.servidor.area ? sancion.servidor.area.nombre : 'Sin Área' }
    }));

    res.json(historialFormateado);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar el expediente histórico.' });
  }
});

// ==============================================================================
// GENERADOR DE PDF CON PUPPETEER
// ==============================================================================
router.post('/generar-pdf', async (req, res) => {
  let browser = null;
  try {
    const dataFormato = req.body; 
    
   // 1. Buscamos y leemos la plantilla HTML
    const templatePath = path.join(__dirname, '../templates/oficio_sancion.hbs');
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    
    // --- NUEVO: LEER IMAGEN Y CONVERTIR A BASE64 ---
    const imgPath = path.join(__dirname, '../templates/escudoarmasedomex.jpg');
    if (fs.existsSync(imgPath)) {
      const imgBuffer = fs.readFileSync(imgPath);
      dataFormato.imagen_escudo = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
    }
    // -----------------------------------------------
    
    // 2. Compilamos la plantilla con Handlebars...
    // 2. Compilamos la plantilla con Handlebars inyectándole los datos
    const template = handlebars.compile(templateHtml);
    const htmlFinal = template(dataFormato);

    // 3. Abrimos el navegador invisible (Puppeteer)
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Súper importante en Linux
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlFinal, { waitUntil: 'networkidle0' });
    
    // 4. Transformamos el HTML a un documento PDF formal
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' }
    });

    // 5. Lo enviamos de regreso al frontend para descargar
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Aviso_Sancion.pdf`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error("Error al fabricar el PDF:", error);
    res.status(500).json({ error: 'No se pudo generar el documento PDF.' });
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
});

module.exports = router;