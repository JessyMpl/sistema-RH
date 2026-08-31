const exceljs = require('exceljs');
const path = require('path');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const prisma = require('../config/db');

const upload = multer({ storage: multer.memoryStorage() });

// ==============================================================================
// 1. RUTA DE VISTA PREVIA (Lee el Excel, calcula, y complementa BD)
// ==============================================================================
router.post('/previsualizar-asistencias', upload.single('archivoExcel'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo.' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(hoja, { raw: false });

    const empleados = await prisma.servidorPublico.findMany({ include: { horario: true, area: true } });
    const registrosPorDia = {};

    rawData.forEach(fila => {
      let rawId = fila['Person ID'] || fila.ID || fila.id || fila.numeroEmpleado;
      const numEmp = String(rawId || '').replace(/['"]/g, '').trim().replace(/^0+/, ''); 
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

    let conteoPrimera = 0;
    let conteoSegunda = 0;

    for (const llave in registrosPorDia) {
      const dia = parseInt(registrosPorDia[llave].fecha.split('-')[2], 10);
      if (dia <= 15) conteoPrimera++;
      else conteoSegunda++;
    }

    const esSegundaQuincena = conteoSegunda > conteoPrimera;
    const registrosHistoricos = { ...registrosPorDia }; 

    for (const llave in registrosPorDia) {
      const dia = parseInt(registrosPorDia[llave].fecha.split('-')[2], 10);
      if (esSegundaQuincena && dia <= 15) delete registrosPorDia[llave];
      else if (!esSegundaQuincena && dia > 15) delete registrosPorDia[llave];
    }

    const fechasUnicas = [...new Set(Object.values(registrosPorDia).map(r => r.fecha))];
    let mapDiasInhabiles = new Map();
    let mapaDB = new Map(); // 🔥 Almacén para rescatar datos previos
    let fechaMin, fechaMax;
    
    if (fechasUnicas.length > 0) {
      const fechasObj = fechasUnicas.map(f => new Date(`${f}T12:00:00Z`));
      fechaMin = new Date(Math.min(...fechasObj));
      fechaMax = new Date(Math.max(...fechasObj));

      const diasInhabiles = await prisma.diaInhabil.findMany({
        where: {
          fecha: { 
            gte: new Date(`${fechaMin.toISOString().split('T')[0]}T00:00:00Z`), 
            lte: new Date(`${fechaMax.toISOString().split('T')[0]}T23:59:59Z`) 
          }
        }
      });
      diasInhabiles.forEach(d => mapDiasInhabiles.set(d.fecha.toISOString().split('T')[0], d.tipo));

      // Extraemos la historia previa
      const registrosExistentesDB = await prisma.asistencia.findMany({
        where: { fecha: { gte: new Date(`${fechaMin.toISOString().split('T')[0]}T00:00:00Z`), lte: new Date(`${fechaMax.toISOString().split('T')[0]}T23:59:59Z`) } }
      });
      registrosExistentesDB.forEach(r => mapaDB.set(`${r.servidorId}_${r.fecha.toISOString().split('T')[0]}`, r));
    }

    const resultadosProcesados = []; 
    const datosAProcesar = [];       

    // =========================================================
    // CICLO 1: EMPLEADOS EN EL EXCEL NUEVO
    // =========================================================
    for (const llave in registrosPorDia) {
      const { numEmp, fecha, horas } = registrosPorDia[llave];
      const empleado = empleados.find(e => String(e.numeroEmpleado).trim() === numEmp);
      
      const horasUnicas = [...new Set(horas)].sort(); 
      let primeraChecada = horasUnicas[0];
      let ultimaChecada = horasUnicas.length > 1 ? horasUnicas[horasUnicas.length - 1] : null;

      if (!empleado) {
        resultadosProcesados.push({ numEmp, nombre: "No registrado en BD", fecha, entrada: primeraChecada, salida: ultimaChecada, estatus: "NO ENCONTRADO", minutosRetardo: 0 });
        continue; 
      }

      // Validamos si ya existía para proteger la justificación
      const llaveMapaDB = `${empleado.id}_${fecha}`;
      const registroPrevioDB = mapaDB.get(llaveMapaDB);

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
      const regimenDB = String(empleado.regimen || '').toUpperCase().trim();
      
      const tipoInhabil = mapDiasInhabiles.get(fecha);
      const esDiaFeriado = tipoInhabil === 'FERIADO' || tipoInhabil === 'VACACIONES';
      const esSinContrato = tipoInhabil === 'SIN_CONTRATO';

      // Protegemos justificación
      if (registroPrevioDB && registroPrevioDB.incidencia === 'JUSTIFICADA') {
        estatus = "JUSTIFICADA";
        entradaFinal = registroPrevioDB.entrada;
        salidaFinal = registroPrevioDB.salida;
        minutosRetardo = 0;
      }
      else if (esSinContrato) {
        estatus = "SIN_CONTRATO";
        entradaFinal = null;
        salidaFinal = null;
      } 
      else if (esDiaFeriado && regimenDB !== 'ESPECIAL') {
        estatus = "FERIADO";
        entradaFinal = null;
        salidaFinal = null;
      } 
      else if (regimenDB === 'NORMAL') {
        const horaPrimera = parseInt(primeraChecada.split(':')[0], 10);
        if (horasUnicas.length === 1) {
          if (horaPrimera >= 14) { entradaFinal = null; salidaFinal = primeraChecada; estatus = "OMISION_E"; } 
          else { entradaFinal = primeraChecada; salidaFinal = null; estatus = "OMISION_S"; }
        } else {
          const horaUltima = parseInt(ultimaChecada.split(':')[0], 10);
          if (horaPrimera >= 14) { entradaFinal = null; salidaFinal = ultimaChecada; estatus = "OMISION_E"; } 
          else if (horaUltima < 14) { entradaFinal = primeraChecada; salidaFinal = null; estatus = "OMISION_S"; } 
          else { entradaFinal = primeraChecada; salidaFinal = ultimaChecada; }
        }
        calcularRetardo = true;
      } 
      else if (regimenDB === 'ESPECIAL') {
        estatus = "OK_ESPECIAL";
        if (registrosHistoricos[llaveAyer]) { entradaFinal = null; salidaFinal = ultimaChecada || primeraChecada; } 
        else { entradaFinal = primeraChecada; salidaFinal = null; calcularRetardo = true; }
      } 
      else if (regimenDB === 'LISTA') { estatus = "LA"; entradaFinal = null; salidaFinal = null; }
      else if (regimenDB === 'EXENTO' || regimenDB === 'EXCENTO') { estatus = "EXENTO"; entradaFinal = null; salidaFinal = null; }

      if (calcularRetardo && entradaFinal) {
        let horaOficial = empleado.horario?.horaEntrada;
        if (!horaOficial) {
           const horaChecada = parseInt(entradaFinal.split(':')[0], 10);
           horaOficial = horaChecada <= 8 ? '07:00' : '09:00';
        }
        const [hEntrada, mEntrada] = horaOficial.split(':').map(Number);
        const [hReal, mReal] = entradaFinal.split(':').map(Number);
        const totalMinutosOficial = (hEntrada * 60) + mEntrada;
        const totalMinutosReal = (hReal * 60) + mReal;
        const limiteTolerancia = totalMinutosOficial + 10;

        if (totalMinutosReal > limiteTolerancia) {
          minutosRetardo = totalMinutosReal - limiteTolerancia;
          if (regimenDB === 'NORMAL') estatus = estatus === "OMISION_S" ? "RETARDO_Y_OMISION" : "RETARDO";
          else if (regimenDB === 'ESPECIAL') estatus = "RETARDO_ESPECIAL";
        }
      }

      const fechaParaPrisma = new Date(`${fecha}T00:00:00Z`);
      datosAProcesar.push({ servidorId: empleado.id, fechaParaPrisma, entradaFinal, salidaFinal, minutosRetardo, estatus });

      resultadosProcesados.push({ 
        numEmp, 
        nombre: empleado.nombreCompleto, 
        departamento: empleado.area ? empleado.area.nombre : 'Sin Área', 
        fecha, 
        entrada: (esSinContrato || (esDiaFeriado && regimenDB !== 'ESPECIAL')) && estatus !== 'JUSTIFICADA' ? '---' : entradaFinal, 
        salida: (esSinContrato || (esDiaFeriado && regimenDB !== 'ESPECIAL')) && estatus !== 'JUSTIFICADA' ? '---' : salidaFinal, 
        estatus, 
        minutosRetardo
      });
    }
    
    // =========================================================
    // CICLO 2: EMPLEADOS QUE NO VENÍAN (RESCATE DESDE LA BD)
    // =========================================================
    if (fechasUnicas.length > 0) {
      const empleadosActivos = empleados.filter(emp => {
        if (emp.fechaBaja) return new Date(emp.fechaBaja) >= fechaMin; 
        return true;
      });

      for (let d = new Date(fechaMin); d <= fechaMax; d.setDate(d.getDate() + 1)) {
        const diaSemana = d.getDay(); 
        const fechaStr = d.toISOString().split('T')[0];
        const fechaParaPrisma = new Date(`${fechaStr}T00:00:00Z`);
        
        const tipoInhabil = mapDiasInhabiles.get(fechaStr);
        const esSinContrato = tipoInhabil === 'SIN_CONTRATO';
        const esDiaFeriado = tipoInhabil === 'FERIADO' || tipoInhabil === 'VACACIONES';
        const estatusInhabil = esSinContrato ? 'SIN_CONTRATO' : 'FERIADO';

        for (const emp of empleadosActivos) {
          const llaveBusqueda = `${String(emp.numeroEmpleado).trim()}_${fechaStr}`;
          
          if (!registrosPorDia[llaveBusqueda]) {
            const llaveMapaDB = `${emp.id}_${fechaStr}`;
            const registroPrevioDB = mapaDB.get(llaveMapaDB);

            // 🔥 ¡LA MAGIA! Si no venía en este Excel, pero sí en la BD, lo mantenemos intacto
            if (registroPrevioDB) {
              const entMostrar = registroPrevioDB.incidencia === 'FALTA' ? 'SR' : (registroPrevioDB.entrada || '---');
              const salMostrar = registroPrevioDB.incidencia === 'FALTA' ? 'SR' : (registroPrevioDB.salida || '---');

              datosAProcesar.push({ 
                servidorId: emp.id, fechaParaPrisma, 
                entradaFinal: registroPrevioDB.entrada, 
                salidaFinal: registroPrevioDB.salida, 
                minutosRetardo: registroPrevioDB.minutosRetardo, 
                estatus: registroPrevioDB.incidencia 
              });
              resultadosProcesados.push({ 
                numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', 
                fecha: fechaStr, 
                entrada: entMostrar, 
                salida: salMostrar, 
                estatus: registroPrevioDB.incidencia, minutosRetardo: registroPrevioDB.minutosRetardo 
              });
              continue; 
            }

            const esBajaHoy = emp.fechaBaja && fechaParaPrisma > new Date(emp.fechaBaja);
            const regimenC = String(emp.regimen || '').toUpperCase().trim();

            if (esBajaHoy) {
               datosAProcesar.push({ servidorId: emp.id, fechaParaPrisma, entradaFinal: null, salidaFinal: null, minutosRetardo: 0, estatus: "BAJA" });
               resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: 'BAJA', salida: 'BAJA', estatus: 'BAJA', minutosRetardo: 0 });
               continue; 
            }

            let generarFalta = false;
            let pintarComoFeriado = false;

            if (regimenC === 'LISTA') {
              if (diaSemana !== 0 && diaSemana !== 6) {
                const estatusReal = (esSinContrato || esDiaFeriado) ? estatusInhabil : 'LA';
                datosAProcesar.push({ servidorId: emp.id, fechaParaPrisma, entradaFinal: null, salidaFinal: null, minutosRetardo: 0, estatus: estatusReal });
                resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: '---', salida: '---', estatus: estatusReal, minutosRetardo: 0 });
              }
              continue;
            }

            if (regimenC === 'EXENTO' || regimenC === 'EXCENTO') {
              if (diaSemana !== 0 && diaSemana !== 6) {
                const estatusReal = (esSinContrato || esDiaFeriado) ? estatusInhabil : 'EXENTO';
                datosAProcesar.push({ servidorId: emp.id, fechaParaPrisma, entradaFinal: null, salidaFinal: null, minutosRetardo: 0, estatus: estatusReal });
                resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: '---', salida: '---', estatus: estatusReal, minutosRetardo: 0 });
              }
              continue;
            }

            if (esSinContrato) {
                pintarComoFeriado = true;
            } else if (regimenC === 'NORMAL') {
              if (diaSemana !== 0 && diaSemana !== 6) {
                if (esDiaFeriado) pintarComoFeriado = true;
                else generarFalta = true;
              }
            } 
            else if (regimenC === 'ESPECIAL') {
              const fechaActualDate = new Date(`${fechaStr}T12:00:00Z`);
              const fechaAyer = new Date(fechaActualDate.setDate(fechaActualDate.getDate() - 1)).toISOString().split('T')[0];
              const fechaManana = new Date(fechaActualDate.setDate(fechaActualDate.getDate() + 2)).toISOString().split('T')[0];
              
              const tuvoChecadaAyer = !!registrosPorDia[`${String(emp.numeroEmpleado).trim()}_${fechaAyer}`] || !!mapaDB.get(`${emp.id}_${fechaAyer}`);
              const tendraChecadaManana = !!registrosPorDia[`${String(emp.numeroEmpleado).trim()}_${fechaManana}`] || !!mapaDB.get(`${emp.id}_${fechaManana}`);

              if (tuvoChecadaAyer || tendraChecadaManana) generarFalta = false;
              else generarFalta = true;
            }

            if (pintarComoFeriado) {
              resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: '---', salida: '---', estatus: estatusInhabil, minutosRetardo: 0 });
            } else if (generarFalta) {
              datosAProcesar.push({ servidorId: emp.id, fechaParaPrisma, entradaFinal: null, salidaFinal: null, minutosRetardo: 0, estatus: "FALTA" });
              resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: 'SR', salida: 'SR', estatus: 'FALTA', minutosRetardo: 0 });
            } 
          }
        }
      }
    }

    resultadosProcesados.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.fecha.localeCompare(b.fecha));

    let existenDatosPrevios = false;
    if (fechasUnicas.length > 0) {
      const fechasRevisar = fechasUnicas.map(f => new Date(`${f}T00:00:00Z`));
      const conteoExistentes = await prisma.asistencia.count({ where: { fecha: { in: fechasRevisar } } });
      existenDatosPrevios = conteoExistentes > 0;
    }

    res.json({ mensaje: 'Datos analizados listos para revisión!', diasProcesados: fechasUnicas.length, datosVisuales: resultadosProcesados, datosParaGuardar: datosAProcesar, existenDatosPrevios });

  } catch (error) {
    console.error("Error previsualizando biométrico:", error);
    res.status(500).json({ error: 'Hubo un error al intentar leer el Excel.' });
  }
});

