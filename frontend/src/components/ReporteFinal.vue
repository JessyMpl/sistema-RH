<script setup>
import { ref, computed, watch } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

// --- VARIABLES PARA LA SÁBANA QUINCENAL ---
const mesSeleccionadoSabana = ref('');
const quincenaSeleccionada = ref('');
const cargandoPrevisualizacion = ref(false);
const estaDescargando = ref(false);
const mostrarTablaPrevisualizacion = ref(false);
const datosExtraidos = ref([]);

// --- FILTROS Y PAGINACIÓN PARA LA TABLA MATRICIAL ---
const busquedaSabana = ref('');
const elementosPorPaginaSabana = ref(15);
const paginaActualSabana = ref(1);

// Lista de meses para los selectores
const meses = [
  { valor: 0, texto: 'Enero' }, { valor: 1, texto: 'Febrero' }, { valor: 2, texto: 'Marzo' },
  { valor: 3, texto: 'Abril' }, { valor: 4, texto: 'Mayo' }, { valor: 5, texto: 'Junio' },
  { valor: 6, texto: 'Julio' }, { valor: 7, texto: 'Agosto' }, { valor: 8, texto: 'Septiembre' },
  { valor: 9, texto: 'Octubre' }, { valor: 10, texto: 'Noviembre' }, { valor: 11, texto: 'Diciembre' }
];

const anioActual = new Date().getFullYear();

// Utilidad: Formatear la fecha ISO a texto legible (YYYY-MM-DD)
const formatearFecha = (isoString) => {
  if (!isoString) return '';
  return isoString.split('T')[0];
};

// Utilidad: Extraer solo el número de día
const getDia = (fechaString) => parseInt(fechaString.split('-')[2], 10);

// Utilidad: Calcular fechas según selección
const calcularFechasQuincena = () => {
  const mes = parseInt(mesSeleccionadoSabana.value);
  let inicio = '';
  let fin = '';

  if (quincenaSeleccionada.value === '1') {
    inicio = `${anioActual}-${String(mes + 1).padStart(2, '0')}-01`;
    fin = `${anioActual}-${String(mes + 1).padStart(2, '0')}-15`;
  } else {
    const ultimoDia = new Date(anioActual, mes + 1, 0).getDate();
    inicio = `${anioActual}-${String(mes + 1).padStart(2, '0')}-16`;
    fin = `${anioActual}-${String(mes + 1).padStart(2, '0')}-${ultimoDia}`;
  }
  return { inicio, fin };
};

// Lógica Computada para extraer los días únicos
const diasSabana = computed(() => {
  if (!datosExtraidos.value || datosExtraidos.value.length === 0) return [];
  return [...new Set(datosExtraidos.value.map(d => formatearFecha(d.fecha)))].sort();
});

// Lógica Computada: Título del Reporte
const tituloReporte = computed(() => {
  if (!diasSabana.value || diasSabana.value.length === 0) return '';
  const primeraFecha = new Date(`${diasSabana.value[0]}T12:00:00Z`);
  const dia = primeraFecha.getDate();
  const mesIndex = primeraFecha.getMonth();
  const quincena = dia <= 15 ? 'PRIMERA' : 'SEGUNDA';
  return `REPORTE ${quincena} QUINCENA DEL MES DE ${meses[mesIndex].texto.toUpperCase()} DE ${anioActual}`;
});

