<script setup>
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

const vistaInterna = ref('calcular');
const mesSeleccionado = ref('');
const anioSeleccionado = ref(new Date().getFullYear());
const cargandoCalculo = ref(false);
const listaInfractores = ref([]);
const valorBusquedaCalculo = ref('');
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
  { text: "NÚM. EMP.", value: "numeroEmpleado", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "nombreCompleto", sortable: true },
  { text: "FALTAS", value: "totalFaltas", align: "center", sortable: true },
  { text: "RETARDOS", value: "totalRetardos", align: "center", sortable: true },
  { text: "DETALLE DE LA SANCIÓN", value: "sancionTexto" },
  { text: "DÍAS DE SUSPENSIÓN", value: "diasDescuento", align: "center" },
  { text: "MINUTOS ACUMULADOS", value: "totalMinutosRetardo", align: "center", sortable: true },
  { text: "ACCIONES", value: "acciones", align: "center" }
];

const headersHistorial = [
  { text: "MES / AÑO", value: "periodo", sortable: true },
  { text: "NUM. EMP", value: "servidor.numeroEmpleado", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "servidor.nombreCompleto", sortable: true },
  { text: "TIPO", value: "tipoSancion", sortable: true },
  { text: "SANCIÓN APLICADA", value: "sancionAplicada" },
  { text: "DÍAS", value: "diasDescuento", align: "center" },
  { text: "FOLIO OFICIO", value: "folioOficio" }
];

const calcularMes = async () => {
  if (mesSeleccionado.value === '') { Swal.fire('Atención', 'Selecciona el mes a calcular.', 'warning'); return; }
  cargandoCalculo.value = true;
  try {
    const res = await fetch(apiUrl(`/api/sanciones/calcular?mes=${mesSeleccionado.value}&anio=${anioSeleccionado.value}`));
    if (!res.ok) throw new Error('Error al calcular');
    listaInfractores.value = await res.json();
    if (listaInfractores.value.length === 0) Swal.fire('¡Mes limpio!', 'No hay servidores públicos con faltas o retardos en este periodo.', 'success');
  } catch (error) {
    Swal.fire('Error', 'No se pudo conectar con el motor de cálculo.', 'error');
  } finally {
    cargandoCalculo.value = false;
  }
};