// ==============================================================================
// 1.5. RUTA DE VISTA PREVIA (Desde Base de Datos / Cron)
// ==============================================================================
router.post('/previsualizar-desde-bd', express.json(), async (req, res) => {
  try {
    const { inicio, fin } = req.body;

    if (!inicio || !fin) return res.status(400).json({ error: 'Faltan las fechas de inicio y fin para el periodo.' });

    const minDateStrSpace = `${inicio} 00:00:00`;
    const maxDateStrSpace = `${fin} 23:59:59`;
    const minDateStrT = `${inicio}T00:00:00`;
    const maxDateStrT = `${fin}T23:59:59`;

    const rawData = await prisma.attendanceRecord.findMany({
      where: { OR: [{ timestamp: { gte: minDateStrSpace, lte: maxDateStrSpace } }, { timestamp: { gte: minDateStrT, lte: maxDateStrT } }] },
      orderBy: { timestamp: 'asc' }
    });

    if (rawData.length === 0) return res.status(404).json({ error: 'No se encontraron checadas en el biométrico para este periodo.' });

    const registrosPorDia = {};
    rawData.forEach(record => {
      const numEmp = String(record.employeeId).trim().replace(/^0+/, ''); 
      const timestampTexto = String(record.timestamp).replace('T', ' '); 
      const partesTexto = timestampTexto.split(' ');
      
      if (partesTexto.length >= 2) {
        const localDateStr = partesTexto[0]; 
        const localTimeStr = partesTexto[1].substring(0, 5); 

        const llave = `${numEmp}_${localDateStr}`;
        if (!registrosPorDia[llave]) registrosPorDia[llave] = { numEmp, fecha: localDateStr, horas: [] };
        registrosPorDia[llave].horas.push(localTimeStr);
      }
    });

    const empleados = await prisma.servidorPublico.findMany({ include: { horario: true, area: true } });

    let conteoPrimera = 0;
    let conteoSegunda = 0;

    for (const llave in registrosPorDia) {
      const dia = parseInt(registrosPorDia[llave].fecha.split('-')[2], 10);
      if (dia <= 15) conteoPrimera++;
      else conteoSegunda++;
    }

    const esSegundaQuincena = conteoSegunda > conteoPrimera;
    const registrosHistoricos = { ...registrosPorDia };

    for (const llave in registrosPorDia) {
      const dia = parseInt(registrosPorDia[llave].fecha.split('-')[2], 10);
      if (esSegundaQuincena && dia <= 15) delete registrosPorDia[llave];
      else if (!esSegundaQuincena && dia > 15) delete registrosPorDia[llave];
    }

    const fechasUnicas = [...new Set(Object.values(registrosPorDia).map(r => r.fecha))];
    let mapDiasInhabiles = new Map();
    let mapaDB = new Map();
    let fechaMin, fechaMax;

    if (fechasUnicas.length > 0) {
      const fechasObj = fechasUnicas.map(f => new Date(`${f}T12:00:00Z`));
      fechaMin = new Date(Math.min(...fechasObj));
      fechaMax = new Date(Math.max(...fechasObj));

      const diasInhabiles = await prisma.diaInhabil.findMany({
        where: {
          fecha: { gte: new Date(`${fechaMin.toISOString().split('T')[0]}T00:00:00Z`), lte: new Date(`${fechaMax.toISOString().split('T')[0]}T23:59:59Z`) }
        }
      });
      diasInhabiles.forEach(d => mapDiasInhabiles.set(d.fecha.toISOString().split('T')[0], d.tipo));

      // Extraemos la historia previa
      const registrosExistentesDB = await prisma.asistencia.findMany({
        where: { fecha: { gte: new Date(`${fechaMin.toISOString().split('T')[0]}T00:00:00Z`), lte: new Date(`${fechaMax.toISOString().split('T')[0]}T23:59:59Z`) } }
      });
      registrosExistentesDB.forEach(r => mapaDB.set(`${r.servidorId}_${r.fecha.toISOString().split('T')[0]}`, r));
    }

    const resultadosProcesados = []; 
    const datosAProcesar = [];       

    for (const llave in registrosPorDia) {
      const { numEmp, fecha, horas } = registrosPorDia[llave];
      const empleado = empleados.find(e => String(e.numeroEmpleado).trim() === numEmp);
      
      const horasUnicas = [...new Set(horas)].sort(); 
      let primeraChecada = horasUnicas[0];
      let ultimaChecada = horasUnicas.length > 1 ? horasUnicas[horasUnicas.length - 1] : null;

      if (!empleado) {
        resultadosProcesados.push({ numEmp, nombre: "No registrado en BD", fecha, entrada: primeraChecada, salida: ultimaChecada, estatus: "NO ENCONTRADO", minutosRetardo: 0 });
        continue; 
      }

      const llaveMapaDB = `${empleado.id}_${fecha}`;
      const registroPrevioDB = mapaDB.get(llaveMapaDB);

      let estatus = "OK";
      let minutesRetardo = 0;
      let entradaFinal = primeraChecada;
      let salidaFinal = ultimaChecada;
      
      const fechaActual = new Date(`${fecha}T12:00:00Z`);
      const ayer = new Date(fechaActual);
      ayer.setDate(ayer.getDate() - 1);
      const fechaAyer = ayer.toISOString().split('T')[0]; 
      const llaveAyer = `${numEmp}_${fechaAyer}`;

      let calcularRetardo = false;
      const regimenDB = String(empleado.regimen || '').toUpperCase().trim();
      
      const tipoInhabil = mapDiasInhabiles.get(fecha);
      const esDiaFeriado = tipoInhabil === 'FERIADO' || tipoInhabil === 'VACACIONES';
      const esSinContrato = tipoInhabil === 'SIN_CONTRATO';

      if (registroPrevioDB && registroPrevioDB.incidencia === 'JUSTIFICADA') {
        estatus = "JUSTIFICADA";
        entradaFinal = registroPrevioDB.entrada;
        salidaFinal = registroPrevioDB.salida;
        minutesRetardo = 0;
      }
      else if (esSinContrato) {
        estatus = "SIN_CONTRATO";
        entradaFinal = null;
        salidaFinal = null;
      } 
      else if (esDiaFeriado && regimenDB !== 'ESPECIAL') {
        estatus = "FERIADO";
        entradaFinal = null;
        salidaFinal = null;
      } 
      else if (regimenDB === 'NORMAL') {
        const horaPrimera = parseInt(primeraChecada.split(':')[0], 10);
        if (horasUnicas.length === 1) {
          if (horaPrimera >= 14) { entradaFinal = null; salidaFinal = primeraChecada; estatus = "OMISION_E"; } 
          else { entradaFinal = primeraChecada; salidaFinal = null; estatus = "OMISION_S"; }
        } else {
          const horaUltima = parseInt(ultimaChecada.split(':')[0], 10);
          if (horaPrimera >= 14) { entradaFinal = null; salidaFinal = ultimaChecada; estatus = "OMISION_E"; } 
          else if (horaUltima < 14) { entradaFinal = primeraChecada; salidaFinal = null; estatus = "OMISION_S"; } 
          else { entradaFinal = primeraChecada; salidaFinal = ultimaChecada; }
        }
        calcularRetardo = true;
      } 
      else if (regimenDB === 'ESPECIAL') {
        estatus = "OK_ESPECIAL";
        if (registrosHistoricos[llaveAyer]) { entradaFinal = null; salidaFinal = ultimaChecada || primeraChecada; } 
        else { entradaFinal = primeraChecada; salidaFinal = null; calcularRetardo = true; }
      } 
      else if (regimenDB === 'LISTA') { estatus = "LA"; entradaFinal = null; salidaFinal = null; }
      else if (regimenDB === 'EXENTO' || regimenDB === 'EXCENTO') { estatus = "EXENTO"; entradaFinal = null; salidaFinal = null; }

      if (calcularRetardo && entradaFinal) {
        let horaOficial = empleado.horario?.horaEntrada;
        if (!horaOficial) {
           const horaChecada = parseInt(entradaFinal.split(':')[0], 10);
           horaOficial = horaChecada <= 8 ? '07:00' : '09:00';
        }
        const [hEntrada, mEntrada] = horaOficial.split(':').map(Number);
        const [hReal, mReal] = entradaFinal.split(':').map(Number);
        const totalMinutosOficial = (hEntrada * 60) + mEntrada;
        const totalMinutosReal = (hReal * 60) + mReal;
        const limiteTolerancia = totalMinutosOficial + 10;

        if (totalMinutosReal > limiteTolerancia) {
          minutesRetardo = totalMinutosReal - limiteTolerancia;
          if (regimenDB === 'NORMAL') estatus = estatus === "OMISION_S" ? "RETARDO_Y_OMISION" : "RETARDO";
          else if (regimenDB === 'ESPECIAL') estatus = "RETARDO_ESPECIAL";
        }
      }

      const fechaParaPrisma = new Date(`${fecha}T00:00:00Z`);
      datosAProcesar.push({ servidorId: empleado.id, fechaParaPrisma, entradaFinal, salidaFinal, minutosRetardo: minutesRetardo, estatus });
      
      resultadosProcesados.push({ 
        numEmp, 
        nombre: empleado.nombreCompleto, 
        departamento: empleado.area ? empleado.area.nombre : 'Sin Área', 
        fecha, 
        entrada: (esSinContrato || (esDiaFeriado && regimenDB !== 'ESPECIAL')) && estatus !== 'JUSTIFICADA' ? '---' : entradaFinal, 
        salida: (esSinContrato || (esDiaFeriado && regimenDB !== 'ESPECIAL')) && estatus !== 'JUSTIFICADA' ? '---' : salidaFinal,  
        estatus, 
        minutosRetardo: minutesRetardo 
      });
    }

    if (fechasUnicas.length > 0) {
      const empleadosActivos = empleados.filter(emp => {
        if (emp.fechaBaja) return new Date(emp.fechaBaja) >= fechaMin; 
        return true;
      });

      for (let d = new Date(fechaMin); d <= fechaMax; d.setDate(d.getDate() + 1)) {
        const diaSemana = d.getDay(); 
        const fechaStr = d.toISOString().split('T')[0];
        const fechaParaPrisma = new Date(`${fechaStr}T00:00:00Z`);
        
        const tipoInhabil = mapDiasInhabiles.get(fechaStr);
        const esSinContrato = tipoInhabil === 'SIN_CONTRATO';
        const esDiaFeriado = tipoInhabil === 'FERIADO' || tipoInhabil === 'VACACIONES';
        const estatusInhabil = esSinContrato ? 'SIN_CONTRATO' : 'FERIADO';

        for (const emp of empleadosActivos) {
          const llaveBusqueda = `${String(emp.numeroEmpleado).trim()}_${fechaStr}`;
          
          if (!registrosPorDia[llaveBusqueda]) {
            const llaveMapaDB = `${emp.id}_${fechaStr}`;
            const registroPrevioDB = mapaDB.get(llaveMapaDB);

            // 🔥 MERGE DB COMPLEMENTARIO
            if (registroPrevioDB) {
              const entMostrar = registroPrevioDB.incidencia === 'FALTA' ? 'SR' : (registroPrevioDB.entrada || '---');
              const salMostrar = registroPrevioDB.incidencia === 'FALTA' ? 'SR' : (registroPrevioDB.salida || '---');

              datosAProcesar.push({ 
                servidorId: emp.id, fechaParaPrisma, 
                entradaFinal: registroPrevioDB.entrada, 
                salidaFinal: registroPrevioDB.salida, 
                minutosRetardo: registroPrevioDB.minutosRetardo, 
                estatus: registroPrevioDB.incidencia 
              });
              resultadosProcesados.push({ 
                numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', 
                fecha: fechaStr, 
                entrada: entMostrar, 
                salida: salMostrar, 
                estatus: registroPrevioDB.incidencia, minutosRetardo: registroPrevioDB.minutosRetardo 
              });
              continue; 
            }

            const esBajaHoy = emp.fechaBaja && fechaParaPrisma > new Date(emp.fechaBaja);
            const regimenC = String(emp.regimen || '').toUpperCase().trim();

            if (esBajaHoy) {
               datosAProcesar.push({ servidorId: emp.id, fechaParaPrisma, entradaFinal: null, salidaFinal: null, minutosRetardo: 0, estatus: "BAJA" });
               resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: 'BAJA', salida: 'BAJA', estatus: 'BAJA', minutosRetardo: 0 });
               continue; 
            }

            let generarFalta = false;
            let pintarComoFeriado = false;

            if (regimenC === 'LISTA') {
              if (diaSemana !== 0 && diaSemana !== 6) {
                const estatusReal = (esSinContrato || esDiaFeriado) ? estatusInhabil : 'LA';
                datosAProcesar.push({ servidorId: emp.id, fechaParaPrisma, entradaFinal: null, salidaFinal: null, minutosRetardo: 0, estatus: estatusReal });
                resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: '---', salida: '---', estatus: estatusReal, minutosRetardo: 0 });
              }
              continue;
            }

            if (regimenC === 'EXENTO' || regimenC === 'EXCENTO') {
              if (diaSemana !== 0 && diaSemana !== 6) {
                const estatusReal = (esSinContrato || esDiaFeriado) ? estatusInhabil : 'EXENTO';
                datosAProcesar.push({ servidorId: emp.id, fechaParaPrisma, entradaFinal: null, salidaFinal: null, minutosRetardo: 0, estatus: estatusReal });
                resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: '---', salida: '---', estatus: estatusReal, minutosRetardo: 0 });
              }
              continue;
            }

            if (esSinContrato) {
                pintarComoFeriado = true;
            } else if (regimenC === 'NORMAL') {
              if (diaSemana !== 0 && diaSemana !== 6) {
                if (esDiaFeriado) pintarComoFeriado = true;
                else generarFalta = true;
              }
            } 
            else if (regimenC === 'ESPECIAL') {
              const fechaActualDate = new Date(`${fechaStr}T12:00:00Z`);
              const fechaAyer = new Date(fechaActualDate.setDate(fechaActualDate.getDate() - 1)).toISOString().split('T')[0];
              const fechaManana = new Date(fechaActualDate.setDate(fechaActualDate.getDate() + 2)).toISOString().split('T')[0];
              
              const tuvoChecadaAyer = !!registrosPorDia[`${String(emp.numeroEmpleado).trim()}_${fechaAyer}`] || !!mapaDB.get(`${emp.id}_${fechaAyer}`);
              const tendraChecadaManana = !!registrosPorDia[`${String(emp.numeroEmpleado).trim()}_${fechaManana}`] || !!mapaDB.get(`${emp.id}_${fechaManana}`);

              if (tuvoChecadaAyer || tendraChecadaManana) generarFalta = false;
              else generarFalta = true;
            }

            if (pintarComoFeriado) {
              resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: '---', salida: '---', estatus: estatusInhabil, minutosRetardo: 0 });
            } else if (generarFalta) {
              datosAProcesar.push({ servidorId: emp.id, fechaParaPrisma, entradaFinal: null, salidaFinal: null, minutosRetardo: 0, estatus: "FALTA" });
              resultadosProcesados.push({ numEmp: emp.numeroEmpleado, nombre: emp.nombreCompleto, departamento: emp.area ? emp.area.nombre : 'Sin Área', fecha: fechaStr, entrada: 'SR', salida: 'SR', estatus: 'FALTA', minutosRetardo: 0 });
            }
          }
        }
      }
    }

    resultadosProcesados.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.fecha.localeCompare(b.fecha));

    let existenDatosPrevios = false;
    if (fechasUnicas.length > 0) {
      const fechasRevisar = fechasUnicas.map(f => new Date(`${f}T00:00:00Z`));
      const conteoExistentes = await prisma.asistencia.count({ where: { fecha: { in: fechasRevisar } } });
      existenDatosPrevios = conteoExistentes > 0;
    }

    res.json({ mensaje: 'Datos procesados y fusionados desde BD!', diasProcesados: fechasUnicas.length, datosVisuales: resultadosProcesados, datosParaGuardar: datosAProcesar, existenDatosPrevios });

  } catch (error) {
    console.error("Error previsualizando desde BD:", error);
    res.status(500).json({ error: 'Hubo un error al extraer los datos de la base de datos.' });
  }
});

