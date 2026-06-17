<script setup>
import { ref, computed } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

// Estado de las pestañas
const pestanaActiva = ref('sabana');

// --- VARIABLES PARA LA SÁBANA QUINCENAL ---
const mesSeleccionadoSabana = ref('');
const quincenaSeleccionada = ref('');
const estaDescargando = ref(false);

// --- VARIABLES PARA EL REPORTE DE SANCIONES ---
const mesSeleccionadoSanciones = ref('');
const cargandoSanciones = ref(false);
const listaSanciones = ref([]);
const valorBusquedaSanciones = ref('');

const headersSanciones = [
  { text: "NUM. EMP", value: "numeroEmpleado", sortable: true, align: "center" },
  { text: "SERVIDOR PÚBLICO", value: "nombreCompleto", sortable: true },
  { text: "DEPARTAMENTO", value: "departamento", sortable: true },
  { text: "FALTAS", value: "totalFaltas", sortable: true, align: "center" },
  { text: "RETARDOS", value: "totalRetardos", sortable: true, align: "center" },
  { text: "OMISIONES", value: "totalOmisiones", sortable: true, align: "center" },
  { text: "DÍAS A DESCONTAR", value: "diasDescuento", sortable: true, align: "center" }
];

// Lista de meses para los selectores
const meses = [
  { valor: 0, texto: 'Enero' }, { valor: 1, texto: 'Febrero' }, { valor: 2, texto: 'Marzo' },
  { valor: 3, texto: 'Abril' }, { valor: 4, texto: 'Mayo' }, { valor: 5, texto: 'Junio' },
  { valor: 6, texto: 'Julio' }, { valor: 7, texto: 'Agosto' }, { valor: 8, texto: 'Septiembre' },
  { valor: 9, texto: 'Octubre' }, { valor: 10, texto: 'Noviembre' }, { valor: 11, texto: 'Diciembre' }
];

const anioActual = new Date().getFullYear();

// --- LÓGICA: DESCARGAR SÁBANA ACTUALIZADA ---
const descargarSabanaOficial = async () => {
  if (mesSeleccionadoSabana.value === '' || !quincenaSeleccionada.value) {
    Swal.fire('Atención', 'Por favor selecciona el mes y la quincena a exportar.', 'warning');
    return;
  }

  estaDescargando.value = true;
  
  // Calcular las fechas de inicio y fin según la selección
  const mes = parseInt(mesSeleccionadoSabana.value);
  let fechaInicioStr = '';
  let fechaFinStr = '';

  if (quincenaSeleccionada.value === '1') {
    // Del 1 al 15
    fechaInicioStr = `${anioActual}-${String(mes + 1).padStart(2, '0')}-01`;
    fechaFinStr = `${anioActual}-${String(mes + 1).padStart(2, '0')}-15`;
  } else {
    // Del 16 al último día del mes
    const ultimoDia = new Date(anioActual, mes + 1, 0).getDate();
    fechaInicioStr = `${anioActual}-${String(mes + 1).padStart(2, '0')}-16`;
    fechaFinStr = `${anioActual}-${String(mes + 1).padStart(2, '0')}-${ultimoDia}`;
  }

  try {
    const url = apiUrl(`/api/excel/descargar-reporte?inicio=${fechaInicioStr}&fin=${fechaFinStr}`);
    const respuesta = await fetch(url, { method: 'GET' });
    
    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(errorData.error || 'Error al generar el archivo');
    }
    
    const blob = await respuesta.blob();
    const urlBlob = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = urlBlob;
    link.setAttribute('download', `Sabana_Actualizada_${fechaInicioStr}_al_${fechaFinStr}.xlsx`);
    
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(urlBlob);

    Swal.fire('¡Éxito!', 'La sábana oficial ha sido descargada.', 'success');

  } catch (error) {
    console.error(error);
    Swal.fire('Error', error.message || 'Hubo un problema al descargar el reporte.', 'error');
  } finally {
    estaDescargando.value = false;
  }
};

// --- LÓGICA: GENERAR REPORTE DE SANCIONES ---
const generarReporteSanciones = async () => {
  if (mesSeleccionadoSanciones.value === '') {
    Swal.fire('Atención', 'Selecciona un mes para calcular las sanciones.', 'warning');
    return;
  }

  cargandoSanciones.value = true;
  
  try {
    // 💡 NOTA: Esta ruta la crearemos en el backend en el siguiente paso
    /* const url = apiUrl(`/api/reportes/sanciones?mes=${mesSeleccionadoSanciones.value}&anio=${anioActual}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al generar cálculo de sanciones');
    listaSanciones.value = await res.json();
    */
    
    // Datos de prueba temporales para ver la tabla viva
    listaSanciones.value = [
      { numeroEmpleado: '1408', nombreCompleto: 'YENY ANDREA', departamento: 'SISTEMAS', totalFaltas: 1, totalRetardos: 3, totalOmisiones: 0, diasDescuento: 2 },
      { numeroEmpleado: '2272', nombreCompleto: 'MERCEDES ALBARRAN', departamento: 'FINANZAS', totalFaltas: 0, totalRetardos: 2, totalOmisiones: 1, diasDescuento: 1 }
    ];

  } catch (error) {
    console.error(error);
    Swal.fire('Error', 'No se pudo calcular el reporte de sanciones.', 'error');
  } finally {
    cargandoSanciones.value = false;
  }
};

