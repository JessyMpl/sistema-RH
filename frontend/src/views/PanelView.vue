<script setup>
import { ref, computed, watch } from 'vue'; 
import Swal from 'sweetalert2'; 
import { apiUrl } from '@/utils/api';
import SidebarRH from '@/components/SidebarRH.vue';
import GestionEmpleados from '@/components/GestionEmpleados.vue';
import Consultas from '@/components/Consultas.vue';
import Justificaciones from '@/components/GestionJustificaciones.vue';
import ReporteFinal from '@/components/ReporteFinal.vue';
import Attendance from '@/components/Attendance.vue';
import ModuloSanciones from '@/components/ModuloSanciones.vue';
import ModuloAdministracion from '@/components/ModuloAdministracion.vue';

const vistaActiva = ref('reporte'); 

// CONTROL DE PESTAÑAS DE ORIGEN DE DATOS
const metodoCarga = ref('cron'); // 'excel' o 'cron'
const fechaInicio = ref('');
const fechaFin = ref('');

const archivoSeleccionado = ref(null);
const mensajeStatus = ref('');
const estaSubiendo = ref(false);
const estaGuardando = ref(false); 

const datosExtraidos = ref(null); 
const datosParaGuardarBD = ref(null); 
const existenDatosPreviosBD = ref(false); 

const vistaActual = ref('validacion'); 

const valorBusqueda = ref('');
const columnasTabla = [
  { text: "NUM. EMP", value: "numEmp", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "nombre", sortable: true },
  { text: "FECHA", value: "fecha", sortable: true },
  { text: "ENTRADA", value: "entrada" },
  { text: "SALIDA", value: "salida" },
  { text: "ESTATUS", value: "estatus", sortable: true }
];

const seleccionarArchivo = (event) => {
  archivoSeleccionado.value = event.target.files[0];
  mensajeStatus.value = '';
  datosExtraidos.value = null; 
  datosParaGuardarBD.value = null;
  existenDatosPreviosBD.value = false; 
  vistaActual.value = 'validacion'; 
};

// =========================================================
//  MÉTODO A: PROCESAR DESDE DATOS RECIBIDOS DE CRON
// =========================================================
const procesarDesdeCron = async () => {
  if (!fechaInicio.value || !fechaFin.value) {
    Swal.fire({ icon: 'warning', title: '¡Faltan fechas!', text: 'Por favor, selecciona la fecha de inicio y fin del periodo.', confirmButtonColor: '#902c3e' });
    return;
  }

  estaSubiendo.value = true;
  mensajeStatus.value = ''; 

  Swal.fire({
    title: '¡Sincronizando Biométrico! ',
    html: 'Extrayendo checadas crudas y cruzando horarios. Solo tomará unos segundos...',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const respuesta = await fetch(apiUrl('/api/excel/previsualizar-desde-bd'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        inicio: fechaInicio.value, 
        fin: fechaFin.value 
      })
    });
    
    const data = await respuesta.json();
    
    if (respuesta.ok) {
      Swal.fire({ icon: 'success', title: '¡Sincronización terminada!', text: 'Revisa los datos en la tabla antes de guardarlos.', confirmButtonColor: '#902c3e' });
      
      datosExtraidos.value = data.datosVisuales; 
      datosParaGuardarBD.value = data.datosParaGuardar; 
      existenDatosPreviosBD.value = data.existenDatosPrevios || false; 
      vistaActual.value = 'validacion'; 
    } else {
      Swal.fire({ icon: 'error', title: '¡Ups!', text: data.error || 'Hubo un error al procesar los datos de la base.', confirmButtonColor: '#902c3e' });
    }
  } catch (error) {
    Swal.fire({ icon: 'error', title: 'Error de conexión', text: 'No se pudo contactar al servidor.', confirmButtonColor: '#902c3e' });
  } finally {
    const selectorVelas = document.getElementById("canvas");
    estaSubiendo.value = false;
  }
};