// ==============================================================================
// 2. RUTA DE GUARDADO (COMPLEMENTA SIN BORRAR Y SIN TIMEOUTS)
// ==============================================================================
router.post('/guardar-asistencias', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { datosParaGuardar } = req.body;

    if (!datosParaGuardar || datosParaGuardar.length === 0) {
      return res.status(400).json({ error: 'No se recibieron datos para guardar.' });
    }

    const fechasUnicasStr = [...new Set(datosParaGuardar.map(d => new Date(d.fechaParaPrisma).toISOString()))];
    const fechasObj = fechasUnicasStr.map(f => new Date(f));

    // Consultamos qué registros ya existen realmente en la base de datos
    const asistenciasViejas = await prisma.asistencia.findMany({
      where: { fecha: { in: fechasObj } },
      select: { id: true, servidorId: true, fecha: true }
    });

    const mapaViejas = new Map();
    asistenciasViejas.forEach(a => {
      mapaViejas.set(`${a.servidorId}_${a.fecha.toISOString()}`, a.id);
    });

    const datosUnicosMap = new Map();
    datosParaGuardar.forEach(dato => {
      const llaveDuplicidad = `${dato.servidorId}_${new Date(dato.fechaParaPrisma).toISOString()}`;
      datosUnicosMap.set(llaveDuplicidad, {
        servidorId: dato.servidorId,
        fecha: new Date(dato.fechaParaPrisma),
        entrada: dato.entradaFinal, // Aseguramos el nombre correcto de la variable
        salida: dato.salidaFinal,
        minutosRetardo: dato.minutosRetardo,
        incidencia: dato.estatus
      });
    });

    const toCreate = [];
    const toUpdate = [];

    // Separamos: Los nuevos se crean de golpe, los existentes se actualizan.
    datosUnicosMap.forEach((dato, llave) => {
      const idExistente = mapaViejas.get(llave);
      if (idExistente) {
         toUpdate.push({ id: idExistente, data: dato });
      } else {
         toCreate.push(dato);
      }
    });

    // 1. Inserción masiva ultra-rápida (Complemento de nuevos registros)
    if (toCreate.length > 0) {
      await prisma.asistencia.createMany({ data: toCreate });
    }

    // 2. Actualización en bloques pequeños (Para evitar el error de Transacción Timeout)
    const chunkSize = 100;
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
       const bloque = toUpdate.slice(i, i + chunkSize);
       await Promise.all(bloque.map(item => 
         prisma.asistencia.update({
           where: { id: item.id },
           data: {
             entrada: item.data.entrada,
             salida: item.data.salida,
             minutosRetardo: item.data.minutosRetardo,
             incidencia: item.data.incidencia
           }
         })
       ));
    }

    res.json({ mensaje: 'Datos complementados e integrados exitosamente sin borrar el historial.' });

  } catch (error) {
    console.error("Error guardando en BD:", error);
    res.status(500).json({ error: 'Hubo un error al guardar o complementar los datos en el servidor.' });
  }
});

