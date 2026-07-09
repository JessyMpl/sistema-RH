<script setup>
import { ref, onMounted, computed } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

const fechaInicio = ref('');
const fechaFin = ref('');
const departamentoSeleccionado = ref('TODOS');
const nombreBuscar = ref('');
const listaDepartamentos = ref([]);
const listaResultados = ref([]);
const cargando = ref(false);

// Controla el switch de filtro
const soloIncidencias = ref(false);

// 🔥 NUEVA VARIABLE: Controla el buscador rápido de la tabla
const valorBusqueda = ref('');

const headers = [
  { text: "NUM. EMP", value: "numEmp", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "nombre", sortable: true },
  { text: "DEPARTAMENTO", value: "departamento", sortable: true },
  { text: "TIPO HORARIO", value: "regimen", sortable: true },
  { text: "FECHA", value: "fecha", sortable: true },
  { text: "ENTRADA", value: "entrada" },
  { text: "SALIDA", value: "salida" },
  { text: "ESTATUS", value: "estatus", sortable: true }
];

const resultadosVisibles = computed(() => {
  if (!soloIncidencias.value) return listaResultados.value;
  
  return listaResultados.value.filter(item => {
    const estatus = item.estatus || '';
    const esFaltaUOmision = ['FALTA', 'NO ENCONTRADO', 'OMISION_E', 'OMISION_S', 'RETARDO_Y_OMISION'].includes(estatus) || (item.entrada === 'SR' && item.salida === 'SR');
    const esRetardo = ['RETARDO', 'RETARDO_ESPECIAL'].includes(estatus);
    
    return esFaltaUOmision || esRetardo;
  });
});

const cargarDepartamentos = async () => {
  try {
    const res = await fetch(apiUrl('/api/excel/departamentos'));
    if (res.ok) {
      listaDepartamentos.value = await res.json();
    }
  } catch (error) {
    console.error("Error cargando departamentos:", error);
  }
};

const consultarDatos = async () => {
  if (!fechaInicio.value || !fechaFin.value) {
    Swal.fire('Atención', 'Por favor selecciona el rango de fechas.', 'warning');
    return;
  }

  cargando.value = true;
  try {
    const url = new URL(apiUrl('/api/excel/consultas-generales'), window.location.origin);
    url.searchParams.append('inicio', fechaInicio.value);
    url.searchParams.append('fin', fechaFin.value);
    url.searchParams.append('departamento', departamentoSeleccionado.value);
    
    if (nombreBuscar.value && nombreBuscar.value.trim() !== '') {
      url.searchParams.append('nombre', nombreBuscar.value.trim());
    }

    const res = await fetch(url);
    const data = await res.json();

    if (res.ok) {
      const registrosNormales = data.filter(item => {
         const reg = String(item.regimen || '').toUpperCase().trim();
         return !['LISTA', 'EXENTO', 'EXCENTO'].includes(reg);
      });
      const registrosProtegidos = data.filter(item => {
         const reg = String(item.regimen || '').toUpperCase().trim();
         return ['LISTA', 'EXENTO', 'EXCENTO'].includes(reg);
      });

      if (nombreBuscar.value && registrosNormales.length === 0 && registrosProtegidos.length > 0) {
        Swal.fire({
          icon: 'info',
          title: 'Servidor Público sin biométrico',
          text: 'El servidor público que buscas checa por lista de asistencia o está exento del registro.',
          confirmButtonColor: '#902c3e'
        });
        listaResultados.value = []; 
      } 
      else {
        listaResultados.value = registrosNormales; 
        if (registrosNormales.length === 0) {
          Swal.fire('Sin resultados', 'No se encontraron registros de checadas para los filtros aplicados.', 'info');
        }
      }
    } else {
      Swal.fire('Error', data.error || 'No se pudieron consultar los datos.', 'error');
    }
  } catch (error) {
    Swal.fire('Error', 'Falló la conexión con el servidor.', 'error');
  } finally {
    cargando.value = false;
  }
};