// 💡 LÓGICA COMPUTADA CRÍTICA: PIVOTAR DATOS PARA LA MATRIZ
const datosPivotados = computed(() => {
  if (!datosExtraidos.value || datosExtraidos.value.length === 0) return [];
  
  const empleadosMap = {};
  
  datosExtraidos.value.forEach(registro => {
    const numEmp = registro.servidor.numeroEmpleado;
    const fechaLimpia = formatearFecha(registro.fecha);

    if (!empleadosMap[numEmp]) {
      empleadosMap[numEmp] = { 
        numEmp: numEmp, 
        nombre: registro.servidor.nombreCompleto, 
        departamento: registro.servidor.departamento, 
        asistencias: {} 
      };
    }
    
    empleadosMap[numEmp].asistencias[fechaLimpia] = {
      ...registro,
      estatus: registro.incidencia 
    };
  });
  
  return Object.values(empleadosMap).map(emp => {
    let faltasPuntualidad = 0;
    let faltasAsistencia = 0;
    let totalMinutos = 0; 
    
    diasSabana.value.forEach(fecha => {
      const reg = emp.asistencias[fecha];
      if (reg) {
        if (reg.estatus && reg.estatus.includes('RETARDO')) faltasPuntualidad++;
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

const sabanaFiltrada = computed(() => {
  let filtrados = datosPivotados.value;
  if (busquedaSabana.value) {
    const query = busquedaSabana.value.toLowerCase();
    filtrados = filtrados.filter(emp =>
      emp.nombre.toLowerCase().includes(query) ||
      emp.numEmp.toLowerCase().includes(query) ||
      (emp.departamento || '').toLowerCase().includes(query)
    );
  }
  return filtrados;
});

const paginasTotalesSabana = computed(() => Math.ceil(sabanaFiltrada.value.length / elementosPorPaginaSabana.value));

const sabanaPaginada = computed(() => {
  const inicio = (paginaActualSabana.value - 1) * elementosPorPaginaSabana.value;
  return sabanaFiltrada.value.slice(inicio, inicio + elementosPorPaginaSabana.value);
});

watch(busquedaSabana, () => { paginaActualSabana.value = 1; });
watch([mesSeleccionadoSabana, quincenaSeleccionada], () => { mostrarTablaPrevisualizacion.value = false; });

// --- LÓGICA DE COLORES Y CLASES DINÁMICAS ---
const getClaseJustificacion = (sigla) => {
  const s = String(sigla).trim().toUpperCase();
  if (['CS', 'FPE', 'SA'].includes(s)) return 'bg-[#F3FCE8] text-[#6B8741] font-bold';
  if (['RP', 'M', 'N', 'EP', 'FF', 'SL', 'FE'].includes(s)) return 'bg-white text-[#911A1C] font-bold';
  if (['ENP', 'CM', 'PL', 'EAG'].includes(s)) return 'bg-[#B6D6E3] text-[#911A1C] font-bold';
  if (['FA'].includes(s)) return 'bg-[#E3B9B6] text-[#A82A22] font-bold';
  
  return 'bg-blue-50 text-blue-700 font-bold'; // Valor por defecto (JU, DE, etc)
};

const getClaseCelda = (registro, tipo) => {
  if (!registro) return 'bg-gray-50 text-gray-300';
  const estatus = String(registro.estatus || '').trim().toUpperCase();
  const valor = tipo === 'entrada' ? registro.entrada : registro.salida;
  const esEspecial = estatus.includes('ESPECIAL');
  const valMostrar = String(valor || (esEspecial ? '---' : 'SR')).trim().toUpperCase();

  if (valMostrar === '---') return 'bg-[#FCF9E8] text-gray-500';
  
  // 🔥 NUEVA REGLA: Pinta automáticamente cualquier SR con tu diseño
  if (valMostrar === 'SR') return 'bg-[#FFE2DE] text-[#BD2C0B] font-bold';

  const justifAcronyms = ['CS', 'FPE', 'SA', 'RP', 'M', 'N', 'EP', 'FF', 'SL', 'FE', 'ENP', 'CM', 'PL', 'EAG', 'FA', 'JU', 'DE'];
  if (justifAcronyms.includes(valMostrar)) {
    return getClaseJustificacion(valMostrar);
  }
  
  if (tipo === 'entrada') {
    if (estatus.includes('RETARDO')) return 'text-red-600 font-bold bg-red-50';
    if (estatus === 'OMISION_E') return 'text-orange-600 font-bold bg-orange-50';
  } else {
    if (estatus === 'OMISION_S' || estatus === 'RETARDO_Y_OMISION') return 'text-orange-600 font-bold bg-orange-50';
  }
  
  return 'text-gray-700';
};

const getValorCelda = (registro, tipo) => {
  if (!registro) return '-';
  const estatus = String(registro.estatus || '').trim().toUpperCase();
  const valor = tipo === 'entrada' ? registro.entrada : registro.salida;
  const esEspecial = estatus.includes('ESPECIAL');
  return valor || (esEspecial ? '---' : 'SR');
};

// --- LÓGICA: PREVISUALIZAR SÁBANA (PASO 1) ---
const generarPrevisualizacion = async () => {
  if (mesSeleccionadoSabana.value === '' || !quincenaSeleccionada.value) {
    Swal.fire('Atención', 'Por favor selecciona el mes y la quincena a consultar.', 'warning');
    return;
  }

  cargandoPrevisualizacion.value = true;
  const { inicio, fin } = calcularFechasQuincena();

  try {
    const url = apiUrl(`/api/excel/datos-reporte?inicio=${inicio}&fin=${fin}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al cargar la previsualización');
    
    datosExtraidos.value = await res.json();
    
    if(datosExtraidos.value.length === 0){
       Swal.fire('Sin Datos', 'No existen registros de asistencia para este periodo.', 'info');
       mostrarTablaPrevisualizacion.value = false;
    } else {
       mostrarTablaPrevisualizacion.value = true;
    }
    
  } catch (error) {
    console.error(error);
    Swal.fire('Error', 'No se pudieron cargar los datos de la quincena.', 'error');
    mostrarTablaPrevisualizacion.value = false;
  } finally {
    cargandoPrevisualizacion.value = false;
  }
};

// --- LÓGICA: DESCARGAR EXCEL (PASO 2) ---
const descargarSabanaOficial = async () => {
  estaDescargando.value = true;
  const { inicio, fin } = calcularFechasQuincena();

  try {
    const url = apiUrl(`/api/excel/descargar-reporte?inicio=${inicio}&fin=${fin}`);
    const respuesta = await fetch(url, { method: 'GET' });
    
    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(errorData.error || 'Error al generar el archivo');
    }
    
    const blob = await respuesta.blob();
    const urlBlob = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = urlBlob;
    link.setAttribute('download', `Sabana_Oficial_${inicio}_al_${fin}.xlsx`);
    
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(urlBlob);

  } catch (error) {
    console.error(error);
    Swal.fire('Error', error.message || 'Hubo un problema al descargar el reporte.', 'error');
  } finally {
    estaDescargando.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">

    <!-- Panel de Controles -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 mb-3">
          <i class="fa-solid fa-calendar-check text-3xl"></i>
        </div>
        <h2 class="text-xl font-bold text-gray-800">Sábana Quincenal Oficial</h2>
        <p class="text-sm text-gray-500 mt-1">Previsualiza los datos definitivos con justificaciones aplicadas antes de exportar el Excel.</p>
      </div>

      <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4 max-w-3xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Mes del Reporte</label>
            <select v-model="mesSeleccionadoSabana" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white shadow-sm">
              <option value="" disabled>Selecciona un mes...</option>
              <option v-for="mes in meses" :key="mes.valor" :value="mes.valor">{{ mes.texto }} {{ anioActual }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Quincena</label>
            <select v-model="quincenaSeleccionada" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white shadow-sm">
              <option value="" disabled>Selecciona la quincena...</option>
              <option value="1">Primera Quincena (Días 1 al 15)</option>
              <option value="2">Segunda Quincena (Días 16 al fin de mes)</option>
            </select>
          </div>
        </div>

        <div class="pt-2 flex justify-center">
          <button @click="generarPrevisualizacion" :disabled="cargandoPrevisualizacion" class="px-8 py-2.5 bg-inst-primario text-white font-bold rounded-lg hover:bg-inst-secundario transition shadow-md flex items-center gap-2 disabled:opacity-50">
            <i class="fa-solid" :class="cargandoPrevisualizacion ? 'fa-spinner fa-spin' : 'fa-magnifying-glass-chart'"></i> 
            {{ cargandoPrevisualizacion ? 'Cargando datos...' : 'Generar Previsualización' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Tabla Matricial de Previsualización -->
    <div v-if="mostrarTablaPrevisualizacion" class="animate-fade-in">
      <div class="flex justify-between mb-4 gap-4 items-center">
        
        <div class="flex flex-col md:flex-row gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200 w-full lg:w-auto">
          <div class="flex items-center w-full md:w-64 relative">
            <i class="fa-solid fa-magnifying-glass absolute left-3 text-gray-400"></i>
            <input type="text" v-model="busquedaSabana" placeholder="Buscar empleado o área..." class="w-full pl-9 pr-4 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:border-inst-primario text-sm" />
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

        <button @click="descargarSabanaOficial" :disabled="estaDescargando" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition duration-300 ease-in-out whitespace-nowrap cursor-pointer disabled:opacity-50">
            <i class="fa-solid" :class="estaDescargando ? 'fa-spinner fa-spin' : 'fa-file-excel'"></i> 
          {{ estaDescargando ? 'Procesando...' : 'Descargar Excel Oficial' }}
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
              <td class="sticky left-[60px] z-10 bg-white py-2 pl-4 pr-3 text-xs text-gray-700 border border-gray-200 truncate max-w-[180px] shadow-[1px_0_0_0_#e5e7eb]" :class="{'bg-gray-50': index % 2 === 0}" :title="emp.departamento || emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || 'Sin Área'">{{ emp.departamento || emp.asistencias[Object.keys(emp.asistencias)[0]]?.departamento || 'Sin Área' }}</td>
              <td class="sticky left-[240px] z-10 bg-white py-2 pl-4 pr-3 text-sm font-medium text-gray-900 border border-gray-200 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" :class="{'bg-gray-50': index % 2 === 0}">{{ emp.nombre }}</td>
              
              <template v-for="fecha in diasSabana" :key="'data-'+fecha">
                <template v-if="emp.asistencias[fecha]">
                  
                  <td colspan="2" v-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'LA'" class="py-2 text-center border border-gray-200 align-middle bg-[#D3DCF5]">
                    <span class="font-bold text-[#33539E] text-[10px] tracking-widest">LA</span>
                  </td>
                  <td colspan="2" v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'EXENTO'" class="py-2 text-center border border-gray-200 align-middle bg-[#D3DCF5]">
                    <span class="font-bold text-[#33539E] text-[10px] tracking-widest">EX</span>
                  </td>
                  <td colspan="2" v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'FERIADO'" class="py-2 text-center border border-gray-400 align-middle bg-[#BCBCBC]"></td>
                  <td colspan="2" v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'BAJA'" class="py-2 text-center border border-gray-300 align-middle bg-gray-200"><span class="font-bold text-gray-500 text-[10px] tracking-widest">BAJA</span></td>
                  <td colspan="2" v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'NO ENCONTRADO'" class="py-2 text-center border border-gray-200 align-middle bg-red-50"><span class="text-[10px] font-bold text-red-600 tracking-wider">FALTA BD</span></td>
                  
                  <template v-else-if="String(emp.asistencias[fecha].estatus || '').trim().toUpperCase() === 'FALTA'">
                    <td class="py-2 px-1 text-center border border-gray-300 align-middle text-xs font-bold text-[#BD2C0B] bg-[#FFE2DE] tabular-nums">SR</td>
                    <td class="py-2 px-1 text-center border border-gray-300 align-middle text-xs font-bold text-[#BD2C0B] bg-[#FFE2DE] tabular-nums">SR</td>
                  </template>
                  
                  <!-- Resto de registros y justificaciones -->
                  <template v-else>
                    <td class="py-2 px-1 text-center border border-gray-200 align-middle text-xs tabular-nums whitespace-nowrap transition-colors" 
                        :class="getClaseCelda(emp.asistencias[fecha], 'entrada')">
                      {{ getValorCelda(emp.asistencias[fecha], 'entrada') }}
                    </td>
                    <td class="py-2 px-1 text-center border border-gray-200 align-middle text-xs tabular-nums whitespace-nowrap transition-colors" 
                        :class="getClaseCelda(emp.asistencias[fecha], 'salida')">
                      {{ getValorCelda(emp.asistencias[fecha], 'salida') }}
                    </td>
                  </template>
                  
                </template>
                <td colspan="2" v-else class="py-2 text-center border border-gray-200 align-middle bg-[#FCF9E8]">
                  <span class="text-gray-500">---</span>
                </td>
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
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>