// =========================================================
//  MÉTODO B: PROCESAR DESDE ARCHIVO EXCEL
// =========================================================
const subirExcel = async () => {
  if (!archivoSeleccionado.value) {
    Swal.fire({ icon: 'warning', title: '¡Falta el archivo!', text: 'Por favor, selecciona un archivo Excel primero.', confirmButtonColor: '#902c3e' });
    return;
  }
  
  estaSubiendo.value = true;
  mensajeStatus.value = ''; 
  
  const formData = new FormData();
  formData.append('archivoExcel', archivoSeleccionado.value);

  Swal.fire({
    title: '¡Analizando archivo! ',
    html: 'Calculando retardos, omisiones y faltas. Solo tomará unos segundos...',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const respuesta = await fetch(apiUrl('/api/excel/previsualizar-asistencias'), {
      method: 'POST',
      body: formData
    });
    
    const data = await respuesta.json();
    
    if (respuesta.ok) {
      Swal.fire({ icon: 'success', title: '¡Análisis terminado!', text: 'Revisa los datos en la tabla antes de guardarlos.', confirmButtonColor: '#902c3e' });
      
      datosExtraidos.value = data.datosVisuales; 
      datosParaGuardarBD.value = data.datosParaGuardar; 
      existenDatosPreviosBD.value = data.existenDatosPrevios || false; 
      vistaActual.value = 'validacion'; 
    } else {
      Swal.fire({ icon: 'error', title: '¡Ups!', text: data.error || 'Hubo un error al leer el archivo.', confirmButtonColor: '#902c3e' });
    }
  } catch (error) {
    Swal.fire({ icon: 'error', title: 'Error de conexión', text: 'No se pudo contactar al servidor.', confirmButtonColor: '#902c3e' });
  } finally {
    estaSubiendo.value = false;
  }
};

const confirmarYGuardar = async () => {
  if (existenDatosPreviosBD.value) {
    const confirmacion = await Swal.fire({
      title: '⚠️ ¿Sobrescribir esta Quincena?',
      html: 'El sistema detectó que <b>ya existen registros y justificaciones guardadas</b> para estas fechas.<br><br>Si continúas, <b>se borrará TODO tu trabajo manual anterior</b> de esta quincena para empezar de cero.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, borrar y sobrescribir todo',
      cancelButtonText: 'Cancelar y mantener mi trabajo'
    });

    if (!confirmacion.isConfirmed) {
      return; 
    }
  }

  estaGuardando.value = true;

  Swal.fire({
    title: '¡Guardando en Base de Datos! 🚀',
    html: 'Inyectando los registros... No cierres la ventana.',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const respuesta = await fetch(apiUrl('/api/excel/guardar-asistencias'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datosParaGuardar: datosParaGuardarBD.value })
    });
    
    const data = await respuesta.json();
    
    if (respuesta.ok) {
      Swal.fire({ icon: 'success', title: '¡Guardado Exitoso!', text: data.mensaje, confirmButtonColor: '#16a34a' });
      datosParaGuardarBD.value = null; 
      existenDatosPreviosBD.value = false;
    } else {
      Swal.fire({ icon: 'error', title: 'Error al guardar', text: data.error, confirmButtonColor: '#902c3e' });
    }
  } catch (error) {
    Swal.fire({ icon: 'error', title: 'Error de red', text: 'Falló la conexión al guardar.', confirmButtonColor: '#902c3e' });
  } finally {
    estaGuardando.value = false;
  }
};

watch(metodoCarga, () => {
  archivoSeleccionado.value = null;
  fechaInicio.value = '';
  fechaFin.value = '';
  datosExtraidos.value = null;
  datosParaGuardarBD.value = null;
  existenDatosPreviosBD.value = false;
  vistaActual.value = 'validacion';
});

const diasSabana = computed(() => {
  if (!datosExtraidos.value || datosExtraidos.value.length === 0) return [];
  return [...new Set(datosExtraidos.value.map(d => d.fecha))].sort();
});

