const exceljs = require('exceljs');
const path = require('path');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const prisma = require('../config/db');

const upload = multer({ storage: multer.memoryStorage() });

// ==============================================================================
// 1. RUTA DE VISTA PREVIA (Lee el Excel, calcula, pero NO guarda en BD)
// ==============================================================================
router.post('/previsualizar-asistencias', upload.single('archivoExcel'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envio ningun archivo.' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(hoja, { raw: false });

    const empleados = await prisma.servidorPublico.findMany({ include: { horario: true } });
    const registrosPorDia = {};

    // AGRUPAR Y LIMPIAR EL BIOMÉTRICO
    rawData.forEach(fila => {
      let rawId = fila['Person ID'] || fila.ID || fila.id || fila.numeroEmpleado;
      const numEmp = String(rawId || '').replace(/['"]/g, '').trim();
      const tiempoString = String(fila.Time || fila.fecha || fila.hora || '').trim();

      if (numEmp && tiempoString) {
        const partes = tiempoString.split(' ');
        if (partes.length >= 2) {
          let fechaCruda = partes[0]; 
          let horaCruda = partes[1];  

          const fPartes = fechaCruda.split('/');
          let fechaLimpia = fechaCruda;
          if (fPartes.length === 3) {
            const mes = fPartes[0].padStart(2, '0');
            const dia = fPartes[1].padStart(2, '0');
            const anio = fPartes[2].length === 2 ? `20${fPartes[2]}` : fPartes[2];
            fechaLinter = `${anio}-${mes}-${dia}`;
            fechaLimpia = `${anio}-${mes}-${dia}`;
          }

          const hPartes = horaCruda.split(':');
          let horaLimpia = horaCruda;
          if (hPartes.length >= 2) horaLimpia = `${hPartes[0].padStart(2, '0')}:${hPartes[1]}`;

          const llave = `${numEmp}_${fechaLimpia}`;
          if (!registrosPorDia[llave]) registrosPorDia[llave] = { numEmp, fecha: fechaLimpia, horas: [] };
          registrosPorDia[llave].horas.push(horaLimpia);
        }
      }
    });

    const resultadosProcesados = []; 
    const datosAProcesar = [];       

    // PROCESAR BIOMÉTRICO (NORMALES Y ESPECIALES)
    for (const llave in registrosPorDia) {
      const { numEmp, fecha, horas } = registrosPorDia[llave];
      const empleado = empleados.find(e => String(e.numeroEmpleado).trim() === numEmp);
      
      // CAMBIO 1: Eliminamos checadas duplicadas y ordenamos
      const horasUnicas = [...new Set(horas)].sort(); 
      let primeraChecada = horasUnicas[0];
      let ultimaChecada = horasUnicas.length > 1 ? horasUnicas[horasUnicas.length - 1] : null;

      if (!empleado) {
        resultadosProcesados.push({ 
          numEmp, nombre: "No registrado en BD", fecha, entrada: primeraChecada, salida: ultimaChecada, estatus: "NO ENCONTRADO", minutosRetardo: 0
        });
        continue; 
      }

      let estatus = "OK";
      let minutosRetardo = 0;
      let entradaFinal = primeraChecada;
      let salidaFinal = ultimaChecada;
      
      const fechaActual = new Date(`${fecha}T12:00:00Z`);
      const ayer = new Date(fechaActual);
      ayer.setDate(ayer.getDate() - 1);
      const fechaAyer = ayer.toISOString().split('T')[0]; 
      const llaveAyer = `${numEmp}_${fechaAyer}`;

      let calcularRetardo = false;
      
      // Limpieza del regimen de la Base de Datos
      const regimenDB = String(empleado.regimen || '').toUpperCase().trim();

      if (regimenDB === 'NORMAL') {
        const horaPrimera = parseInt(primeraChecada.split(':')[0], 10);

        if (horasUnicas.length === 1) {
          if (horaPrimera >= 14) { 
            entradaFinal = null;
            salidaFinal = primeraChecada;
            estatus = "OMISION_E"; 
          } else {
            entradaFinal = primeraChecada;
            salidaFinal = null;
            estatus = "OMISION_S"; 
          }
        } else {
          // CAMBIO 2: Logica inteligente para multiples checadas
          const horaUltima = parseInt(ultimaChecada.split(':')[0], 10);

          if (horaPrimera >= 14) {
            entradaFinal = null;
            salidaFinal = ultimaChecada; 
            estatus = "OMISION_E";
          } else if (horaUltima < 14) {
            entradaFinal = primeraChecada; 
            salidaFinal = null;
            estatus = "OMISION_S";
          } else {
            entradaFinal = primeraChecada;
            salidaFinal = ultimaChecada;
          }
        }
        calcularRetardo = true;
      } 
      else if (regimenDB === 'ESPECIAL') {
        estatus = "OK_ESPECIAL";
        if (registrosPorDia[llaveAyer]) {
          entradaFinal = null; 
          salidaFinal = ultimaChecada || primeraChecada; 
        } else {
          entradaFinal = primeraChecada;
          salidaFinal = null; 
          calcularRetardo = true; 
        }
      } 
      else if (regimenDB === 'LISTA') {
        estatus = "LA";
        entradaFinal = null;
        salidaFinal = null;
      }
      else if (regimenDB === 'EXENTO' || regimenDB === 'EXCENTO') {
        estatus = "EXENTO";
        entradaFinal = null;
        salidaFinal = null;
      }

      if (calcularRetardo && entradaFinal) {
        let horaOficial = empleado.horario?.horaEntrada;

        if (!horaOficial) {
           const horaChecada = parseInt(entradaFinal.split(':')[0], 10);
           if (horaChecada <= 8) {
               horaOficial = '07:00';
           } else {
               horaOficial = '09:00';
           }
        }

        const [hEntrada, mEntrada] = horaOficial.split(':').map(Number);
        const [hReal, mReal] = entradaFinal.split(':').map(Number);
        
        const totalMinutosOficial = (hEntrada * 60) + mEntrada;
        const totalMinutosReal = (hReal * 60) + mReal;

        const limiteTolerancia = totalMinutosOficial + 10;

        if (totalMinutosReal > limiteTolerancia) {
          minutosRetardo = totalMinutosReal - limiteTolerancia;
          
          if (regimenDB === 'NORMAL') {
            estatus = estatus === "OMISION_S" ? "RETARDO_Y_OMISION" : "RETARDO";
          } else if (regimenDB === 'ESPECIAL') {
            estatus = "RETARDO_ESPECIAL";
          }
        }
      }

      const fechaParaPrisma = new Date(`${fecha}T00:00:00Z`);

      datosAProcesar.push({
        servidorId: empleado.id,
        fechaParaPrisma,
        entradaFinal,
        salidaFinal,
        minutosRetardo,
        estatus
      });

      resultadosProcesados.push({ 
        numEmp, 
        nombre: empleado.nombreCompleto, 
        departamento: empleado.departamento, 
        fecha, 
        entrada: entradaFinal, 
        salida: salidaFinal, 
        estatus, 
        minutosRetardo
      });
    }

    // AUTO-GENERAR LISTA DE ASISTENCIA Y PERSONAL EXENTO (LUNES A VIERNES)
    const fechasUnicas = [...new Set(Object.values(registrosPorDia).map(r => r.fecha))];
    
    if (fechasUnicas.length > 0) {
      const fechasObj = fechasUnicas.map(f => new Date(`${f}T12:00:00Z`));
      const fechaMin = new Date(Math.min(...fechasObj));
      const fechaMax = new Date(Math.max(...fechasObj));

      const empleadosLista = empleados.filter(e => String(e.regimen || '').toUpperCase().trim() === 'LISTA');
      const empleadosExento = empleados.filter(e => {
        const reg = String(e.regimen || '').toUpperCase().trim();
        return reg === 'EXENTO' || reg === 'EXCENTO';
      });

      for (let d = new Date(fechaMin); d <= fechaMax; d.setDate(d.getDate() + 1)) {
        const diaSemana = d.getDay(); 
        
        if (diaSemana !== 0 && diaSemana !== 6) { 
          const fechaStr = d.toISOString().split('T')[0];
          const fechaParaPrisma = new Date(`${fechaStr}T00:00:00Z`);

          // Auto-generar para personal de Lista
          for (const emp of empleadosLista) {
            datosAProcesar.push({
              servidorId: emp.id,
              fechaParaPrisma,
              entradaFinal: null,
              salidaFinal: null,
              minutosRetardo: 0,
              estatus: "LA"
            });

            resultadosProcesados.push({
              numEmp: emp.numeroEmpleado,
              nombre: emp.nombreCompleto,
              departamento: emp.departamento,
              fecha: fechaStr,
              entrada: '---',
              salida: '---',
              estatus: 'LA',
              minutosRetardo: 0
            });
          }

          // Auto-generar para personal Exento
          for (const emp of empleadosExento) {
            datosAProcesar.push({
              servidorId: emp.id,
              fechaParaPrisma,
              entradaFinal: null,
              salidaFinal: null,
              minutosRetardo: 0,
              estatus: "EXENTO"
            });

            resultadosProcesados.push({
              numEmp: emp.numeroEmpleado,
              nombre: emp.nombreCompleto,
              departamento: emp.departamento,
              fecha: fechaStr,
              entrada: '---',
              salida: '---',
              estatus: 'EXENTO',
              minutosRetardo: 0
            });
          }
        }
      }
    }

    resultadosProcesados.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.fecha.localeCompare(b.fecha));

    res.json({
      mensaje: 'Datos analizados listos para revision!',
      diasProcesados: fechasUnicas.length,
      datosVisuales: resultadosProcesados,
      datosParaGuardar: datosAProcesar 
    });

  } catch (error) {
    console.error("Error previsualizando biometrico:", error);
    res.status(500).json({ error: 'Hubo un error al intentar leer el Excel.' });
  }
});


