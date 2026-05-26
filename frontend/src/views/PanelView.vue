<script setup>
import { ref, computed } from 'vue'; 
import Swal from 'sweetalert2'; 
import SidebarRH from '@/components/SidebarRH.vue';
import GestionEmpleados from '@/components/GestionEmpleados.vue';
import Incidencias from '@/components/incidencias.vue';
import Consultas from '@/components/consultas.vue';
import Justificaciones from '@/components/GestionJustificaciones.vue';

const vistaActiva = ref('reporte'); 
const archivoSeleccionado = ref(null);
const mensajeStatus = ref('');
const estaSubiendo = ref(false);
const estaGuardando = ref(false); 

const datosExtraidos = ref(null); 
const datosParaGuardarBD = ref(null); 

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
  vistaActual.value = 'validacion'; 
};

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
    title: '¡Analizando archivo! ⚙️',
    html: 'Calculando retardos, omisiones y faltas. Solo tomará unos segundos...',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const respuesta = await fetch('http://localhost:3000/api/excel/previsualizar-asistencias', {
      method: 'POST',
      body: formData
    });
    
    const data = await respuesta.json();
    
    if (respuesta.ok) {
      Swal.fire({ icon: 'success', title: '¡Análisis terminado!', text: 'Revisa los datos en la tabla antes de guardarlos.', confirmButtonColor: '#902c3e' });
      
      datosExtraidos.value = data.datosVisuales; 
      datosParaGuardarBD.value = data.datosParaGuardar; 
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
  estaGuardando.value = true;

  Swal.fire({
    title: '¡Guardando en Base de Datos! 🚀',
    html: 'Inyectando los registros... No cierres la ventana.',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const respuesta = await fetch('http://localhost:3000/api/excel/guardar-asistencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datosParaGuardar: datosParaGuardarBD.value })
    });
    
    const data = await respuesta.json();
    
    if (respuesta.ok) {
      Swal.fire({ icon: 'success', title: '¡Guardado Exitoso!', text: data.mensaje, confirmButtonColor: '#16a34a' });
      datosParaGuardarBD.value = null; 
    } else {
      Swal.fire({ icon: 'error', title: 'Error al guardar', text: data.error, confirmButtonColor: '#902c3e' });
    }
  } catch (error) {
    Swal.fire({ icon: 'error', title: 'Error de red', text: 'Falló la conexión al guardar.', confirmButtonColor: '#902c3e' });
  } finally {
    estaGuardando.value = false;
  }
};


const descargarExcel = async () => {
  try {
    const respuesta = await fetch('http://localhost:3000/api/excel/descargar-reporte', { method: 'GET' });
    if (!respuesta.ok) throw new Error('Error al generar el archivo');
    const blob = await respuesta.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Sabana_Quincenal_Secretaria.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error al bajar el Excel:", error);
    alert("❌ Hubo un problema al descargar el reporte.");
  }
};

const diasSabana = computed(() => {
  if (!datosExtraidos.value || datosExtraidos.value.length === 0) return [];
  return [...new Set(datosExtraidos.value.map(d => d.fecha))].sort();
});

const tituloReporte = computed(() => {
  if (!diasSabana.value || diasSabana.value.length === 0) return '';
  const primeraFecha = new Date(`${diasSabana.value[0]}T12:00:00Z`);
  const dia = primeraFecha.getDate();
  const mesIndex = primeraFecha.getMonth();
  const anio = primeraFecha.getFullYear();
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const quincena = dia <= 15 ? 'PRIMERA' : 'SEGUNDA';
  return `REPORTE ${quincena} QUINCENA DEL MES DE ${meses[mesIndex].toUpperCase()} DEL AÑO ${anio}`;
});

// 💡 CAMBIO: Lógica simplificada basada en la inteligencia del backend
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
        
        // El backend ahora dicta quién tiene falta, respetando roles y guardias
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

const getDia = (fechaString) => parseInt(fechaString.split('-')[2], 10);

</script>

