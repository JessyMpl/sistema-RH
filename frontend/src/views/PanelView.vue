<script setup>
import { ref, computed } from 'vue'; 
import SidebarRH from '@/components/SidebarRH.vue';
import GestionEmpleados from '@/components/GestionEmpleados.vue';

const vistaActiva = ref('reporte'); 
const archivoSeleccionado = ref(null);
const mensajeStatus = ref('');
const estaSubiendo = ref(false);
const datosExtraidos = ref(null);

// Variable para controlar la pestaña interna (Validación vs Sábana)
const vistaActual = ref('validacion'); 

const seleccionarArchivo = (event) => {
  archivoSeleccionado.value = event.target.files[0];
  mensajeStatus.value = '';
  datosExtraidos.value = null; 
  vistaActual.value = 'validacion'; 
};

const subirExcel = async () => {
  if (!archivoSeleccionado.value) {
    mensajeStatus.value = '⚠️ Por favor, selecciona un archivo Excel primero.';
    return;
  }
  estaSubiendo.value = true;
  mensajeStatus.value = '⏳ Subiendo y procesando archivo...';
  
  const formData = new FormData();
  formData.append('archivoExcel', archivoSeleccionado.value);

  try {
    const respuesta = await fetch('http://localhost:3000/api/excel/subir-asistencias', {
      method: 'POST',
      body: formData
    });
    
    const data = await respuesta.json();
    
    if (respuesta.ok) {
     mensajeStatus.value = `✅ ¡Éxito! ${data.mensaje} (Días limpios guardados: ${data.diasProcesados})`;
      datosExtraidos.value = data.datos; 
    } else {
      mensajeStatus.value = `❌ Error: ${data.error}`;
    }
  } catch (error) {
    mensajeStatus.value = '❌ Error al conectar con el servidor.';
  } finally {
    estaSubiendo.value = false;
  }
};

// --- LÓGICA DE LA SÁBANA QUINCENAL ---

// 1. Extraer los días únicos de la quincena
const diasSabana = computed(() => {
  if (!datosExtraidos.value || datosExtraidos.value.length === 0) return [];
  const fechas = [...new Set(datosExtraidos.value.map(d => d.fecha))].sort();
  return fechas;
});

// 1.5 Título Oficial Automático
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