// ==============================================================================
// 2. RUTA DE CONFIRMACIÓN (Recibe los datos aprobados y usa SQL Nivel Dios)
// ==============================================================================
router.post('/guardar-asistencias', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { datosParaGuardar } = req.body;

    if (!datosParaGuardar || datosParaGuardar.length === 0) {
      return res.status(400).json({ error: 'No se recibieron datos para guardar.' });
    }

    const TAMANO_LOTE = 1000; 

    for (let i = 0; i < datosParaGuardar.length; i += TAMANO_LOTE) {
      const loteDatos = datosParaGuardar.slice(i, i + TAMANO_LOTE);
      
      const values = loteDatos.map(dato => {
        const entrada = dato.entradaFinal ? `'${dato.entradaFinal}'` : 'NULL';
        const salida = dato.salidaFinal ? `'${dato.salidaFinal}'` : 'NULL';
        const incidencia = `'${dato.estatus}'`;
        const fechaStr = new Date(dato.fechaParaPrisma).toISOString(); 
        
        return `(${dato.servidorId}, '${fechaStr}'::timestamp, ${entrada}, ${salida}, ${dato.minutosRetardo}, ${incidencia})`;
      }).join(',\n');

      const query = `
        INSERT INTO "Asistencia" ("servidorId", "fecha", "entrada", "salida", "minutosRetardo", "incidencia")
        VALUES ${values}
        ON CONFLICT ("servidorId", "fecha") DO UPDATE SET
          "entrada" = EXCLUDED."entrada",
          "salida" = EXCLUDED."salida",
          "minutosRetardo" = EXCLUDED."minutosRetardo",
          "incidencia" = EXCLUDED."incidencia";
      `;

      await prisma.$executeRawUnsafe(query);
    }

    res.json({ mensaje: 'Datos guardados exitosamente en la base de datos!' });

  } catch (error) {
    console.error("Error guardando en BD:", error);
    res.status(500).json({ error: 'Hubo un error al guardar los datos en el servidor.' });
  }
});