onMounted(() => {
  cargarDepartamentos();
});
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <h2 class="text-base font-bold uppercase tracking-wide text-gray-700 mb-4">Consulta Histórica de Asistencias</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha de Inicio</label>
          <input type="date" v-model="fechaInicio" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm shadow-sm" />
        </div>
        
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha de Fin</label>
          <input type="date" v-model="fechaFin" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm shadow-sm" />
        </div>
        
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Área de Adscripción</label>
          <select v-model="departamentoSeleccionado" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm shadow-sm bg-white">
            <option value="TODOS">TODAS LAS ÁREAS</option>
            <option v-for="dep in listaDepartamentos" :key="dep" :value="dep">{{ dep }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre o Número de</label>
          <input type="text" v-model="nombreBuscar" placeholder="Ej. Juan o 1234..." class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm shadow-sm" />
        </div>
        
        <div>
          <button @click="consultarDatos" :disabled="cargando" class="w-full bg-inst-primario hover:bg-inst-secundario disabled:bg-inst-secundario text-white font-bold py-2 px-4 rounded-lg shadow transition text-sm h-[38px]">
            {{ cargando ? 'Buscando...' : 'Buscar' }}
          </button>
        </div>
        
        <!-- CHECKBOX DE INCIDENCIAS -->
        <div class="col-span-1 md:col-span-5 flex items-center mt-2 bg-gray-50 p-3 rounded-md border border-gray-200">
          <input type="checkbox" id="filtroIncidencias" v-model="soloIncidencias" class="w-4 h-4 text-inst-primario border-gray-300 rounded focus:ring-inst-primario cursor-pointer accent-inst-primario">
          <label for="filtroIncidencias" class="ml-2 text-sm font-bold text-gray-700 cursor-pointer">
            Mostrar únicamente incidencias (Ocultar registros correctos y justificados)
          </label>
        </div>
      </div>

      <div v-if="resultadosVisibles.length > 0" class="mt-4 pt-2 border-t border-gray-100 text-sm text-gray-500 font-medium">
        Registros encontrados: <span class="font-bold text-blue-600">{{ resultadosVisibles.length }}</span>
      </div>
    </div>

    <!-- 🔥 TABLA Y BUSCADOR RÁPIDO -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-4">
      
      <!-- CAMPO DE BÚSQUEDA RÁPIDA (Solo visible si hay datos) -->
      <div v-if="resultadosVisibles.length > 0" class="mb-4 flex items-center">
        <div class="relative w-full md:w-1/3">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          <input type="text" v-model="valorBusqueda" placeholder="Buscar en resultados (Nombre o Núm. Emp)..." class="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-inst-primario text-sm shadow-sm" />
        </div>
      </div>

      <EasyDataTable
        :headers="headers"
        :items="resultadosVisibles"
        :search-value="valorBusqueda" 
        :rows-per-page="25"
        buttons-pagination
        theme-color="#902c3e"
        table-class-name="img-strattia-style"
      >
        <template #item-regimen="item">
          <span v-if="item.regimen === 'NORMAL'" class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold shadow-sm">NORMAL</span>
          <span v-else-if="item.regimen === 'ESPECIAL'" class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold shadow-sm">ESPECIAL</span>
          <span v-else-if="item.regimen === 'LISTA'" class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-bold shadow-sm">LISTA</span>
          <span v-else-if="item.regimen === 'EXENTO' || item.regimen === 'EXCENTO'" class="bg-gray-200 text-gray-800 px-3 py-1 rounded-full text-xs font-bold shadow-sm">EXENTO</span>
          <span v-else class="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold shadow-sm">{{ item.regimen || 'SIN ASIGNAR' }}</span>
        </template>

        <template #item-entrada="item">
          <div v-if="item.minutosRetardo > 0 && item.entrada !== 'SR'" class="text-red-600 font-bold whitespace-nowrap">
            {{ item.entrada }} <span class="text-[10px] bg-red-100 text-red-700 px-1 rounded-sm ml-1">+{{ item.minutosRetardo }}m</span>
          </div>
          <div v-else :class="item.entrada === 'SR' ? 'text-gray-400 font-bold' : 'text-gray-800 font-medium'">
            {{ item.entrada }}
          </div>
        </template>
        
        <template #item-salida="item">
          <div :class="item.salida === 'SR' ? 'text-gray-400 font-bold' : 'text-gray-800 font-medium'">
            {{ item.salida }}
          </div>
        </template>

        <!-- SEMÁFORO DE COLORES -->
        <template #item-estatus="item">
          <div class="flex justify-center items-center">
            
            <span v-if="item.estatus === 'JUSTIFICADA'" 
                  class="w-6 h-6 rounded-full bg-blue-500 border border-blue-600 shadow-sm inline-block" title="Incidencia Justificada"></span>
            
            <span v-else-if="['OK', 'OK_ESPECIAL', 'LA', 'EXENTO', 'EXCENTO', 'FERIADO'].includes(item.estatus) || ['LISTA', 'EXENTO', 'EXCENTO'].includes(String(item.regimen || '').toUpperCase().trim())" 
                  class="w-6 h-6 rounded-full bg-green-500 border border-green-600 shadow-sm inline-block" title="Asistencia Correcta"></span>
            
            <span v-else-if="['FALTA', 'NO ENCONTRADO', 'OMISION_E', 'OMISION_S', 'RETARDO_Y_OMISION'].includes(item.estatus) || (item.entrada === 'SR' && item.salida === 'SR')" 
                  class="w-6 h-6 rounded-full bg-red-600 border border-red-700 shadow-sm inline-block" title="Falta u Omisión"></span>
            
            <span v-else-if="['RETARDO', 'RETARDO_ESPECIAL'].includes(item.estatus)" 
                  class="w-6 h-6 rounded-full bg-yellow-400 border border-yellow-500 shadow-sm inline-block" title="Retardo"></span>
            
            <span v-else 
                  class="w-6 h-6 rounded-full bg-gray-400 border border-gray-500 shadow-sm inline-block" :title="item.estatus"></span>
                  
          </div>
        </template>

      </EasyDataTable>
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
</style>