<template>
  <div class="min-h-screen bg-gray-100 flex">
    <SidebarRH :vistaActiva="vistaActiva" @cambiar-vista="(nuevaVista) => vistaActiva = nuevaVista" />

    <main class="flex-1 p-8 overflow-y-auto"> 
      
      <div v-if="vistaActiva === 'reporte'" class="bg-white rounded-lg shadow-md p-6 border-t-4 border-inst-primario">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Procesar Datos del Biometrico</h1>
        
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 mb-6 relative">
          <p class="text-gray-500 mb-6">Selecciona el archivo Excel (.xlsx, .xls) extraído del checador biométrico.</p>
          <div class="flex flex-col items-center justify-center gap-4">
            <input type="file" accept=".xlsx, .xls" @change="seleccionarArchivo"
              class="block w-full max-w-sm text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <button @click="subirExcel" :disabled="estaSubiendo"
              class="mt-4 bg-inst-primario hover:bg-inst-secundario disabled:bg-blue-400 text-white font-bold py-2 px-6 rounded-md shadow-sm transition">
              {{ estaSubiendo ? 'Analizando...' : '1. Leer y Previsualizar' }}
            </button>
          </div>
        </div>

        <div v-if="datosExtraidos && datosExtraidos.length > 0" class="mt-8">
          
          <div class="flex justify-between mb-6 border-b border-gray-200 pb-4">
            <div class="flex space-x-4">
              <button @click="vistaActual = 'validacion'" :class="vistaActual === 'validacion' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">
                📋 Validar Registros
              </button>
              <button @click="vistaActual = 'sabana'" :class="vistaActual === 'sabana' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">
                📊 Sábana Quincenal
              </button>
            </div>
            
            <button v-if="datosParaGuardarBD" @click="confirmarYGuardar" :disabled="estaGuardando" class="bg-inst-primario hover:bg-inst-secundario text-white font-bold py-2 px-6 rounded-lg shadow-md transition flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z"/></svg>
              {{ estaGuardando ? 'Guardando...' : '2. Confirmar y Guardar en BD' }}
            </button>
          </div>

          <!-- TABLA DE VALIDACIÓN -->
          <div v-if="vistaActual === 'validacion'">
            <div class="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
              
              <div class="mb-4 flex items-center">
                <span class="mr-2 text-gray-500 font-bold">🔍 Buscar:</span>
                <input type="text" v-model="valorBusqueda" placeholder="Buscar por nombre o número..." class="border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <EasyDataTable
                :headers="columnasTabla"
                :items="datosExtraidos"
                :search-value="valorBusqueda"
                theme-color="#902c3e"
                buttons-pagination
                :rows-per-page="50"
                class="font-mono text-sm"
              >
                <template #item-entrada="item">
                  <span :class="{'text-red-600 font-bold': item.estatus.includes('RETARDO') || item.estatus === 'FALTA', 'text-gray-700': !item.estatus.includes('RETARDO')}">
                    {{ item.entrada || 'SR' }}
                  </span>
                </template>
                
                <template #item-salida="item">
                  <span :class="{'text-red-600 font-bold': item.estatus === 'FALTA', 'text-gray-700': item.estatus !== 'FALTA'}">
                    {{ item.salida || 'SR' }}
                  </span>
                </template>

                <template #item-estatus="item">
                  <span v-if="item.estatus === 'OK'" class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold">Normal</span>
                  <span v-else-if="item.estatus.includes('RETARDO')" class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">Retardo ({{ item.minutosRetardo }} min)</span>
                  <span v-else-if="item.estatus === 'OK_ESPECIAL'" class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-bold">Especial</span>
                  <span v-else-if="item.estatus === 'NO ENCONTRADO'" class="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Falta en BD</span>
                  <!-- 💡 NUEVA ETIQUETA PARA FALTAS -->
                  <span v-else-if="item.estatus === 'FALTA'" class="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Falta de Asistencia</span>
                  <span v-else-if="item.estatus === 'LA'" class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">Lista</span>
                  <span v-else-if="item.estatus === 'EXENTO'" class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">Exento</span>
                  <span v-else-if="item.estatus === 'OMISION_E'" class="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold">Omisión Entrada</span>
                  <span v-else-if="item.estatus === 'OMISION_S'" class="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold">Omisión Salida</span>
                  <span v-else class="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs">{{ item.estatus }}</span>
                </template>
              </EasyDataTable>

            </div>
          </div>
          
          <!-- SÁBANA QUINCENAL -->
          <div v-if="vistaActual === 'sabana'">
            <div class="flex justify-end mb-6">
              <button v-if="datosExtraidos" @click="descargarExcel" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-300 ease-in-out">
                Descargar Reporte Excel
              </button>
            </div>
            <div class="mb-4 bg-gray-200 py-3 rounded-t-lg border-b-2 border-gray-300 shadow-sm">
              <h2 class="text-lg font-bold text-gray-800 text-center tracking-wide">{{ tituloReporte }}</h2>
            </div>
            
            <div class="overflow-x-auto bg-white shadow ring-1 ring-black ring-opacity-5 rounded-b-lg pb-4">
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
                  <tr v-for="(emp, index) in datosPivotados" :key="emp.numEmp" class="hover:bg-blue-50 transition duration-150">
                    <td class="sticky left-0 z-10 bg-white py-2 pl-4 pr-3 text-sm text-gray-600 border border-gray-200 text-center shadow-[1px_0_0_0_#e5e7eb] tabular-nums" :class="{'bg-gray-50': index % 2 === 0}">{{ emp.numEmp }}</td>
                    <td class="sticky left-[60px] z-10 bg-white py-2 pl-4 pr-3 text-xs text-gray-700 border border-gray-200 truncate max-w-[180px] shadow-[1px_0_0_0_#e5e7eb]" :class="{'bg-gray-50': index % 2 === 0}" :title="emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || 'Sin Área'">{{ emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || 'Sin Área' }}</td>
                    <td class="sticky left-[240px] z-10 bg-white py-2 pl-4 pr-3 text-sm font-medium text-gray-900 border border-gray-200 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" :class="{'bg-gray-50': index % 2 === 0}">{{ emp.nombre }}</td>
                    <template v-for="fecha in diasSabana" :key="'data-'+fecha">
                      <template v-if="emp.asistencias[fecha]">
                        <td colspan="2" v-if="emp.asistencias[fecha].estatus === 'LA'" class="py-2 text-center border border-gray-200 align-middle bg-blue-50/50"><span class="font-bold text-blue-700 text-sm tracking-widest">LA</span></td>
                        <td colspan="2" v-else-if="emp.asistencias[fecha].estatus === 'EXENTO'" class="py-2 text-center border border-gray-200 align-middle bg-green-50/50"><span class="font-bold text-green-700 text-sm tracking-widest">EXENTO</span></td>
                        <td colspan="2" v-else-if="emp.asistencias[fecha].estatus === 'NO ENCONTRADO'" class="py-2 text-center border border-gray-200 align-middle bg-red-50"><span class="text-[10px] font-bold text-red-600 tracking-wider">FALTA BD</span></td>
                        <!-- 💡 NUEVA ETIQUETA ROJA PARA FALTAS EN LA SÁBANA -->
                        <template v-else-if="emp.asistencias[fecha].estatus === 'FALTA'">
                          <td class="py-2 px-1 text-center border border-gray-300 align-middle text-xs font-bold text-white bg-red-600 tabular-nums">SR</td>
                          <td class="py-2 px-1 text-center border border-gray-300 align-middle text-xs font-bold text-white bg-red-600 tabular-nums">SR</td>
                        </template>
                        <template v-else>
                          <td class="py-2 px-1 text-center border border-gray-200 align-middle text-xs tabular-nums whitespace-nowrap transition-colors" :class="{'text-red-600 font-bold bg-red-50': emp.asistencias[fecha].estatus.includes('RETARDO'), 'text-orange-600 font-bold bg-orange-50': emp.asistencias[fecha].estatus === 'OMISION_E', 'text-gray-700': !emp.asistencias[fecha].estatus.includes('RETARDO') && emp.asistencias[fecha].estatus !== 'OMISION_E'}">
                            {{ emp.asistencias[fecha].entrada || (emp.asistencias[fecha].estatus.includes('ESPECIAL') ? '---' : 'SR') }}
                          </td>
                          <td class="py-2 px-1 text-center border border-gray-200 align-middle text-xs tabular-nums whitespace-nowrap transition-colors" :class="{'text-orange-600 font-bold bg-orange-50': emp.asistencias[fecha].estatus === 'OMISION_S' || emp.asistencias[fecha].estatus === 'RETARDO_Y_OMISION', 'text-gray-500 bg-gray-50/30': emp.asistencias[fecha].estatus !== 'OMISION_S' && emp.asistencias[fecha].estatus !== 'RETARDO_Y_OMISION'}">
                            {{ emp.asistencias[fecha].salida || (emp.asistencias[fecha].estatus.includes('ESPECIAL') ? '---' : 'SR') }}
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
            </div>
          </div>
              
        </div>
      </div>
      <div v-else-if="vistaActiva === 'empleados'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Gestión de Personal</h1>
        <GestionEmpleados />
      </div>

      <div v-else-if="vistaActiva === 'incidencias'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Incidencias</h1>
        <Incidencias />
      </div>

      <div v-else-if="vistaActiva === 'consultas'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Módulo de Consultas de Personal</h1>
        <Consultas />
      </div>

      <div v-else-if="vistaActiva === 'justificaciones'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Gestión de Justificaciones</h1>
        <Justificaciones />
      </div>
      
    </main>
  </div>
</template>