const procesarSancion = async (empleado) => {
  const requiereFechas = empleado.diasDescuento > 0;
  
  const { value: formValues } = await Swal.fire({
    title: 'Emitir Documento Oficial',
    width: '600px',
    html: `
      <div class="text-left space-y-4">
        <div class="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-800">
          Se emitirá oficio para <strong>${empleado.nombreCompleto}</strong>.<br>
          <span class="text-xs">Normatividad: ${empleado.sancionTexto}</span>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Autoriza (Nombre):</label>
              <input id="swal-autoriza-nombre" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario" placeholder="Ej. Mtra. Citlalli Vidal Otero">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Autoriza (Cargo):</label>
              <input id="swal-autoriza-cargo" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario" placeholder="Ej. Directora General...">
            </div>
        </div>
        ${requiereFechas ? `
        <div class="bg-orange-50 border border-orange-200 p-3 rounded">
            <label class="block text-xs font-bold uppercase text-orange-800 mb-1">Fechas de Suspensión:</label>
            <input id="swal-fechas-suspension" class="w-full p-2 border border-orange-300 rounded text-sm outline-none focus:border-orange-500" placeholder="Ej. el 23 y 25 de junio de 2026">
        </div>
        ` : ''}
        <div>
          <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Folio del Oficio (Opcional):</label>
          <input id="swal-input-folio" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario" placeholder="Ej. RH/045/2026">
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-print"></i> Generar PDF y Guardar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#902c3e',
    preConfirm: () => {
      const nombreAutoriza = document.getElementById('swal-autoriza-nombre').value;
      const cargoAutoriza = document.getElementById('swal-autoriza-cargo').value;
      const folio = document.getElementById('swal-input-folio').value;
      const fechasSuspension = requiereFechas ? document.getElementById('swal-fechas-suspension').value : '';

      if (!nombreAutoriza || !cargoAutoriza) { Swal.showValidationMessage('Los datos de quien autoriza son obligatorios.'); return false; }
      if (requiereFechas && !fechasSuspension) { Swal.showValidationMessage('Debe especificar las fechas de suspensión.'); return false; }
      return { nombreAutoriza, cargoAutoriza, fechasSuspension, folio };
    }
  });

  if (formValues) {
    try {
      Swal.fire({ title: 'Generando PDF Oficial...', html: 'Preparando el documento con formato institucional.', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      let partesNombre = empleado.nombreCompleto.trim().split(/\s+/);
      let materno = partesNombre.pop() || '';
      let paterno = partesNombre.pop() || '';
      let nombres = partesNombre.join(' ');
      if (!nombres) { nombres = paterno; paterno = ''; materno = ''; } 

      const hoy = new Date();
      const payloadPdf = {
        dia_hoy: String(hoy.getDate()).padStart(2, '0'),
        mes_hoy: String(hoy.getMonth() + 1).padStart(2, '0'),
        anio_hoy: hoy.getFullYear(),
        nombres: nombres,
        apellido_paterno: paterno,
        apellido_materno: materno,
        clave_servidor: empleado.numeroEmpleado,
        num_plaza: '----', 
        cct: '----',
        horario: 'de 9:00 a 18:00 hrs.',
        numero_incidencias: empleado.tipoSancion === 'RETARDOS' ? empleado.totalRetardos : empleado.totalFaltas,
        check_puntualidad: empleado.tipoSancion === 'RETARDOS' ? 'X' : '',
        check_asistencia: empleado.tipoSancion === 'FALTAS' ? 'X' : '',
        mes_incidencia: getNombreMes(mesSeleccionado.value).toLowerCase(),
        sancion_texto: empleado.sancionTexto,
        dias_incidencia_texto: empleado.diasIncidenciaTexto,
        texto_suspension: formValues.fechasSuspension ? `Los días que será suspendida(o) son ${formValues.fechasSuspension}` : '',
        check_206_01: '', check_206_01_b: empleado.tipoSancion === 'RETARDOS' ? 'X' : '',
        check_206_02: '', check_206_02_b: empleado.tipoSancion === 'FALTAS' ? 'X' : '', check_206_02_c: '',
        nombre_autoriza: formValues.nombreAutoriza,
        cargo_autoriza: formValues.cargoAutoriza,
        nombre_completo: empleado.nombreCompleto
      };

      // Pedimos el PDF al servidor (Puppeteer lo fabrica)
      const resPdf = await fetch(apiUrl('/api/sanciones/generar-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadPdf)
      });
      
      if (!resPdf.ok) throw new Error('Error al generar el formato PDF.');
      
      // Descargamos el PDF físicamente en la computadora
      const blob = await resPdf.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Aviso_Sancion_${empleado.numeroEmpleado}_${getNombreMes(mesSeleccionado.value)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // Guardamos la sanción en la base de datos
      const payloadDB = {
        servidorId: empleado.servidorId, mes: mesSeleccionado.value, anio: anioSeleccionado.value,
        tipoSancion: empleado.tipoSancion, totalRetardos: empleado.totalRetardos, totalFaltas: empleado.totalFaltas, totalOmisiones: empleado.totalOmisiones,
        sancionAplicada: empleado.sancionTexto, diasDescuento: empleado.diasDescuento, folioOficio: formValues.folio || 'SIN FOLIO'
      };

      const resDB = await fetch(apiUrl('/api/sanciones/guardar'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadDB) });
      if (!resDB.ok) throw new Error('Error al guardar en el historial');
      
      Swal.fire('¡Documento Generado!', 'El PDF se ha descargado y la sanción quedó registrada.', 'success');
      listaInfractores.value = listaInfractores.value.filter(item => !(item.servidorId === empleado.servidorId && item.tipoSancion === empleado.tipoSancion));
      cargarHistorial(); 

    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    }
  }
};

const cargarHistorial = async () => {
  cargandoHistorial.value = true;
  try {
    const res = await fetch(apiUrl('/api/sanciones/historial'));
    if (res.ok) listaHistorial.value = await res.json();
  } catch (error) { console.error(error); } finally { cargandoHistorial.value = false; }
};

onMounted(() => { cargarHistorial(); });
const getNombreMes = (num) => meses.find(m => m.valor === num)?.texto || 'Mes';
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex gap-2">
      <button @click="vistaInterna = 'calcular'" :class="['px-6 py-2 rounded-md font-bold text-sm transition', vistaInterna === 'calcular' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-calculator mr-2"></i> Calcular Mes
      </button>
      <button @click="vistaInterna = 'historial'" :class="['px-6 py-2 rounded-md font-bold text-sm transition', vistaInterna === 'historial' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-folder-open mr-2"></i> Expediente Histórico
      </button>
    </div>

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
            <i class="fa-solid" :class="cargandoCalculo ? 'fa-spinner fa-spin' : 'fa-scale-balanced'"></i> Calcular Sanciones
          </button>
        </div>
      </div>

      <div v-if="listaInfractores.length > 0" class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-fade-in">
        <div class="mb-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-100 pb-4">
          <input v-model="valorBusquedaCalculo" type="text" placeholder="Filtrar servidor público..." class="w-full max-w-md p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario" />
        </div>

        <EasyDataTable :headers="headersCalculo" :items="listaInfractores" :search-value="valorBusquedaCalculo" :search-field="['numeroEmpleado', 'nombreCompleto']" :rows-per-page="30" table-class-name="img-strattia-style">
          <template #item-numeroEmpleado="item"><span class="font-mono font-bold text-gray-700">{{ item.numeroEmpleado }}</span></template>
          <template #item-totalFaltas="item"><span v-if="item.totalFaltas > 0" class="px-2 py-0.5 rounded font-bold bg-red-100 text-red-800">{{ item.totalFaltas }}</span><span v-else class="text-gray-300">-</span></template>
          <template #item-totalRetardos="item"><span v-if="item.totalRetardos > 0" class="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">{{ item.totalRetardos }}</span><span v-else class="text-gray-300">-</span></template>
          <template #item-sancionTexto="item"><span class="text-xs font-bold text-gray-800 uppercase tracking-wide">{{ item.sancionTexto }}</span></template>
          <template #item-diasDescuento="item"><span v-if="item.diasDescuento > 0" class="bg-orange-300 text-black px-3 py-1 font-bold rounded-full text-xs shadow-sm">{{ item.diasDescuento }} </span><span v-else class="text-gray-400 text-xs">-</span></template>
          <template #item-totalMinutosRetardo="item"><span v-if="item.totalMinutosRetardo > 0" class="font-bold text-gray-700">{{ item.totalMinutosRetardo }} </span><span v-else class="text-gray-300">-</span></template>
          <template #item-acciones="item">
            <button v-if="item.sancionTexto !== 'Llamada de atención verbal'" @click="procesarSancion(item)" class="bg-inst-primario hover:bg-inst-secundario text-white px-3 py-1.5 rounded text-xs font-bold transition shadow-sm whitespace-nowrap"><i class="fa-solid fa-file-pen mr-1"></i> Doc</button>
            <span v-else class="text-[11px] text-gray-400 font-bold italic"><i class="fa-solid fa-check text-green-500 mr-1"></i> Verbal</span>
          </template>
        </EasyDataTable>
      </div>
    </div>

    <div v-if="vistaInterna === 'historial'" class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
      <div class="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
        <input v-model="valorBusquedaHistorial" type="text" placeholder="Buscar empleado o folio..." class="w-full max-w-md p-2 border border-gray-300 rounded outline-none focus:border-inst-primario text-sm" />
        <button @click="cargarHistorial" class="text-inst-primario text-sm font-bold hover:underline"><i class="fa-solid fa-rotate-right"></i> Actualizar</button>
      </div>

      <EasyDataTable :headers="headersHistorial" :items="listaHistorial" :search-value="valorBusquedaHistorial" :search-field="['servidor.numeroEmpleado', 'servidor.nombreCompleto', 'folioOficio']" :rows-per-page="15" :loading="cargandoHistorial" table-class-name="img-strattia-style">
        <template #item-periodo="item"><span class="font-bold text-gray-600 uppercase text-xs">{{ getNombreMes(item.mes) }} {{ item.anio }}</span></template>
        <template #item-tipoSancion="item"><span :class="item.tipoSancion === 'RETARDOS' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'" class="px-2 py-0.5 rounded text-[10px] font-bold uppercase">{{ item.tipoSancion }}</span></template>
        <template #item-sancionAplicada="item"><span class="text-[11px] text-gray-700 bg-gray-100 px-2 py-1 rounded">{{ item.sancionAplicada }}</span></template>
        <template #item-diasDescuento="item"><span class="font-bold text-red-600">{{ item.diasDescuento }} días</span></template>
        <template #item-folioOficio="item"><span class="font-mono text-xs text-blue-700 font-bold bg-blue-50 px-2 py-1 rounded border border-blue-100">{{ item.folioOficio || 'Sin Folio' }}</span></template>
      </EasyDataTable>
    </div>
  </div>
</template>

<style scoped>
.bg-inst-primario { background-color: #6B1C3A; }
.text-inst-primario { color: #6B1C3A; }
.border-inst-primario { border-color: #6B1C3A; }
.bg-inst-secundario { background-color: #902c3e; }
.bg-inst-cafe-oscuro { background-color: #4b5563; } 

.img-strattia-style {
  --easy-table-header-background-color: #f8fafc;
  --easy-table-header-font-color: #475569;
  --easy-table-header-font-size: 13px;
  --easy-table-body-row-font-size: 13px;
  --easy-table-border: 1px solid #e2e8f0;
  --easy-table-row-border: 1px solid #e2e8f0;
}
</style>