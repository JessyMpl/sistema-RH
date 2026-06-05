<script setup>
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';

const fechaInicio = ref('');
const fechaFin = ref('');
const departamentoSeleccionado = ref('TODOS');
const nombreBuscar = ref('');
const listaDepartamentos = ref([]);
const listaResultados = ref([]);
const cargando = ref(false);

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

const cargarDepartamentos = async () => {
  try {
    const res = await fetch('http://10.0.80.6:3000/api/excel/departamentos');
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
    const url = new URL('http://10.0.80.6:3000/api/excel/consultas-generales');
    url.searchParams.append('inicio', fechaInicio.value);
    url.searchParams.append('fin', fechaFin.value);
    url.searchParams.append('departamento', departamentoSeleccionado.value);
    
    if (nombreBuscar.value && nombreBuscar.value.trim() !== '') {
      url.searchParams.append('nombre', nombreBuscar.value.trim());
    }

    const res = await fetch(url);
    const data = await res.json();

    if (res.ok) {
      // Limpiamos los textos para evitar errores por espacios o minúsculas
      const registrosNormales = data.filter(item => {
         const reg = String(item.regimen || '').toUpperCase().trim();
         return !['LISTA', 'EXENTO', 'EXCENTO'].includes(reg);
      });
      const registrosProtegidos = data.filter(item => {
         const reg = String(item.regimen || '').toUpperCase().trim();
         return ['LISTA', 'EXENTO', 'EXCENTO'].includes(reg);
      });

      // Lógica de la alerta si buscó a alguien que no checa
      if (nombreBuscar.value && registrosNormales.length === 0 && registrosProtegidos.length > 0) {
        Swal.fire({
          icon: 'info',
          title: 'Servidor Público sin biométrico',
          text: 'El servidor público que buscas checa por lista de asistencia o está exento del registro.',
          confirmButtonColor: '#902c3e'
        });
        listaResultados.value = []; // Se limpia la tabla para no mostrar rojos
      } 
      else {
        // Mostramos solo a los normales
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
      </div>

      <div v-if="listaResultados.length > 0" class="mt-4 pt-2 border-t border-gray-100 text-sm text-gray-500 font-medium">
        Registros encontrados: <span class="font-bold text-blue-600">{{ listaResultados.length }}</span>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-2">
      <EasyDataTable
        :headers="headers"
        :items="listaResultados"
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

        <template #item-estatus="item">
          <div class="flex justify-center items-center">
            
            <span v-if="item.estatus === 'JUSTIFICADA'" 
                  class="w-6 h-6 rounded-full bg-blue-500 border border-blue-600 shadow-sm inline-block" title="Incidencia Justificada"></span>
            
            <span v-else-if="['OK', 'OK_ESPECIAL', 'LA', 'EXENTO', 'EXCENTO'].includes(item.estatus) || ['LISTA', 'EXENTO', 'EXCENTO'].includes(String(item.regimen || '').toUpperCase().trim())" 
                  class="w-6 h-6 rounded-full bg-green-500 border border-green-600 shadow-sm inline-block" title="Asistencia Correcta"></span>
            
            <span v-else-if="item.estatus === 'NO ENCONTRADO' || (item.entrada === 'SR' && item.salida === 'SR')" 
                  class="w-6 h-6 rounded-full bg-red-600 border border-red-700 shadow-sm inline-block" title="Falta de Asistencia"></span>
            
            <span v-else-if="['OMISION_E', 'OMISION_S', 'RETARDO_Y_OMISION'].includes(item.estatus)" 
                  class="w-6 h-6 rounded-full bg-orange-500 border border-orange-600 shadow-sm inline-block" title="Omisión de Registro"></span>
            
            <span v-else-if="item.estatus && item.estatus.includes('RETARDO')" 
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