const descargarExcel = async () => {
  try {
    let url = apiUrl('/api/excel/descargar-reporte');

    if (diasSabana.value && diasSabana.value.length > 0) {
      const fechaMin = diasSabana.value[0];
      const fechaMax = diasSabana.value[diasSabana.value.length - 1];
      url += `?inicio=${fechaMin}&fin=${fechaMax}`; 
    } else {
      Swal.fire({ icon: 'warning', title: 'Atención', text: 'No hay datos procesados en pantalla para descargar.', confirmButtonColor: '#902c3e' });
      return;
    }

    const respuesta = await fetch(url, { method: 'GET' });
    
    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(errorData.error || 'Error al generar el archivo');
    }
    
    const blob = await respuesta.blob();
    const urlBlob = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = urlBlob;
    
    const fechaMin = diasSabana.value[0];
    link.setAttribute('download', `Sabana_Quincenal_${fechaMin}.xlsx`);
    
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(urlBlob);

  } catch (error) {
    console.error("Error al bajar el Excel:", error);
    Swal.fire({ icon: 'error', title: 'Error de descarga', text: error.message || 'Hubo un problema al generar el reporte.', confirmButtonColor: '#902c3e'});
  }
};

const tituloReporte = computed(() => {
  if (!diasSabana.value || diasSabana.value.length === 0) return '';
  const primeraFecha = new Date(`${diasSabana.value[0]}T12:00:00Z`);
  const dia = primeraFecha.getDate();
  const mesIndex = primeraFecha.getMonth();
  const anio = primeraFecha.getFullYear();
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const quincena = dia <= 15 ? 'PRIMERA' : 'SEGUNDA';
  return `REPORTE ${quincena} QUINCENA DEL MES DE ${meses[mesIndex].toUpperCase()} DE ${anio}`;
});