// ==============================================================================
// 3. RUTA PARA DESCARGAR LA SÁBANA OFICIAL
// ==============================================================================
router.get('/descargar-reporte', async (req, res) => {
  try {
    const asistencias = await prisma.asistencia.findMany({
      include: { servidor: true },
      orderBy: [{ fecha: 'asc' }]
    });

    if (asistencias.length === 0) {
      return res.status(404).json({ error: 'No hay datos para exportar.' });
    }

    const fechasUnicas = [...new Set(asistencias.map(a => a.fecha.toISOString().split('T')[0]))].sort();
    const primeraFecha = new Date(`${fechasUnicas[0]}T12:00:00Z`);
    const dia = primeraFecha.getDate();
    const mesIndex = primeraFecha.getMonth();
    const anio = primeraFecha.getFullYear();
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    const quincena = dia <= 15 ? 'PRIMERA' : 'SEGUNDA';
    const tituloReporte = `REPORTE ${quincena} QUINCENA DEL MES DE ${meses[mesIndex].toUpperCase()} DEL AÑO ${anio}`;

    const workbook = new exceljs.Workbook();
    const templatePath = path.join(__dirname, '../plantillas/plantilla_quincenal.xlsx');
    await workbook.xlsx.readFile(templatePath);
    
    const worksheet = workbook.getWorksheet(1);

    worksheet.getCell('B1').value = tituloReporte;
    const fechaGeneracion = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    worksheet.getCell('B2').value = fechaGeneracion;

    let colIndexDia = 4; 
    fechasUnicas.forEach(fecha => {
       const numeroDia = parseInt(fecha.split('-')[2], 10);
       worksheet.getCell(4, colIndexDia).value = numeroDia;
       worksheet.getCell(4, colIndexDia).alignment = { horizontal: 'center' };
       colIndexDia += 2; 
    });

    const empleadosMap = {};
    asistencias.forEach(a => {
      const numEmp = a.servidor.numeroEmpleado;
      if (!empleadosMap[numEmp]) {
        empleadosMap[numEmp] = {
          numEmp,
          nombre: a.servidor.nombreCompleto,
          departamento: a.servidor.departamento,
          horarioId: a.servidor.horarioId, 
          regimen: a.servidor.regimen,
          asistencias: {}
        };
      }
      empleadosMap[numEmp].asistencias[a.fecha.toISOString().split('T')[0]] = a;
    });

    const empleadosArr = Object.values(empleadosMap).sort((a, b) => a.nombre.localeCompare(b.nombre));

    let filaActual = 5;

    empleadosArr.forEach(emp => {
      worksheet.getCell(`A${filaActual}`).value = emp.numEmp;
      worksheet.getCell(`B${filaActual}`).value = emp.departamento;
      worksheet.getCell(`C${filaActual}`).value = emp.nombre;

      let colIdx = 4; 
      
      fechasUnicas.forEach(fecha => {
        const reg = emp.asistencias[fecha];
        let entradaTexto = '---';
        let salidaTexto = '---';
        let tieneRetardo = false;
        let esFalta = false; 

        if (reg) {
          if (reg.incidencia === 'LA') {
            entradaTexto = 'LA';
            salidaTexto = 'LA';
          } else if (reg.incidencia === 'EXENTO' || reg.incidencia === 'EXCENTO') {
            entradaTexto = 'EXENTO';
            salidaTexto = 'EXENTO';
          } else {
            entradaTexto = reg.entrada || '---';
            salidaTexto = reg.salida || '---';
            
            if (reg.minutosRetardo > 0) tieneRetardo = true;
          }
        } else {
          const fechaObj = new Date(`${fecha}T12:00:00Z`);
          const diaSemana = fechaObj.getDay(); 
          const esFinSemana = (diaSemana === 0 || diaSemana === 6);
          const regimenC = String(emp.regimen || '').toUpperCase().trim();

          if (regimenC === 'EXENTO' || regimenC === 'EXCENTO') {
            entradaTexto = 'EXENTO';
            salidaTexto = 'EXENTO';
          } else if (emp.horarioId === 2 && !esFinSemana) {
            entradaTexto = 'SR';
            salidaTexto = 'SR';
            esFalta = true;
          } else if (emp.horarioId === 3 || regimenC === 'LISTA') {
             entradaTexto = 'LA';
             salidaTexto = 'LA';
          } else {
            entradaTexto = '---';
            salidaTexto = '---';
          }
        }

        const celdaEntrada = worksheet.getCell(filaActual, colIdx);
        const celdaSalida = worksheet.getCell(filaActual, colIdx + 1);

        celdaEntrada.value = entradaTexto;
        celdaSalida.value = salidaTexto;

        celdaEntrada.alignment = { horizontal: 'center' };
        celdaSalida.alignment = { horizontal: 'center' };

        if (tieneRetardo) {
          celdaEntrada.font = { color: { argb: 'FFCC0000' }, bold: true };
        } else if (esFalta) {
          celdaEntrada.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD32F2F' } };
          celdaEntrada.font = { color: { argb: 'FFFFFFFF' }, bold: true };
          
          celdaSalida.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD32F2F' } };
          celdaSalida.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        }

        colIdx += 2; 
      });

      filaActual++; 
    });

    res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Asistencia_Oficial.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Error al generar Excel con plantilla:", error);
    res.status(500).json({ error: 'No se pudo generar el archivo oficial.' });
  }
});

module.exports = router;