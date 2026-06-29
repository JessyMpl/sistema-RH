<script setup>
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

// Pestañas
const vistaInterna = ref('calcular');

// Variables Cálculo Mensual
const mesSeleccionado = ref('');
const anioSeleccionado = ref(new Date().getFullYear());
const cargandoCalculo = ref(false);
const listaInfractores = ref([]);
const valorBusquedaCalculo = ref('');

// Variables Historial
const cargandoHistorial = ref(false);
const listaHistorial = ref([]);
const valorBusquedaHistorial = ref('');

const meses = [
  { valor: 0, texto: 'Enero' }, { valor: 1, texto: 'Febrero' }, { valor: 2, texto: 'Marzo' },
  { valor: 3, texto: 'Abril' }, { valor: 4, texto: 'Mayo' }, { valor: 5, texto: 'Junio' },
  { valor: 6, texto: 'Julio' }, { valor: 7, texto: 'Agosto' }, { valor: 8, texto: 'Septiembre' },
  { valor: 9, texto: 'Octubre' }, { valor: 10, texto: 'Noviembre' }, { valor: 11, texto: 'Diciembre' }
];

const headersCalculo = [
  { text: "NUM. EMP", value: "numeroEmpleado", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "nombreCompleto", sortable: true },
  { text: "FALTAS", value: "totalFaltas", align: "center", sortable: true },
  { text: "RETARDOS", value: "totalRetardos", align: "center", sortable: true },
  { text: "SANCIÓN NORMATIVA", value: "sancionTexto" },
  { text: "DÍAS DESC.", value: "diasDescuento", align: "center" },
  { text: "ACCIONES", value: "acciones", align: "center" }
];

const headersHistorial = [
  { text: "MES / AÑO", value: "periodo", sortable: true },
  { text: "NUM. EMP", value: "servidor.numeroEmpleado", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "servidor.nombreCompleto", sortable: true },
  { text: "SANCIÓN APLICADA", value: "sancionAplicada" },
  { text: "DÍAS", value: "diasDescuento", align: "center" },
  { text: "FOLIO OFICIO", value: "folioOficio" }
];