</script>

<template>
  <div class="space-y-6">
    <!-- Pestañas -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex gap-2">
      <button @click="pestanaActiva = 'sabana'" 
        :class="['px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'sabana' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-file-excel mr-2"></i> Sábana Oficial
      </button>
      
      <button @click="pestanaActiva = 'sanciones'" 
        :class="['px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'sanciones' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-scale-balanced mr-2"></i> Reporte de Sanciones
      </button>
    </div>

    <!-- PESTAÑA 1: SÁBANA ACTUALIZADA -->
    <div v-if="pestanaActiva === 'sabana'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-3xl mx-auto">
      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-3">
          <i class="fa-solid fa-file-csv text-3xl"></i>
        </div>
        <h2 class="text-xl font-bold text-gray-800">Generar Sábana Quincenal Oficial</h2>
        <p class="text-sm text-gray-500 mt-1">Este reporte incluye todas las justificaciones y correcciones aplicadas.</p>
      </div>

      <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 space-y-4">
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

        <div class="pt-4 flex justify-end">
          <button @click="descargarSabanaOficial" :disabled="estaDescargando" class="px-6 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition shadow-sm flex items-center gap-2 disabled:opacity-50">
            <i class="fa-solid" :class="estaDescargando ? 'fa-spinner fa-spin' : 'fa-download'"></i> 
            {{ estaDescargando ? 'Generando Excel...' : 'Descargar Excel Oficial' }}
          </button>
        </div>
      </div>
    </div>

    <!-- PESTAÑA 2: REPORTE DE SANCIONES -->
    <div v-if="pestanaActiva === 'sanciones'" class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-4 space-y-4">
      
      <div class="flex justify-between items-end bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div class="w-full max-w-xs">
           <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Mes a procesar</label>
            <select v-model="mesSeleccionadoSanciones" class="w-full p-2 border border-gray-300 rounded outline-none focus:border-inst-primario text-sm bg-white shadow-sm">
              <option value="" disabled>Selecciona el mes...</option>
              <option v-for="mes in meses" :key="mes.valor" :value="mes.valor">{{ mes.texto }} {{ anioActual }}</option>
            </select>
        </div>
        
        <button @click="generarReporteSanciones" :disabled="cargandoSanciones" class="px-5 py-2 bg-inst-primario text-white font-bold rounded hover:bg-inst-secundario transition text-sm shadow-sm flex items-center gap-2 disabled:opacity-50">
          <i class="fa-solid fa-calculator"></i> Calcular Descuentos
        </button>
      </div>

      <!-- Barra de búsqueda para la tabla de sanciones -->
      <div class="w-full max-w-md mt-4">
        <input v-model="valorBusquedaSanciones" type="text" placeholder="Filtrar servidor público..." class="w-full p-2 border border-gray-300 rounded outline-none focus:border-inst-primario text-sm" />
      </div>

      <EasyDataTable
        :headers="headersSanciones"
        :items="listaSanciones"
        :search-value="valorBusquedaSanciones"
        :search-field="['numeroEmpleado', 'nombreCompleto']"
        :rows-per-page="15"
        :loading="cargandoSanciones"
        table-class-name="img-strattia-style"
      >
        <template #item-numeroEmpleado="item">
           <div class="text-center font-mono font-bold text-gray-700 w-full">{{ item.numeroEmpleado }}</div>
        </template>
        
        <template #item-totalFaltas="item">
           <div class="text-center w-full">
             <span class="px-2 py-0.5 bg-red-100 text-red-800 font-bold rounded tabular-nums border border-red-200">{{ item.totalFaltas }}</span>
           </div>
        </template>

        <template #item-totalRetardos="item">
           <div class="text-center w-full">
             <span class="px-2 py-0.5 bg-amber-100 text-yellow-800 font-bold rounded tabular-nums border border-amber-200">{{ item.totalRetardos }}</span>
           </div>
        </template>

        <template #item-totalOmisiones="item">
           <div class="text-center w-full">
             <span class="px-2 py-0.5 bg-orange-100 text-orange-800 font-bold rounded tabular-nums border border-orange-200">{{ item.totalOmisiones }}</span>
           </div>
        </template>

        <template #item-diasDescuento="item">
           <div class="text-center w-full">
             <span class="px-3 py-1 bg-gray-800 text-white font-bold rounded-full tabular-nums shadow-sm">{{ item.diasDescuento }} d</span>
           </div>
        </template>
      </EasyDataTable>

      <div class="flex justify-end pt-2">
        <button class="text-gray-600 hover:text-green-600 font-bold text-sm transition flex items-center gap-1">
          <i class="fa-solid fa-file-arrow-down"></i> Exportar Lista (Nómina)
        </button>
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
</style>