const datosPivotados = computed(() => {
  if (!datosExtraidos.value || datosExtraidos.value.length === 0) return [];
  const empleadosMap = {};
  datosExtraidos.value.forEach(registro => {
    if (!empleadosMap[registro.numEmp]) {
      empleadosMap[registro.numEmp] = { numEmp: registro.numEmp, nombre: registro.nombre, departamento: registro.departamento, asistencias: {} };
    }
    empleadosMap[registro.numEmp].asistencias[registro.fecha] = registro;
  });
  
  return Object.values(empleadosMap).map(emp => {
    let faltasPuntualidad = 0;
    let faltasAsistencia = 0;
    let totalMinutos = 0; 
    
    diasSabana.value.forEach(fecha => {
      const reg = emp.asistencias[fecha];
      
      if (reg) {
        if (reg.estatus.includes('RETARDO')) faltasPuntualidad++;
        if (reg.estatus === 'FALTA') faltasAsistencia++;
        if (reg.minutosRetardo && reg.minutosRetardo > 0) {
          totalMinutos += Number(reg.minutosRetardo);
        }
      }
    });
    
    return { 
      ...emp, 
      totalPuntualidad: faltasPuntualidad, 
      totalAsistencia: faltasAsistencia,
      totalMinutos: totalMinutos 
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
});

const busquedaSabana = ref('');
const elementosPorPaginaSabana = ref(15);
const paginaActualSabana = ref(1);

const sabanaFiltrada = computed(() => {
  let filtrados = datosPivotados.value;
  if (busquedaSabana.value) {
    const query = busquedaSabana.value.toLowerCase();
    filtrados = filtrados.filter(emp =>
      emp.nombre.toLowerCase().includes(query) ||
      emp.numEmp.toLowerCase().includes(query) ||
      (emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || '').toLowerCase().includes(query)
    );
  }
  return filtrados;
});

const paginasTotalesSabana = computed(() => Math.ceil(sabanaFiltrada.value.length / elementosPorPaginaSabana.value));

const sabanaPaginada = computed(() => {
  const inicio = (paginaActualSabana.value - 1) * elementosPorPaginaSabana.value;
  return sabanaFiltrada.value.slice(inicio, inicio + elementosPorPaginaSabana.value);
});

watch(busquedaSabana, () => {
  paginaActualSabana.value = 1;
});

const getDia = (fechaString) => parseInt(fechaString.split('-')[2], 10);
</script>

<template>
  <div class="min-h-screen bg-gray-100 flex">
    <SidebarRH :vistaActiva="vistaActiva" @cambiar-vista="(nuevaVista) => vistaActiva = nuevaVista" />

   <main class="flex-1 ml-64 p-8 pt-24 min-h-screen overflow-y-auto"> <!-- Contenido principal ajuste de espacio superior  entre el contendor y el logo en pt-20 -->
      
      <div v-if="vistaActiva === 'reporte'" class="bg-white rounded-lg shadow-md p-6 border-t-4 border-inst-primario">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Sistematizar Datos de Asistencia</h1>
        
        <div class="flex gap-6 mb-6 border-b border-gray-200">
          <button @click="metodoCarga = 'cron'" 
                  :class="metodoCarga === 'cron' ? 'border-inst-primario text-inst-primario border-b-2 font-bold' : 'text-gray-500 font-medium hover:text-gray-800'" 
                  class="pb-2 px-2 transition-colors flex items-center gap-2 cursor-pointer">
            <i class="fa-solid fa-server text-blue-600"></i> Procesar datos de CRON
          </button>
           <button @click="metodoCarga = 'excel'" 
                  :class="metodoCarga === 'excel' ? 'border-inst-primario text-inst-primario border-b-2 font-bold' : 'text-gray-500 font-medium hover:text-gray-800'" 
                  class="pb-2 px-2 transition-colors flex items-center gap-2 cursor-pointer">
            <i class="fa-solid fa-file-excel text-green-600"></i> Carga Manual (Excel)
          </button>
        </div>

        <div v-if="metodoCarga === 'excel'" class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors mb-6 relative group">
          <i class="fa-solid fa-cloud-arrow-up text-5xl text-gray-400 group-hover:text-inst-primario group-hover:scale-110 transition-all duration-300 mb-4 block"></i>
          
          <p class="text-gray-600 font-medium mb-6">
            <i class="fas fa-file-excel text-green-600 mr-2 text-lg"></i>
            Carga el archivo Excel (.xlsx, .xls) extraído del reloj checador.
          </p>
          
          <div class="flex flex-col items-center justify-center gap-4">
            <input type="file" accept=".xlsx, .xls" @change="seleccionarArchivo"
              class="block w-full max-w-sm text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-inst-primario/10 file:text-inst-primario hover:file:bg-inst-primario/20 cursor-pointer transition"
            /> 
            
            <button @click="subirExcel" :disabled="estaSubiendo"
              class="mt-4 bg-inst-primario hover:bg-inst-secundario disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-md shadow-sm transition flex items-center gap-2 cursor-pointer">
              <i class="fa-solid" :class="estaSubiendo ? 'fa-spinner fa-spin' : 'fa-magnifying-glass-chart'"></i>
              {{ estaSubiendo ? 'Analizando...' : 'Analizar Datos' }}
            </button>
          </div>
        </div>

        <div v-if="metodoCarga === 'cron'" class="border-2 border-dashed border-gray-300 rounded-lg p-8 bg-gray-50 mb-6">
          <div class="text-center mb-6">
            <i class="fa-solid fa-calendar-days text-5xl text-gray-400 mb-4 block"></i>
            <p class="text-gray-600 font-medium">Selecciona el rango de fechas que deseas procesar directamente desde las lecturas de la base de datos.</p>
          </div>

          <div class="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-xl mx-auto">
            <div class="w-full">
              <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Fecha Inicio</label>
              <input type="date" v-model="fechaInicio" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-inst-primario bg-white cursor-pointer" />
            </div>
            <div class="w-full">
              <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Fecha Fin</label>
              <input type="date" v-model="fechaFin" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-inst-primario bg-white cursor-pointer" />
            </div>
            <div class="w-full sm:w-auto mt-5">
              <button @click="procesarDesdeCron" :disabled="estaSubiendo" class="w-full bg-inst-primario hover:bg-inst-secundario disabled:opacity-50 text-white font-bold py-2 px-6 rounded-md shadow-sm transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer">
                <i class="fa-solid" :class="estaSubiendo ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'"></i>
                {{ estaSubiendo ? 'Procesando...' : 'Procesar Datos' }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="datosExtraidos && datosExtraidos.length > 0" class="mt-8">
          
          <div class="flex justify-between mb-6 border-b border-gray-200 pb-4">
            <div class="flex space-x-4">
              <button @click="vistaActual = 'validacion'" :class="vistaActual === 'validacion' ? 'bg-inst-secundario text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition cursor-pointer">
               <i class="fas fa-eye mr-2"></i> Validar Registros
              </button>
              <button @click="vistaActual = 'sabana'" :class="vistaActual === 'sabana' ? 'bg-inst-secundario text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition cursor-pointer">
                <i class="fas fa-table mr-2"></i>  
                Sábana Quincenal
              </button>
            </div>
            
            <button v-if="datosParaGuardarBD" @click="confirmarYGuardar" :disabled="estaGuardando" class="bg-inst-primario hover:bg-inst-secundario text-white font-bold py-2 px-6 rounded-lg shadow-md transition flex items-center gap-2 cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z"/></svg>
              {{ estaGuardando ? 'Guardando...' : 'Guardar en BD' }}
            </button>
          </div>

          <div v-if="vistaActual === 'validacion'">
            <div class="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
              <div class="mb-4 flex items-center">
                <span class="mr-2 text-gray-500 font-bold"> Buscar:</span>
                <input type="text" v-model="valorBusqueda" placeholder="Buscar por nombre o número..." class="border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <EasyDataTable
                :headers="columnasTabla"
                :items="datosExtraidos"
                :search-value="valorBusqueda"
                theme-color="#902c3e"
                buttons-pagination
                :rows-per-page="50"
                class="font-mono text-sm img-strattia-style"
              >
                <template #item-entrada="item">
                  <span v-if="String(item.estatus || '').trim().toUpperCase() === 'BAJA'" class="text-gray-400 font-bold tracking-widest text-xs">BAJA</span>
                  <span v-else :class="{'text-red-600 font-bold': String(item.estatus || '').includes('RETARDO') || String(item.estatus || '') === 'FALTA', 'text-gray-700': !String(item.estatus || '').includes('RETARDO')}">
                    {{ item.entrada || 'SR' }}
                  </span>
                </template>
                
                <template #item-salida="item">
                  <span v-if="String(item.estatus || '').trim().toUpperCase() === 'BAJA'" class="text-gray-400 font-bold tracking-widest text-xs">BAJA</span>
                  <span v-else :class="{'text-red-600 font-bold': String(item.estatus || '') === 'FALTA', 'text-gray-700': String(item.estatus || '') !== 'FALTA'}">
                    {{ item.salida || 'SR' }}
                  </span>
                </template>

                <template #item-estatus="item">
                  <span v-if="String(item.estatus || '').trim().toUpperCase() === 'BAJA'" class="bg-gray-800 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Baja</span>
                  
                  <span v-else-if="item.estatus === 'OK'" class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold">Normal</span>
                  <span v-else-if="item.estatus.includes('RETARDO')" class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">Retardo ({{ item.minutosRetardo }} min)</span>
                  <span v-else-if="item.estatus === 'OK_ESPECIAL'" class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-bold">Especial</span>
                  <span v-else-if="item.estatus === 'NO ENCONTRADO'" class="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Falta en BD</span>
                  <span v-else-if="item.estatus === 'FALTA'" class="bg-red-800 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Falta</span>
                  <span v-else-if="item.estatus === 'LA'" class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">Lista</span>
                  <span v-else-if="item.estatus === 'EXENTO'" class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">Exento</span>
                  <span v-else-if="item.estatus === 'FERIADO'" class="bg-gray-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Día Inhábil</span>
                  <span v-else-if="item.estatus === 'OMISION_E'" class="bg-orange-200 text-orange-800 px-3 py-1 rounded-full text-xs font-bold">Omisión Entrada</span>
                  <span v-else-if="item.estatus === 'OMISION_S'" class="bg-orange-200 text-orange-800 px-3 py-1 rounded-full text-xs font-bold">Omisión Salida</span>
                  <span v-else class="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs">{{ item.estatus }}</span>
                </template>
              </EasyDataTable>
            </div>
          </div>
          
          <div v-if="vistaActual === 'sabana'">
            <div class="flex flex-col lg:flex-row justify-between mb-4 gap-4 items-center">
              
              <div class="flex flex-col md:flex-row gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200 w-full lg:w-auto">
                <div class="flex items-center w-full md:w-64 relative">
                  <i class="fa-solid fa-magnifying-glass absolute left-3 text-gray-400"></i>
                  <input type="text" v-model="busquedaSabana" placeholder="Buscar empleado..." class="w-full pl-9 pr-4 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:border-inst-primario text-sm" />
                </div>
                <div class="flex items-center gap-2 border-l pl-4 border-gray-200">
                  <span class="text-xs font-bold text-gray-500 uppercase">Mostrar:</span>
                  <select v-model="elementosPorPaginaSabana" class="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-inst-primario cursor-pointer bg-gray-50">
                    <option :value="15">15</option>
                    <option :value="30">30</option>
                    <option :value="50">50</option>
                    <option :value="100">100</option>
                  </select>
                </div>
              </div>

              <button v-if="datosExtraidos" @click="descargarExcel" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition duration-300 ease-in-out whitespace-nowrap cursor-pointer">
                <i class="fas fa-file-arrow-down mr-2"></i> Descargar Excel
              </button>
            </div>

            <div class="mb-0 bg-inst-vino-claro py-3 rounded-t-lg border border-inst-primario shadow-sm">
              <h2 class="text-lg font-bold text-white text-center tracking-wide">{{ tituloReporte }}</h2>
            </div>
            
            <div class="overflow-x-auto bg-white shadow-lg ring-1 ring-black ring-opacity-5 rounded-b-lg pb-4 border-l border-r border-b border-gray-200">
              <table class="min-w-full border-collapse">
                <thead class="bg-gray-100">
                  <tr>
                    <th rowspan="2" class="sticky left-0 z-20 bg-gray-100 py-2 pl-4 pr-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border border-gray-300 shadow-[1px_0_0_0_#d1d5db]">Num</th>
                    <th rowspan="2" class="sticky left-[60px] z-20 bg-gray-100 py-2 pl-4 pr-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[180px] shadow-[1px_0_0_0_#d1d5db]">Área de Adscripción</th>
                    <th rowspan="2" class="sticky left-[240px] z-20 bg-gray-100 py-2 pl-4 pr-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[250px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">Servidor Público</th>
                    <th v-for="fecha in diasSabana" :key="'head-'+fecha" colspan="2" class="py-1 text-center text-sm font-bold text-gray-800 border border-gray-300 bg-gray-200">{{ getDia(fecha) }}</th>
                    <th rowspan="2" class="bg-gray-200 py-2 px-3 text-center text-[10px] font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[80px] leading-tight">FALTAS DE <br> PUNTUALIDAD</th>
                    <th rowspan="2" class="bg-gray-200 py-2 px-3 text-center text-[10px] font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[80px] leading-tight">FALTAS DE <br> ASISTENCIA</th>
                    <th rowspan="2" class="bg-gray-200 py-2 px-3 text-center text-[10px] font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[80px] leading-tight">TOTAL MINUTOS <br> RETARDO</th>
                  </tr>
                  <tr>
                    <template v-for="fecha in diasSabana" :key="'sub-'+fecha">
                      <th class="py-1 px-2 text-center text-xs font-bold text-gray-600 border border-gray-300 bg-gray-100 min-w-[45px]">E</th>
                      <th class="py-1 px-2 text-center text-xs font-bold text-gray-600 border border-gray-300 bg-gray-100 min-w-[45px]">S</th>
                    </template>
                  </tr>
                </thead>
                <tbody class="bg-white">
                  <tr v-for="(emp, index) in sabanaPaginada" :key="emp.numEmp" class="hover:bg-blue-50 transition duration-150">
                    <td class="sticky left-0 z-10 bg-white py-2 pl-4 pr-3 text-sm text-gray-600 border border-gray-200 text-center shadow-[1px_0_0_0_#e5e7eb] tabular-nums" :class="{'bg-gray-50': index % 2 === 0}">{{ emp.numEmp }}</td>
                    <td class="sticky left-[60px] z-10 bg-white py-2 pl-4 pr-3 text-xs text-gray-700 border border-gray-200 truncate max-w-[180px] shadow-[1px_0_0_0_#e5e7eb]" :class="{'bg-gray-50': index % 2 === 0}" :title="emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || 'Sin Área'">{{ emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || 'Sin Área' }}</td>
                    <td class="sticky left-[240px] z-10 bg-white py-2 pl-4 pr-3 text-sm font-medium text-gray-900 border border-gray-200 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" :class="{'bg-gray-50': index % 2 === 0}">{{ emp.nombre }}</td>
                    <template v-for="fecha in diasSabana" :key="'data-'+fecha">
                      <template v-if="emp.asistencias[fecha]">
                        <td colspan="2" v-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'LA'" class="py-2 text-center border border-gray-200 align-middle bg-blue-50/50"><span class="font-bold text-blue-700 text-sm tracking-widest">LA</span></td>
                        <td colspan="2" v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'EXENTO'" class="py-2 text-center border border-gray-200 align-middle bg-green-50/50"><span class="font-bold text-green-700 text-sm tracking-widest">EXENTO</span></td>
                        <td colspan="2" v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'FERIADO'" class="py-2 text-center border border-gray-400 align-middle bg-gray-600"></td>
                        <td colspan="2" v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'BAJA'" class="py-2 text-center border border-gray-300 align-middle bg-gray-200"><span class="font-bold text-gray-500 text-[10px] tracking-widest">BAJA</span></td>
                        <td colspan="2" v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'NO ENCONTRADO'" class="py-2 text-center border border-gray-200 align-middle bg-red-50"><span class="text-[10px] font-bold text-red-600 tracking-wider">FALTA BD</span></td>
                        <template v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'FALTA'">
                          <td class="py-2 px-1 text-center border border-gray-300 align-middle text-xs font-bold text-white bg-red-600 tabular-nums">SR</td>
                          <td class="py-2 px-1 text-center border border-gray-300 align-middle text-xs font-bold text-white bg-red-600 tabular-nums">SR</td>
                        </template>
                        <template v-else>
                          <td class="py-2 px-1 text-center border border-gray-200 align-middle text-xs tabular-nums whitespace-nowrap transition-colors" :class="{'text-red-600 font-bold bg-red-50': String(emp.asistencias[fecha].estatus || '').includes('RETARDO'), 'text-orange-600 font-bold bg-orange-50': String(emp.asistencias[fecha].estatus || '') === 'OMISION_E', 'text-gray-700': !String(emp.asistencias[fecha].estatus || '').includes('RETARDO') && String(emp.asistencias[fecha].estatus || '') !== 'OMISION_E'}">
                            {{ emp.asistencias[fecha].entrada || (String(emp.asistencias[fecha].estatus || '').includes('ESPECIAL') ? '---' : 'SR') }}
                          </td>
                          <td class="py-2 px-1 text-center border border-gray-200 align-middle text-xs tabular-nums whitespace-nowrap transition-colors" :class="{'text-orange-600 font-bold bg-orange-50': String(emp.asistencias[fecha].estatus || '') === 'OMISION_S' || String(emp.asistencias[fecha].estatus || '') === 'RETARDO_Y_OMISION', 'text-gray-500 bg-gray-50/30': String(emp.asistencias[fecha].estatus || '') !== 'OMISION_S' && String(emp.asistencias[fecha].estatus || '') !== 'RETARDO_Y_OMISION'}">
                            {{ emp.asistencias[fecha].salida || (String(emp.asistencias[fecha].estatus || '').includes('ESPECIAL') ? '---' : 'SR') }}
                          </td>
                        </template>
                      </template>
                      <td colspan="2" v-else class="py-2 text-center border border-gray-200 align-middle bg-gray-50"><span class="text-gray-300 font-bold">-</span></td>
                    </template>
                    <td class="py-2 text-center border border-gray-300 bg-orange-50 font-bold text-orange-700 text-sm tabular-nums">{{ emp.totalPuntualidad > 0 ? emp.totalPuntualidad : '-' }}</td>
                    <td class="py-2 text-center border border-gray-300 bg-red-50 font-bold text-red-700 text-sm tabular-nums">{{ emp.totalAsistencia > 0 ? emp.totalAsistencia : '-' }}</td>
                    <td class="py-2 text-center border border-gray-300 bg-yellow-50 font-bold text-yellow-700 text-sm tabular-nums">{{ emp.totalMinutos > 0 ? emp.totalMinutos : '-' }}</td>
                  </tr>
                </tbody>
              </table>
              
              <div v-if="sabanaFiltrada.length > 0" class="mt-4 px-4 flex justify-between items-center bg-white border-t pt-4">
                <div class="text-sm text-gray-500 font-medium">
                  Mostrando <span class="font-bold text-gray-800">{{ ((paginaActualSabana - 1) * elementosPorPaginaSabana) + 1 }}</span> al
                  <span class="font-bold text-gray-800">{{ Math.min(paginaActualSabana * elementosPorPaginaSabana, sabanaFiltrada.length) }}</span> de
                  <span class="font-bold text-gray-800">{{ sabanaFiltrada.length }}</span> registros
                </div>
                <div class="flex gap-2 items-center">
                  <button @click="paginaActualSabana--" :disabled="paginaActualSabana === 1" class="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-40 hover:bg-gray-100 font-bold text-gray-600 transition disabled:cursor-not-allowed flex items-center">
                    <i class="fa-solid fa-chevron-left mr-1"></i> Ant
                  </button>
                  <span class="px-4 py-1.5 bg-inst-primario text-white font-bold rounded-md text-sm shadow-sm">
                    {{ paginaActualSabana }} / {{ paginasTotalesSabana || 1 }}
                  </span>
                  <button @click="paginaActualSabana++" :disabled="paginaActualSabana >= paginasTotalesSabana" class="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-40 hover:bg-gray-100 font-bold text-gray-600 transition disabled:cursor-not-allowed flex items-center">
                    Sig <i class="fa-solid fa-chevron-right ml-1"></i>
                  </button>
                </div>
              </div>
              <div v-else class="p-8 text-center text-gray-500 font-bold">
                <i class="fa-solid fa-folder-open text-3xl mb-2 block opacity-50"></i>
                No se encontraron resultados para la búsqueda.
              </div>

            </div>
          </div>
              
        </div>
      </div>
      <div v-else-if="vistaActiva === 'eventos'">
        <Attendance />
      </div>

      <div v-else-if="vistaActiva === 'empleados'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Gestión de Personal</h1>
        <GestionEmpleados />
      </div>
      <div v-else-if="vistaActiva === 'consultas'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Módulo de Consultas de Personal</h1>
        <Consultas />
      </div>

      <div v-else-if="vistaActiva === 'justificaciones'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Gestión de Justificaciones</h1>
        <Justificaciones />
      </div>

      <div v-else-if="vistaActiva === 'reporteFinal'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Reporte Final de Asistencias</h1>
        <ReporteFinal />
      </div>

      <div v-else-if="vistaActiva === 'sanciones'">
    <h1 class="text-2xl font-bold text-gray-800 mb-6">Gestión de Sanciones</h1>
    <ModuloSanciones /> 
 </div>

    <div v-else-if="vistaActiva === 'administracion'">
    <ModuloAdministracion /> 
 </div>

  
      
    </main>
  </div>
</template>

<style scoped>
.img-strattia-style {
  --easy-table-header-background-color: #f8fafc;
  --easy-table-header-font-color: #475569;
  --easy-table-header-font-size: 13px;
  --easy-table-body-row-font-size: 13px;
  --easy-table-border: 1px solid #e2e8f0;
  --easy-table-row-border: 1px solid #e2e8f0;
}
</style>