// 1. CARGAR CÁLCULO
const calcularMes = async () => {
  if (mesSeleccionado.value === '') {
    Swal.fire('Atención', 'Selecciona el mes a calcular.', 'warning');
    return;
  }
  cargandoCalculo.value = true;
  try {
    const url = apiUrl(`/api/sanciones/calcular?mes=${mesSeleccionado.value}&anio=${anioSeleccionado.value}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al calcular');
    listaInfractores.value = await res.json();
    
    if (listaInfractores.value.length === 0) {
      Swal.fire('¡Mes limpio!', 'No hay servidores públicos con faltas o retardos en este periodo.', 'success');
    }
  } catch (error) {
    Swal.fire('Error', 'No se pudo conectar con el motor de cálculo.', 'error');
  } finally {
    cargandoCalculo.value = false;
  }
};

// 2. GENERAR OFICIO Y GUARDAR SANCIÓN
const procesarSancion = async (empleado) => {
  const { value: folioForm } = await Swal.fire({
    title: 'Emitir Documento de Sanción',
    html: `
      <div class="text-left text-sm text-gray-700">
        <p><strong>Servidor Público:</strong> ${empleado.nombreCompleto}</p>
        <p><strong>Infracciones:</strong> ${empleado.totalFaltas} Faltas | ${empleado.totalRetardos} Retardos</p>
        <p class="text-red-600 font-bold mt-2">Normatividad a aplicar:</p>
        <p class="mb-4 text-xs bg-red-50 p-2 rounded border border-red-200">${empleado.sancionTexto}</p>
        <label class="block text-xs font-bold uppercase mb-1">Folio del Oficio (Opcional):</label>
        <input id="swal-input-folio" class="w-full p-2 border border-gray-300 rounded outline-none focus:border-inst-primario" placeholder="Ej. RH/045/2026">
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-file-signature"></i> Guardar en Expediente',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#902c3e',
    preConfirm: () => {
      return document.getElementById('swal-input-folio').value;
    }
  });

  if (folioForm !== undefined) {
    try {
      Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      const payload = {
        servidorId: empleado.servidorId,
        mes: mesSeleccionado.value,
        anio: anioSeleccionado.value,
        totalRetardos: empleado.totalRetardos,
        totalFaltas: empleado.totalFaltas,
        totalOmisiones: empleado.totalOmisiones,
        sancionAplicada: empleado.sancionTexto,
        diasDescuento: empleado.diasDescuento,
        folioOficio: folioForm || 'SIN FOLIO'
      };

      const res = await fetch(apiUrl('/api/sanciones/guardar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      
      Swal.fire('¡Guardado!', 'La sanción ha quedado registrada en el expediente.', 'success');
      cargarHistorial(); // Actualizamos el historial en segundo plano
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    }
  }
};

// 3. CARGAR HISTORIAL GLOBAL
const cargarHistorial = async () => {
  cargandoHistorial.value = true;
  try {
    const res = await fetch(apiUrl('/api/sanciones/historial'));
    if (res.ok) {
      listaHistorial.value = await res.json();
    }
  } catch (error) {
    console.error("Error al cargar historial", error);
  } finally {
    cargandoHistorial.value = false;
  }
};

onMounted(() => {
  cargarHistorial();
});

const getNombreMes = (num) => meses.find(m => m.valor === num)?.texto || 'Mes';
</script>

<template>
  <div class="space-y-6">
    
    <!-- Pestañas de Navegación -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex gap-2">
      <button @click="vistaInterna = 'calcular'" 
        :class="['px-6 py-2 rounded-md font-bold text-sm transition', vistaInterna === 'calcular' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-calculator mr-2"></i> Calcular Mes
      </button>
      <button @click="vistaInterna = 'historial'" 
        :class="['px-6 py-2 rounded-md font-bold text-sm transition', vistaInterna === 'historial' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-folder-open mr-2"></i> Expediente Histórico
      </button>
    </div>

    <!-- PESTAÑA: CALCULAR MES (Infractores) -->
    <div v-if="vistaInterna === 'calcular'" class="space-y-4">
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div class="flex flex-col md:flex-row justify-between items-end gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div class="w-full max-w-xs">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Mes de Análisis</label>
            <select v-model="mesSeleccionado" class="w-full p-2 border border-gray-300 rounded outline-none focus:border-inst-primario text-sm bg-white">
              <option value="" disabled>Seleccione...</option>
              <option v-for="mes in meses" :key="mes.valor" :value="mes.valor">{{ mes.texto }}</option>
            </select>
          </div>
          <div class="w-full max-w-[120px]">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Año</label>
            <input type="number" v-model="anioSeleccionado" class="w-full p-2 border border-gray-300 rounded outline-none text-sm bg-white" />
          </div>
          <button @click="calcularMes" :disabled="cargandoCalculo" class="px-6 py-2 bg-inst-primario text-white font-bold rounded shadow-sm hover:bg-inst-secundario transition text-sm flex items-center gap-2">
            <i class="fa-solid" :class="cargandoCalculo ? 'fa-spinner fa-spin' : 'fa-scale-balanced'"></i> Generar Infracciones
          </button>
        </div>
      </div>

      <!-- Tabla de Resultados Matemáticos -->
      <div v-if="listaInfractores.length > 0" class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-fade-in">
        <div class="mb-4">
          <input v-model="valorBusquedaCalculo" type="text" placeholder="Filtrar servidor público..." class="w-full max-w-md p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario" />
        </div>

        <EasyDataTable
          :headers="headersCalculo"
          :items="listaInfractores"
          :search-value="valorBusquedaCalculo"
          :search-field="['numeroEmpleado', 'nombreCompleto']"
          :rows-per-page="15"
          table-class-name="img-strattia-style"
        >
          <template #item-numeroEmpleado="item">
             <span class="font-mono font-bold text-gray-700">{{ item.numeroEmpleado }}</span>
          </template>
          <template #item-totalFaltas="item">
             <span :class="item.totalFaltas > 0 ? 'bg-red-100 text-red-800' : 'text-gray-400'" class="px-2 py-0.5 rounded font-bold">{{ item.totalFaltas }}</span>
          </template>
          <template #item-totalRetardos="item">
             <span :class="item.totalRetardos > 0 ? 'bg-amber-100 text-amber-800' : 'text-gray-400'" class="px-2 py-0.5 rounded font-bold">{{ item.totalRetardos }}</span>
          </template>
          <template #item-sancionTexto="item">
            <span class="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100">{{ item.sancionTexto }}</span>
          </template>
          <template #item-diasDescuento="item">
            <span :class="item.diasDescuento > 0 ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-500'" class="px-3 py-1 font-bold rounded-full text-xs shadow-sm">{{ item.diasDescuento }} d</span>
          </template>
          <template #item-acciones="item">
            <button @click="procesarSancion(item)" class="bg-inst-primario hover:bg-inst-secundario text-white px-3 py-1.5 rounded text-xs font-bold transition shadow-sm whitespace-nowrap">
              <i class="fa-solid fa-file-pen mr-1"></i> Generar sanción
            </button>
          </template>
        </EasyDataTable>
      </div>
    </div>

    <!-- PESTAÑA: HISTORIAL -->
    <div v-if="vistaInterna === 'historial'" class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
      <div class="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
        <input v-model="valorBusquedaHistorial" type="text" placeholder="Buscar empleado o folio..." class="w-full max-w-md p-2 border border-gray-300 rounded outline-none focus:border-inst-primario text-sm" />
        <button @click="cargarHistorial" class="text-inst-primario text-sm font-bold hover:underline"><i class="fa-solid fa-rotate-right"></i> Actualizar</button>
      </div>

      <EasyDataTable
        :headers="headersHistorial"
        :items="listaHistorial"
        :search-value="valorBusquedaHistorial"
        :search-field="['servidor.numeroEmpleado', 'servidor.nombreCompleto', 'folioOficio']"
        :rows-per-page="15"
        :loading="cargandoHistorial"
        table-class-name="img-strattia-style"
      >
        <template #item-periodo="item">
          <span class="font-bold text-gray-600 uppercase text-xs">{{ getNombreMes(item.mes) }} {{ item.anio }}</span>
        </template>
        <template #item-sancionAplicada="item">
          <span class="text-[11px] text-gray-700 bg-gray-100 px-2 py-1 rounded">{{ item.sancionAplicada }}</span>
        </template>
        <template #item-diasDescuento="item">
           <span class="font-bold text-red-600">{{ item.diasDescuento }} días</span>
        </template>
        <template #item-folioOficio="item">
          <span class="font-mono text-xs text-blue-700 font-bold bg-blue-50 px-2 py-1 rounded border border-blue-100">{{ item.folioOficio || 'Sin Folio' }}</span>
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