// ==============================================================================
// 2.5 RUTA NUEVA: OBTENER DATOS CRUDOS PARA PREVISUALIZACIÓN DE SÁBANA
// ==============================================================================
router.get('/datos-reporte', async (req, res) => {
  try {
    const { inicio, fin } = req.query;

    if (!inicio || !fin) {
      return res.status(400).json({ error: 'Faltan los parámetros de fecha.' });
    }

    const fechaInicio = new Date(`${inicio}T00:00:00Z`);
    const fechaFin = new Date(`${fin}T23:59:59Z`);

    const asistencias = await prisma.asistencia.findMany({
      where: {
        fecha: { gte: fechaInicio, lte: fechaFin }
      },
      include: {
        servidor: {
          select: { numeroEmpleado: true, nombreCompleto: true, regimen: true, area: { select: { nombre: true } } }
        }
      },
      orderBy: [
        { fecha: 'asc' },
        { servidor: { nombreCompleto: 'asc' } }
      ]
    });

    let formateados = asistencias.map(a => ({
      ...a,
      servidor: {
        numeroEmpleado: a.servidor.numeroEmpleado,
        nombreCompleto: a.servidor.nombreCompleto,
        departamento: a.servidor.area ? a.servidor.area.nombre : 'Sin Área',
        regimen: a.servidor.regimen
      }
    }));

    // 🔥 INYECCIÓN DE FERIADOS/SIN_CONTRATO PARA REPORTE FINAL
    const diasInhabiles = await prisma.diaInhabil.findMany({
      where: { fecha: { gte: fechaInicio, lte: fechaFin } }
    });
    const mapDiasInhabiles = new Map();
    diasInhabiles.forEach(d => mapDiasInhabiles.set(d.fecha.toISOString().split('T')[0], d.tipo));

    if (mapDiasInhabiles.size > 0 && formateados.length > 0) {
      const empleadosUnicos = [...new Map(formateados.map(item => [item.servidor.numeroEmpleado, item.servidor])).values()];
      
      for (const [fechaInhabil, tipoInhabil] of mapDiasInhabiles.entries()) {
         const esSinContrato = tipoInhabil === 'SIN_CONTRATO';
         
         for (const emp of empleadosUnicos) {
            const existe = formateados.find(a => a.servidor.numeroEmpleado === emp.numeroEmpleado && a.fecha.toISOString().split('T')[0] === fechaInhabil);
            if (!existe) {
               const esEspecial = String(emp.regimen || '').toUpperCase().trim() === 'ESPECIAL';
               
               // Si es sin contrato aplica a todos. Si es feriado normal, solo si no es especial
               if (esSinContrato || !esEspecial) {
                   formateados.push({
                      id: `feriado-${emp.numeroEmpleado}-${fechaInhabil}`,
                      fecha: new Date(`${fechaInhabil}T12:00:00Z`),
                      incidencia: esSinContrato ? 'SIN_CONTRATO' : 'FERIADO',
                      entrada: '---',
                      salida: '---',
                      minutosRetardo: 0,
                      servidor: emp
                   });
               }
            }
         }
      }
    }

    res.json(formateados);

  } catch (error) {
    console.error("Error al obtener datos para previsualización:", error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ==============================================================================
// 3. RUTA PARA DESCARGAR LA SÁBANA OFICIAL 
// ==============================================================================
router.get('/descargar-reporte', async (req, res) => {
  try {
    const { inicio, fin } = req.query;

    if (!inicio || !fin) {
      return res.status(400).json({ error: 'Faltan los parámetros de fecha para generar el reporte.' });
    }

    const fechaInicio = new Date(`${inicio}T00:00:00Z`);
    const fechaFin = new Date(`${fin}T23:59:59Z`);

    const asistencias = await prisma.asistencia.findMany({
      where: {
        fecha: { gte: fechaInicio, lte: fechaFin }
      },
      include: { servidor: { include: { area: true } } }, 
      orderBy: [{ fecha: 'asc' }]
    });

    if (asistencias.length === 0) {
      return res.status(404).json({ error: 'No hay datos para exportar en este rango de fechas.' });
    }

    const diasInhabiles = await prisma.diaInhabil.findMany({
      where: { fecha: { gte: fechaInicio, lte: fechaFin } }
    });
    const mapDiasInhabiles = new Map();
    diasInhabiles.forEach(d => mapDiasInhabiles.set(d.fecha.toISOString().split('T')[0], d.tipo));

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

    worksheet.getCell(4, colIndexDia).value = 'FALTAS DE PUNTUALIDAD';
    worksheet.getCell(4, colIndexDia).font = { bold: true, size: 9 };
    worksheet.getCell(4, colIndexDia).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    worksheet.getCell(4, colIndexDia + 1).value = 'FALTAS DE ASISTENCIA';
    worksheet.getCell(4, colIndexDia + 1).font = { bold: true, size: 9 };
    worksheet.getCell(4, colIndexDia + 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    worksheet.getCell(4, colIndexDia + 2).value = 'TOTAL MINUTOS RETARDO';
    worksheet.getCell(4, colIndexDia + 2).font = { bold: true, size: 9 };
    worksheet.getCell(4, colIndexDia + 2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    const empleadosMap = {};
    asistencias.forEach(a => {
      const numEmp = a.servidor.numeroEmpleado;
      if (!empleadosMap[numEmp]) {
        empleadosMap[numEmp] = {
          numEmp,
          nombre: a.servidor.nombreCompleto,
          departamento: a.servidor.area ? a.servidor.area.nombre : 'Sin Área', 
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
      
      let totalPuntualidad = 0;
      let totalAsistencia = 0;
      let totalMinutos = 0;
      
      fechasUnicas.forEach(fecha => {
        const reg = emp.asistencias[fecha];
        let entradaTexto = '---';
        let salidaTexto = '---';
        let tieneRetardo = false;
        let esFalta = false; 
        let esFeriado = false; 
        let esLA = false; // Nueva variable
        let esEX = false; // Nueva variable

        const tipoInhabil = mapDiasInhabiles.get(fecha);
        const esSinContrato = tipoInhabil === 'SIN_CONTRATO';
        const esDiaFeriado = tipoInhabil === 'FERIADO' || tipoInhabil === 'VACACIONES';
        const regimenActual = String(emp.regimen || '').toUpperCase().trim();

        if (esSinContrato || (esDiaFeriado && regimenActual !== 'ESPECIAL')) {
          esFeriado = true;
          entradaTexto = '';
          salidaTexto = '';
        } 
        if (reg) {
          if (reg.incidencia === 'LA') {
            entradaTexto = 'LA';
            salidaTexto = 'LA';
            esLA = true;
          } else if (reg.incidencia === 'EXENTO' || reg.incidencia === 'EXCENTO') {
            entradaTexto = 'EX';
            salidaTexto = 'EX';
            esEX = true;
          } else if (reg.incidencia === 'FERIADO' || reg.incidencia === 'SIN_CONTRATO') {
            entradaTexto = '';
            salidaTexto = '';
            esFeriado = true;
          } else if (reg.incidencia === 'BAJA') {
            entradaTexto = 'BAJA';
            salidaTexto = 'BAJA';
          } else if (reg.incidencia === 'FALTA') {
            entradaTexto = 'SR';
            salidaTexto = 'SR';
            esFalta = true;
            totalAsistencia++;
          } else {
            entradaTexto = reg.entrada || '---';
            salidaTexto = reg.salida || '---';
            
            if (reg.incidencia && reg.incidencia.includes('RETARDO')) {
              tieneRetardo = true;
              totalPuntualidad++;
            }

            if (reg.minutosRetardo && reg.minutosRetardo > 0) {
              totalMinutos += Number(reg.minutosRetardo);
            }
          }
        } else {
          entradaTexto = '---';
          salidaTexto = '---';
        }

        const celdaEntrada = worksheet.getCell(filaActual, colIdx);
        const celdaSalida = worksheet.getCell(filaActual, colIdx + 1);

        celdaEntrada.value = entradaTexto;
        celdaSalida.value = salidaTexto;

        celdaEntrada.alignment = { horizontal: 'center' };
        celdaSalida.alignment = { horizontal: 'center' };

        if (tieneRetardo) {
          celdaEntrada.font = { color: { argb: 'FFCC0000' }, bold: true, size: 8 };
        } else if (esFeriado) {
          celdaEntrada.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBCBCBC' } };
          celdaSalida.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBCBCBC' } };
        }
        // AGREGAR ESTO PARA LA y EXENTO:
        if (esLA || esEX) {
          celdaEntrada.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3DCF5' } };
          celdaSalida.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3DCF5' } };
          celdaEntrada.font = { color: { argb: 'FF33539E' }, bold: true, size: 7 };
          celdaSalida.font = { color: { argb: 'FF33539E' }, bold: true, size: 7 };
        }
     // AGREGAR ESTO PARA LAS CELDAS CON "---":
        if (entradaTexto === '---') {
          celdaEntrada.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCF9E8' } };
        }
        if (salidaTexto === '---') {
          celdaSalida.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCF9E8' } };
        }

        colIdx += 2; 
      });

      worksheet.getCell(filaActual, colIdx).value = totalPuntualidad > 0 ? totalPuntualidad : '-';
      worksheet.getCell(filaActual, colIdx).alignment = { horizontal: 'center' };

      worksheet.getCell(filaActual, colIdx + 1).value = totalAsistencia > 0 ? totalAsistencia : '-';
      worksheet.getCell(filaActual, colIdx + 1).alignment = { horizontal: 'center' };

      worksheet.getCell(filaActual, colIdx + 2).value = totalMinutos > 0 ? totalMinutos : '-';
      worksheet.getCell(filaActual, colIdx + 2).alignment = { horizontal: 'center' };

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

// ==============================================================================
// 4. RUTA PARA CONSULTAR INCIDENCIAS POR RANGO DE FECHAS
// ==============================================================================
router.get('/consultar-incidencias', async (req, res) => {
  try {
    const { inicio, fin } = req.query;

    if (!inicio || !fin) {
      return res.status(400).json({ error: 'Por favor, proporciona fecha de inicio y fin.' });
    }

    const fechaInicio = new Date(`${inicio}T00:00:00Z`);
    const fechaFin = new Date(`${fin}T23:59:59Z`);

    const registros = await prisma.asistencia.findMany({
      where: {
        fecha: { gte: fechaInicio, lte: fechaFin },
        incidencia: {
          in: ['RETARDO', 'RETARDO_ESPECIAL', 'OMISION_E', 'OMISION_S', 'RETARDO_Y_OMISION', 'FALTA']
        }
      },
      include: {
        servidor: { include: { area: true } } 
      },
      orderBy: [
        { fecha: 'asc' }
      ]
    });

    const resultado = registros.map(reg => ({
      id: reg.id,
      numEmp: reg.servidor.numeroEmpleado,
      nombre: reg.servidor.nombreCompleto,
      departamento: reg.servidor.area ? reg.servidor.area.nombre : 'Sin Área', 
      regimen: reg.servidor.regimen,
      fecha: reg.fecha.toISOString().split('T')[0],
      entrada: reg.entrada || 'SR',
      salida: reg.salida || 'SR',
      estatus: reg.incidencia,
      minutosRetardo: reg.minutosRetardo
    }));

    res.json(resultado);

  } catch (error) {
    console.error("Error consultando incidencias:", error);
    res.status(500).json({ error: 'Hubo un error al consultar las incidencias.' });
  }
});

// ==============================================================================
// 5. RUTAS PARA EL MÓDULO DE CONSULTAS GENERALES
// ==============================================================================
router.get('/departamentos', async (req, res) => {
  try {
    const departamentos = await prisma.areaAdscripcion.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    });
    
    const lista = departamentos.map(d => d.nombre);
    res.json(lista);
  } catch (error) {
    console.error("Error obteniendo departamentos:", error);
    res.status(500).json({ error: 'Error al cargar las areas.' });
  }
});

router.get('/consultas-generales', async (req, res) => {
  try {
    const { inicio, fin, departamento, nombre } = req.query;

    if (!inicio || !fin) {
      return res.status(400).json({ error: 'Faltan fechas de inicio y fin.' });
    }

    const fechaInicio = new Date(`${inicio}T00:00:00Z`);
    const fechaFin = new Date(`${fin}T23:59:59Z`);

    const filtro = {
      fecha: {
        gte: fechaInicio,
        lte: fechaFin
      }
    };

    if ((departamento && departamento !== 'TODOS') || (nombre && nombre.trim() !== '')) {
      filtro.servidor = {};
      
      if (departamento && departamento !== 'TODOS') {
        filtro.servidor.area = { nombre: departamento };
      }
      
      if (nombre && nombre.trim() !== '') {
        filtro.servidor.OR = [
          { nombreCompleto: { contains: nombre.trim(), mode: 'insensitive' } },
          { numeroEmpleado: { contains: nombre.trim(), mode: 'insensitive' } }
        ];
      }
    }

    const registros = await prisma.asistencia.findMany({
      where: filtro,
      include: { servidor: { include: { area: true } } }, 
      orderBy: [
        { fecha: 'desc' },
        { servidor: { nombreCompleto: 'asc' } }
      ]
    });

    const resultado = registros.map(reg => ({
      id: reg.id,
      numEmp: reg.servidor.numeroEmpleado,
      nombre: reg.servidor.nombreCompleto,
      departamento: reg.servidor.area ? reg.servidor.area.nombre : 'Sin Área', 
      regimen: reg.servidor.regimen,
      fecha: reg.fecha.toISOString().split('T')[0],
      entrada: reg.entrada || 'SR',
      salida: reg.salida || 'SR',
      estatus: reg.incidencia,
      minutosRetardo: reg.minutosRetardo
    }));

    res.json(resultado);
  } catch (error) {
    console.error("Error en consultas generales:", error);
    res.status(500).json({ error: 'Error al consultar la base de datos.' });
  }
});

module.exports = router;