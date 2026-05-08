const exceljs = require('exceljs');
const path = require('path');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const prisma = require('../config/db');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/subir-asistencias', upload.single('archivoExcel'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo.' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(hoja, { raw: false });

    const empleados = await prisma.servidorPublico.findMany({ include: { horario: true } });
    const registrosPorDia = {};

    // 1. AGRUPAR Y LIMPIAR EL BIOMÉTRICO
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

    // 2. PROCESAR BIOMÉTRICO (NORMALES Y ESPECIALES 24x48)
    for (const llave in registrosPorDia) {
      const { numEmp, fecha, horas } = registrosPorDia[llave];
      const empleado = empleados.find(e => String(e.numeroEmpleado).trim() === numEmp);
      
      horas.sort(); 
      let primeraChecada = horas[0];
      let ultimaChecada = horas.length > 1 ? horas[horas.length - 1] : null;

      if (!empleado) {
        resultadosProcesados.push({ 
          numEmp, nombre: "⚠️ No registrado en BD", fecha, entrada: primeraChecada, salida: ultimaChecada, estatus: "NO ENCONTRADO", minutosRetardo: 0
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

      // --- INICIO DE NUEVA LÓGICA NORMAL CON OMISIONES ---
      if (empleado.regimen === 'NORMAL') {
        
        // REGLA DE OMISIÓN: Si solo hay 1 checada, descubrimos si es Entrada o Salida
        if (horas.length === 1) {
          const horaNum = parseInt(primeraChecada.split(':')[0], 10);
          
          if (horaNum >= 14) { 
            // Si checó a las 14:00 (2:00 PM) o más tarde, seguro es su Salida
            entradaFinal = null;
            salidaFinal = primeraChecada;
            estatus = "OMISION_E"; // Omisión de Entrada
          } else {
            // Si checó antes de las 14:00, es su Entrada
            entradaFinal = primeraChecada;
            salidaFinal = null;
            estatus = "OMISION_S"; // Omisión de Salida
          }
        } else {
          // Si hay 2 o más checadas, la última es la salida
          salidaFinal = ultimaChecada;
        }

        // CÁLCULO DE RETARDO (Solo si detectamos que sí hay una Entrada)
        if (entradaFinal && empleado.horario && empleado.horario.horaEntrada) {
          const [hEntrada, mEntrada] = empleado.horario.horaEntrada.split(':').map(Number);
          const [hReal, mReal] = entradaFinal.split(':').map(Number);
          
          const totalMinutosOficial = (hEntrada * 60) + mEntrada;
          const totalMinutosReal = (hReal * 60) + mReal;

          if (totalMinutosReal >= totalMinutosOficial + 11) {
            // Si tiene Omisión de Salida y además llegó tarde, guardamos ambos estatus
            estatus = estatus === "OMISION_S" ? "RETARDO_Y_OMISION" : "RETARDO";
            minutosRetardo = totalMinutosReal - totalMinutosOficial;
          }
        }
      } 
      // --- FIN DE NUEVA LÓGICA NORMAL ---
      // --- INICIO DE LÓGICA DE TURNOS Y RETARDOS ---
   // --- INICIO DE LÓGICA LIMPIA DE TURNOS Y RETARDOS ---
      let calcularRetardo = false;

      if (empleado.regimen === 'NORMAL') {
        if (horas.length === 1) {
          const horaNum = parseInt(primeraChecada.split(':')[0], 10);
          if (horaNum >= 14) { 
            entradaFinal = null;
            salidaFinal = primeraChecada;
            estatus = "OMISION_E"; 
          } else {
            entradaFinal = primeraChecada;
            salidaFinal = null;
            estatus = "OMISION_S"; 
          }
        } else {
          entradaFinal = primeraChecada;
          salidaFinal = ultimaChecada;
        }
        calcularRetardo = true;
      } 
      else if (empleado.regimen === 'ESPECIAL') {
        estatus = "OK_ESPECIAL";
        if (registrosPorDia[llaveAyer]) {
          // Día 2: Es su salida (no calculamos retardo aquí)
          entradaFinal = null; 
          salidaFinal = ultimaChecada || primeraChecada; 
        } else {
          // Día 1: Es su entrada (Sí le aplicamos la ley de retardos)
          entradaFinal = primeraChecada;
          salidaFinal = null; 
          calcularRetardo = true; 
        }
      }

      // --- CÁLCULO UNIVERSAL DE RETARDOS (Ley de 10 minutos) ---
      if (calcularRetardo && entradaFinal) {
        
        // 1. Buscamos su hora oficial en la BD
        let horaOficial = empleado.horario?.horaEntrada;

        // 2. Si está en blanco, el sistema deduce el turno (7 o 9)
        if (!horaOficial) {
           const horaChecada = parseInt(entradaFinal.split(':')[0], 10);
           // Si checó a las 6, 7 u 8, es del turno de las 7:00
           if (horaChecada <= 8) {
               horaOficial = '07:00';
           } else {
               // Si checó más tarde, es del turno de las 9:00
               horaOficial = '09:00';
           }
        }

        // 3. Hacemos las matemáticas de los 10 minutos
        const [hEntrada, mEntrada] = horaOficial.split(':').map(Number);
        const [hReal, mReal] = entradaFinal.split(':').map(Number);
        
        const totalMinutosOficial = (hEntrada * 60) + mEntrada;
        const totalMinutosReal = (hReal * 60) + mReal;

        const limiteTolerancia = totalMinutosOficial + 10;
        if (empleado.regimen === 'ESPECIAL') {
          console.log(`--- REPORTE VIRI ---`);
          console.log(`Nombre: ${empleado.nombreCompleto}`);
          console.log(`Hora Oficial Base: ${horaOficial}`);
          console.log(`Hora Real Checada: ${entradaFinal}`);
          console.log(`Límite (con gracia): ${limiteTolerancia} min`);
          console.log(`Real en minutos: ${totalMinutosReal} min`);
          console.log(`¿Hay Retardo?: ${totalMinutosReal > limiteTolerancia}`);
        }

        if (totalMinutosReal > limiteTolerancia) {
          // Calculamos los minutos exactos pasándose de la tolerancia
          minutosRetardo = totalMinutosReal - limiteTolerancia;
          
          if (empleado.regimen === 'NORMAL') {
            estatus = estatus === "OMISION_S" ? "RETARDO_Y_OMISION" : "RETARDO";
          } else if (empleado.regimen === 'ESPECIAL') {
            estatus = "RETARDO_ESPECIAL";
          }
        }
      }
      // --- FIN DE LÓGICA ---
      // --- FIN DE LÓGICA ---

      const fechaParaPrisma = new Date(`${fecha}T00:00:00Z`);

      await prisma.asistencia.upsert({
        where: { servidorId_fecha: { servidorId: empleado.id, fecha: fechaParaPrisma } },
        update: { entrada: entradaFinal, salida: salidaFinal, minutosRetardo, incidencia: estatus },
        create: { servidorId: empleado.id, fecha: fechaParaPrisma, entrada: entradaFinal, salida: salidaFinal, minutosRetardo, incidencia: estatus }
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

    // 3. AUTO-GENERAR LISTA DE ASISTENCIA (LUNES A VIERNES)
    const fechasUnicas = [...new Set(Object.values(registrosPorDia).map(r => r.fecha))];
    
    if (fechasUnicas.length > 0) {
      const fechasObj = fechasUnicas.map(f => new Date(`${f}T12:00:00Z`));
      const fechaMin = new Date(Math.min(...fechasObj));
      const fechaMax = new Date(Math.max(...fechasObj));

      const empleadosLista = empleados.filter(e => e.regimen === 'LISTA');

      for (let d = new Date(fechaMin); d <= fechaMax; d.setDate(d.getDate() + 1)) {
        const diaSemana = d.getDay(); 
        
        if (diaSemana !== 0 && diaSemana !== 6) { 
          const fechaStr = d.toISOString().split('T')[0];
          const fechaParaPrisma = new Date(`${fechaStr}T00:00:00Z`);

          for (const emp of empleadosLista) {
            await prisma.asistencia.upsert({
              where: { servidorId_fecha: { servidorId: emp.id, fecha: fechaParaPrisma } },
              update: { entrada: null, salida: null, minutosRetardo: 0, incidencia: "LA" },
              create: { servidorId: emp.id, fecha: fechaParaPrisma, entrada: null, salida: null, minutosRetardo: 0, incidencia: "LA" }
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
        }
      }
    }

    resultadosProcesados.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.fecha.localeCompare(b.fecha));

    res.json({
      mensaje: '¡Motor de Cruce ejecutado exitosamente!',
      diasProcesados: resultadosProcesados.length,
      datos: resultadosProcesados 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Hubo un error al intentar procesar.' });
  }
});

// --- RUTA PARA DESCARGAR LA SÁBANA OFICIAL (CON PLANTILLA Y COLORES) ---
router.get('/descargar-reporte', async (req, res) => {
  try {
    const asistencias = await prisma.asistencia.findMany({
      include: { servidor: true },
      orderBy: [{ fecha: 'asc' }]
    });

    if (asistencias.length === 0) {
      return res.status(404).json({ error: 'No hay datos para exportar.' });
    }

    // 1. Obtener fechas únicas
    const fechasUnicas = [...new Set(asistencias.map(a => a.fecha.toISOString().split('T')[0]))].sort();

    // 2. Calcular título automático (para celda B1)
    const primeraFecha = new Date(`${fechasUnicas[0]}T12:00:00Z`);
    const dia = primeraFecha.getDate();
    const mesIndex = primeraFecha.getMonth();
    const anio = primeraFecha.getFullYear();
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    const quincena = dia <= 15 ? 'PRIMERA' : 'SEGUNDA';
    const tituloReporte = `REPORTE ${quincena} QUINCENA DEL MES DE ${meses[mesIndex].toUpperCase()} DEL AÑO ${anio}`;

    // 3. Cargar tu plantilla oficial
    const workbook = new exceljs.Workbook();
    // Asegúrate de que la ruta apunte a la carpeta donde guardaste tu diseño
    const templatePath = path.join(__dirname, '../plantillas/plantilla_quincenal.xlsx');
    await workbook.xlsx.readFile(templatePath);
    
    const worksheet = workbook.getWorksheet(1); // Tomamos la primera hoja

    // 4. Llenar los datos de encabezado (Fila 1 y 2)
    worksheet.getCell('B1').value = tituloReporte;
    
    // Fecha y hora actual de generación
    const fechaGeneracion = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    worksheet.getCell('B2').value = fechaGeneracion;

    // 5. Escribir los números de los días en la fila 4
    // Empezamos en la columna D (índice 4), luego F (6), H (8)...
    let colIndexDia = 4; 
    fechasUnicas.forEach(fecha => {
     const numeroDia = parseInt(fecha.split('-')[2], 10); // Sacamos el puro "16", "17", etc.
       worksheet.getCell(4, colIndexDia).value = numeroDia;
       // Opcional: Centrar el texto del día
       worksheet.getCell(4, colIndexDia).alignment = { horizontal: 'center' };
       colIndexDia += 2; // Brincamos de 2 en 2 por la Entrada y Salida
    });

    // 6. Agrupar la información de los empleados
    const empleadosMap = {};
    asistencias.forEach(a => {
      const numEmp = a.servidor.numeroEmpleado;
      if (!empleadosMap[numEmp]) {
        empleadosMap[numEmp] = {
          numEmp,
          nombre: a.servidor.nombreCompleto,
          departamento: a.servidor.departamento,
          asistencias: {}
        };
      }
      empleadosMap[numEmp].asistencias[a.fecha.toISOString().split('T')[0]] = a;
    });

    const empleadosArr = Object.values(empleadosMap).sort((a, b) => a.nombre.localeCompare(b.nombre));

    // 7. Vaciar a los empleados a partir de la fila 5
    let filaActual = 5;

    empleadosArr.forEach(emp => {
      worksheet.getCell(`A${filaActual}`).value = emp.numEmp;
      worksheet.getCell(`B${filaActual}`).value = emp.departamento;
      worksheet.getCell(`C${filaActual}`).value = emp.nombre;

      let colIdx = 4; // Empezamos a llenar checadas desde la columna D (Entrada)
      
      fechasUnicas.forEach(fecha => {
        const reg = emp.asistencias[fecha];
        let entradaTexto = '---';
        let salidaTexto = '---';
        let tieneRetardo = false;

        if (reg) {
          if (reg.incidencia === 'LA') {
            entradaTexto = 'LA';
            salidaTexto = 'LA';
          } else {
            entradaTexto = reg.entrada || '---';
            salidaTexto = reg.salida || '---';
            
            // Si hay retardo, le ponemos el texto y activamos la bandera
            if (reg.minutosRetardo > 0) {
              tieneRetardo = true;
            }
          }
        }

        const celdaEntrada = worksheet.getCell(filaActual, colIdx);
        const celdaSalida = worksheet.getCell(filaActual, colIdx + 1);

        celdaEntrada.value = entradaTexto;
        celdaSalida.value = salidaTexto;

        // Centramos el texto de las horas
        celdaEntrada.alignment = { horizontal: 'center' };
        celdaSalida.alignment = { horizontal: 'center' };

        // 🎨 ¡MAGIA!: Si tiene retardo, pintamos la letra de rojo intenso y negritas
        if (tieneRetardo) {
          celdaEntrada.font = { color: { argb: 'FFCC0000' }, bold: true };
        }

        colIdx += 2; // Siguiente día
      });

      filaActual++; // Bajamos a la siguiente fila para el próximo empleado
    });

    // 8. Mandar el archivo de vuelta al navegador
    res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Asistencia_Oficial.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // Escribimos directamente en la respuesta (res)
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Error al generar Excel con plantilla:", error);
    res.status(500).json({ error: 'No se pudo generar el archivo oficial.' });
  }
});
module.exports = router;