// 2. Agrupar los datos por empleado
const datosPivotados = computed(() => {
  if (!datosExtraidos.value || datosExtraidos.value.length === 0) return [];
  
  const empleadosMap = {};
  
  datosExtraidos.value.forEach(registro => {
    if (!empleadosMap[registro.numEmp]) {
      empleadosMap[registro.numEmp] = {
        numEmp: registro.numEmp,
        nombre: registro.nombre,
        departamento: registro.departamento,
        asistencias: {}
      };
    }
    empleadosMap[registro.numEmp].asistencias[registro.fecha] = registro;
  });
  
  // Convertimos a arreglo y calculamos totales por cada uno
  return Object.values(empleadosMap).map(emp => {
    let faltasPuntualidad = 0;
    let faltasAsistencia = 0;

    diasSabana.value.forEach(fecha => {
      const reg = emp.asistencias[fecha];
      
      // 1. Contar Faltas de Puntualidad (Incluye Retardos y Retardos con Omisión)
      if (reg && reg.estatus.includes('RETARDO')) {
        faltasPuntualidad++;
      }

      // 2. Contar Faltas de Asistencia
      // Si no hay registro en un día que no es fin de semana
      const d = new Date(`${fecha}T12:00:00Z`);
      const esFinSemana = (d.getDay() === 0 || d.getDay() === 6);

      if (!reg && !esFinSemana) {
        faltasAsistencia++;
      }
    });

    return { 
      ...emp, 
      totalPuntualidad: faltasPuntualidad, 
      totalAsistencia: faltasAsistencia 
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
});

// 3. Función auxiliar para sacar el día ("2026-04-16" -> 16)
const getDia = (fechaString) => {
  const partes = fechaString.split('-');
  return parseInt(partes[2], 10);
};
</script>

<template>
  <div class="min-h-screen bg-gray-100 flex">
    
    <SidebarRH 
      :vistaActiva="vistaActiva" 
      @cambiar-vista="(nuevaVista) => vistaActiva = nuevaVista" 
    />

    <main class="flex-1 p-8 overflow-y-auto"> 
      
      <div v-if="vistaActiva === 'reporte'" class="bg-white rounded-lg shadow-md p-6 border-t-4 border-blue-600">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Procesar Asistencias (Excel)</h1>
        
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 mb-6">
          <p class="text-gray-500 mb-6">Selecciona el archivo Excel (.xlsx, .xls) extraído del checador biométrico.</p>
          <div class="flex flex-col items-center justify-center gap-4">
            <input type="file" accept=".xlsx, .xls" @change="seleccionarArchivo"
              class="block w-full max-w-sm text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <button @click="subirExcel" :disabled="estaSubiendo"
              class="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-2 px-6 rounded-md shadow-sm transition">
              {{ estaSubiendo ? 'Procesando...' : 'Subir y Procesar Excel' }}
            </button>
          </div>
          <p v-if="mensajeStatus" class="mt-4 font-medium" :class="{'text-green-600': mensajeStatus.includes('✅'), 'text-red-600': mensajeStatus.includes('❌') || mensajeStatus.includes('⚠️'), 'text-blue-600': mensajeStatus.includes('⏳')}">
            {{ mensajeStatus }}
          </p>
        </div>

        <div v-if="datosExtraidos && datosExtraidos.length > 0" class="mt-8">
          
          <div class="flex space-x-4 mb-6 border-b border-gray-200 pb-4">
            <button 
              @click="vistaActual = 'validacion'" 
              :class="vistaActual === 'validacion' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border'" 
              class="px-5 py-2 rounded-lg font-bold transition"
            >
              📋 Validar Registros
            </button>
            
            <button 
              @click="vistaActual = 'sabana'" 
              :class="vistaActual === 'sabana' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-600 border'" 
              class="px-5 py-2 rounded-lg font-bold transition"
            >
              📊 Sábana Quincenal
            </button>
          </div>

          <div v-if="vistaActual === 'validacion'">
            <div class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Num. Emp</th>
                      <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Servidor Público</th>
                      <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha</th>
                      <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Entrada</th>
                      <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Salida</th>
                      <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estatus</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="(item, index) in datosExtraidos" :key="index" class="hover:bg-gray-50 transition">
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{{ item.numEmp }}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ item.nombre }}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{{ item.fecha }}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-mono" :class="{'text-red-600 font-bold': item.estatus.includes('RETARDO'), 'text-gray-700': !item.estatus.includes('RETARDO')}">
                        {{ item.entrada || 'SR' }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">
                        {{ item.salida || 'SR' }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <span v-if="item.estatus === 'OK'" class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold">Normal</span>
                        <span v-else-if="item.estatus.includes('RETARDO')" class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">Retardo ({{ item.minutosRetardo }} min)</span>
                        <span v-else-if="item.estatus === 'OK_ESPECIAL'" class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-bold">24x48</span>
                        <span v-else-if="item.estatus === 'NO ENCONTRADO'" class="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">Falta en Sistema</span>
                        <span v-else-if="item.estatus === 'LA'" class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">Lista</span>
                        <span v-else-if="item.estatus === 'OMISION_E'" class="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold">Omisión Entrada</span>
                        <span v-else-if="item.estatus === 'OMISION_S'" class="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold">Omisión Salida</span>
                        <span v-else class="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs">{{ item.estatus }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div v-if="vistaActual === 'sabana'">
            <div class="mb-4 bg-gray-200 py-3 rounded-t-lg border-b-2 border-gray-300 shadow-sm">
              <h2 class="text-lg font-bold text-gray-800 text-center tracking-wide">
                {{ tituloReporte }}
              </h2>
            </div>

            <div class="overflow-x-auto bg-white shadow ring-1 ring-black ring-opacity-5 rounded-b-lg pb-4">
              <table class="min-w-full border-collapse">
                <thead class="bg-gray-100">
                  <tr>
                    <th rowspan="2" class="sticky left-0 z-20 bg-gray-100 py-2 pl-4 pr-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border border-gray-300 shadow-[1px_0_0_0_#d1d5db]">
                      Num
                    </th>
                    <th rowspan="2" class="sticky left-[60px] z-20 bg-gray-100 py-2 pl-4 pr-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[180px] shadow-[1px_0_0_0_#d1d5db]">
                      Área de Adscripción
                    </th>
                    <th rowspan="2" class="sticky left-[240px] z-20 bg-gray-100 py-2 pl-4 pr-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[250px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">
                      Servidor Público
                    </th>
                    <th v-for="fecha in diasSabana" :key="'head-'+fecha" colspan="2" class="py-1 text-center text-sm font-bold text-gray-800 border border-gray-300 bg-gray-200">
                      {{ getDia(fecha) }}
                    </th>
                    
                    <th rowspan="2" class="bg-gray-200 py-2 px-3 text-center text-[10px] font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[80px] leading-tight">
                      FALTAS DE <br> PUNTUALIDAD
                    </th>
                    <th rowspan="2" class="bg-gray-200 py-2 px-3 text-center text-[10px] font-bold text-gray-700 uppercase tracking-wider border border-gray-300 min-w-[80px] leading-tight">
                      FALTAS DE <br> ASISTENCIA
                    </th>
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
                    
                    <td class="sticky left-0 z-10 bg-white py-2 pl-4 pr-3 text-sm text-gray-600 border border-gray-200 text-center shadow-[1px_0_0_0_#e5e7eb] tabular-nums" :class="{'bg-gray-50': index % 2 === 0}">
                      {{ emp.numEmp }}
                    </td>
                    <td class="sticky left-[60px] z-10 bg-white py-2 pl-4 pr-3 text-xs text-gray-700 border border-gray-200 truncate max-w-[180px] shadow-[1px_0_0_0_#e5e7eb]" :class="{'bg-gray-50': index % 2 === 0}" :title="emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || 'Sin Área'">
                      {{ emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || 'Sin Área' }}
                    </td>
                    <td class="sticky left-[240px] z-10 bg-white py-2 pl-4 pr-3 text-sm font-medium text-gray-900 border border-gray-200 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" :class="{'bg-gray-50': index % 2 === 0}">
                      {{ emp.nombre }}
                    </td>
                    
                    <template v-for="fecha in diasSabana" :key="'data-'+fecha">
                      <template v-if="emp.asistencias[fecha]">
                        
                        <td colspan="2" v-if="emp.asistencias[fecha].estatus === 'LA'" class="py-2 text-center border border-gray-200 align-middle bg-blue-50/50">
                          <span class="font-bold text-blue-700 text-sm tracking-widest">LA</span>
                        </td>
                        
                        <td colspan="2" v-else-if="emp.asistencias[fecha].estatus === 'NO ENCONTRADO'" class="py-2 text-center border border-gray-200 align-middle bg-red-50">
                          <span class="text-[10px] font-bold text-red-600 tracking-wider">FALTA BD</span>
                        </td>
                        
                    <template v-else>
                          <td class="py-2 px-1 text-center border border-gray-200 align-middle text-xs tabular-nums whitespace-nowrap transition-colors" 
                              :class="{
                                'text-red-600 font-bold bg-red-50': emp.asistencias[fecha].estatus.includes('RETARDO'), 
                                'text-orange-600 font-bold bg-orange-50': emp.asistencias[fecha].estatus === 'OMISION_E',
                                'text-gray-700': !emp.asistencias[fecha].estatus.includes('RETARDO') && emp.asistencias[fecha].estatus !== 'OMISION_E'
                              }">
                            {{ emp.asistencias[fecha].entrada || (emp.asistencias[fecha].estatus.includes('ESPECIAL') ? '---' : 'SR') }}
                          </td>
                          <td class="py-2 px-1 text-center border border-gray-200 align-middle text-xs tabular-nums whitespace-nowrap transition-colors"
                              :class="{
                                'text-orange-600 font-bold bg-orange-50': emp.asistencias[fecha].estatus === 'OMISION_S' || emp.asistencias[fecha].estatus === 'RETARDO_Y_OMISION',
                                'text-gray-500 bg-gray-50/30': emp.asistencias[fecha].estatus !== 'OMISION_S' && emp.asistencias[fecha].estatus !== 'RETARDO_Y_OMISION'
                              }">
                            {{ emp.asistencias[fecha].salida || (emp.asistencias[fecha].estatus.includes('ESPECIAL') ? '---' : 'SR') }}
                          </td>
                        </template>
                        
                      </template>
                      
                      <td colspan="2" v-else class="py-2 text-center border border-gray-200 align-middle bg-gray-50">
                        <span class="text-gray-300 font-bold">-</span>
                      </td>
                    </template>
                    
                    <td class="py-2 text-center border border-gray-300 bg-orange-50 font-bold text-orange-700 text-sm tabular-nums">
                      {{ emp.totalPuntualidad > 0 ? emp.totalPuntualidad : '-' }}
                    </td>
                    <td class="py-2 text-center border border-gray-300 bg-red-50 font-bold text-red-700 text-sm tabular-nums">
                      {{ emp.totalAsistencia > 0 ? emp.totalAsistencia : '-' }}
                    </td>
                    
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

      <div v-else class="bg-white rounded-lg shadow-md p-10 text-center flex flex-col items-center justify-center">
        <div class="text-6xl mb-4">🚧</div>
        <h1 class="text-2xl font-bold text-gray-800 mb-2">Módulo en Construcción</h1>
        <p class="text-gray-500">Esta sección estará disponible en la próxima etapa del desarrollo.</p>
      </div>

    </main>
  </div>
</template>