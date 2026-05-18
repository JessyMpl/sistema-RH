<script setup>
import { ref } from 'vue';
import Swal from 'sweetalert2';

const fechaInicio = ref('');
const fechaFin = ref('');
const listaIncidencias = ref([]);
const cargando = ref(false);
const valorBusqueda = ref('');

const headers = [
  { text: "NUM. EMP", value: "numEmp", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "nombre", sortable: true },
  //{ text: "DEPARTAMENTO", value: "departamento", sortable: true },
  { text: "FECHA", value: "fecha", sortable: true },
  { text: "ENTRADA", value: "entrada" },
  { text: "SALIDA", value: "salida" },
  { text: "SEMÁFORO", value: "semaforo" }
];

const consultarRango = async () => {
  if (!fechaInicio.value || !fechaFin.value) {
    Swal.fire('Atencion', 'Por favor selecciona ambas fechas del rango.', 'warning');
    return;
  }

  cargando.value = true;
  try {
    const url = `http://localhost:3000/api/excel/consultar-incidencias?inicio=${fechaInicio.value}&fin=${fechaFin.value}`;
    const res = await fetch(url);
    const data = await res.json();

    if (res.ok) {
      listaIncidencias.value = data;
      if (data.length === 0) {
        Swal.fire('Sin registros', 'No se encontraron incidencias en el rango seleccionado.', 'info');
      }
    } else {
      Swal.fire('Error', data.error || 'No se pudieron consultar los datos.', 'error');
    }
  } catch (error) {
    Swal.fire('Error', 'Fallo la conexion con el servidor.', 'error');
  } finally {
    cargando.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <h2 class="text-base font-bold uppercase tracking-wide text-gray-700 mb-4">Búsqueda de Incidencias por fechas</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha de Inicio</label>
          <input type="date" v-model="fechaInicio" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm shadow-sm" />
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha de Fin</label>
          <input type="date" v-model="fechaFin" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm shadow-sm" />
        </div>
        <div>
          <button @click="consultarRango" :disabled="cargando" class="w-full bg-inst-primario hover:bg-inst-secundario disabled:bg-blue-400 text-white font-bold py-2 px-6 rounded-lg shadow transition text-sm">
            {{ cargando ? 'Buscando registros...' : 'Consultar Incidencias' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="listaIncidencias.length > 0" class="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
      <div class="w-full max-w-md">
        <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Filtrar por Nombre o ID</label>
        <input v-model="valorBusqueda" type="text" placeholder="Escribe para buscar..." class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition shadow-sm text-sm" />
      </div>
      <div class="text-sm text-gray-500 font-medium">
        Total con incidencias: <span class="font-bold text-red-600">{{ listaIncidencias.length }}</span> registros
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-2">
      <EasyDataTable
        :headers="headers"
        :items="listaIncidencias"
        :search-value="valorBusqueda"
        :rows-per-page="25"
        buttons-pagination
        theme-color="#2563eb"
        table-class-name="img-strattia-style"
      >
        <template #item-semaforo="item">
          <div class="flex items-center space-x-2">
            <span v-if="item.estatus.includes('RETARDO')" class="w-4 h-4 rounded-full bg-yellow-400 border border-yellow-500 inline-block" title="Retardo Comercial"></span>
            
            <span v-else-if="['OMISION_E', 'OMISION_S', 'RETARDO_Y_OMISION'].includes(item.estatus)" class="w-4 h-4 rounded-full bg-red-500 border border-red-600 inline-block" title="Falta u Omision"></span>
            
            <span class="text-xs font-medium text-gray-600">{{ item.estatus }}</span>
          </div>
        </template>

        <template #item-entrada="item">
          <span :class="{'text-red-600 font-bold': item.entrada === 'SR'}">{{ item.entrada }}</span>
        </template>
        <template #item-salida="item">
          <span :class="{'text-red-600 font-bold': item.salida === 'SR'}">{{ item.salida }}</span>
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