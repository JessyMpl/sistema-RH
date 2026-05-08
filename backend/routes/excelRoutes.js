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

      if (empleado.regimen === 'NORMAL') {
        if (!salidaFinal && horas.length === 1) salidaFinal = null; 
        
        if (empleado.horario && empleado.horario.horaEntrada) {
          const [hEntrada, mEntrada] = empleado.horario.horaEntrada.split(':').map(Number);
          const [hReal, mReal] = entradaFinal.split(':').map(Number);
          const totalMinutosOficial = (hEntrada * 60) + mEntrada;
          const totalMinutosReal = (hReal * 60) + mReal;

          if (totalMinutosReal >= totalMinutosOficial + 11) {
            estatus = "RETARDO";
            minutosRetardo = totalMinutosReal - totalMinutosOficial;
          }
        }
      } else if (empleado.regimen === 'ESPECIAL') {
        estatus = "OK_ESPECIAL";
        
        if (registrosPorDia[llaveAyer]) {
          entradaFinal = null; 
          salidaFinal = ultimaChecada || primeraChecada; 
        } else {
          entradaFinal = primeraChecada;
          salidaFinal = null; 
        }
      }

      const fechaParaPrisma = new Date(`${fecha}T00:00:00Z`);

      await prisma.asistencia.upsert({
        where: { servidorId_fecha: { servidorId: empleado.id, fecha: fechaParaPrisma } },
        update: { entrada: entradaFinal, salida: salidaFinal, minutosRetardo, incidencia: estatus },
        create: { servidorId: empleado.id, fecha: fechaParaPrisma, entrada: entradaFinal, salida: salidaFinal, minutosRetardo, incidencia: estatus }
      });

      // AQUÍ ESTÁ EL CAMBIO PARA LOS DEL BIOMÉTRICO
      resultadosProcesados.push({ 
        numEmp, 
        nombre: empleado.nombreCompleto, 
        departamento: empleado.departamento, // <-- Ahora sí, no se nos escapa
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

module.exports = router;