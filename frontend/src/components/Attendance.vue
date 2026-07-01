<script setup>
import { ref, computed } from 'vue';
import { useAttendance } from '@/composables/useAttendance';

const {
  anioSeleccionado,
  semanaSeleccionada,
  añosDisponibles,
  semanasDisponibles,
  dias,
  registros,
  cargando,
  error
} = useAttendance();

// Filtros interactivos reactivos
const filtroNumEmpleado = ref('');
const filtroNombreReloj = ref('');
const fechaFiltrada = ref(null); // Almacena la fecha (YYYY-MM-DD) seleccionada en la cinta

// Encabezados de la tabla dinámica (Con nueva columna de Quincena)
const headers = [
  { text: "NÚM. EMPLEADO", value: "employeeId", sortable: true },
  { text: "QUINCENA", value: "quincena", sortable: true },
  { text: "FECHA Y HORA REGISTRO", value: "timestampFormatted", sortable: true },
  { text: "NÚMERO DE SERIE RELOJ", value: "serialNumber", sortable: true },
  { text: "NÚMERO TARJETA", value: "cardNumber" },
  { text: "ORIGEN", value: "source", sortable: true },
  { text: "IP RELOJ", value: "clockIp" },
  { text: "NOMBRE RELOJ", value: "clockName", sortable: true },
  { text: "FECHA SINCRONIZACIÓN", value: "syncDateFormatted", sortable: true }
];

// Helper para extraer la parte de fecha en UTC ("YYYY-MM-DD") del catálogo de calendario
const getCalendarISODate = (fechaObj) => {
  if (!fechaObj) return '';
  const d = new Date(fechaObj);
  return d.toISOString().split('T')[0];
};

// Helper para extraer la parte de fecha en UTC ("YYYY-MM-DD") de los registros de asistencia
const getLocalISODate = (fechaObj) => {
  if (!fechaObj) return '';
  if (typeof fechaObj === 'string') {
    return fechaObj.includes('T') ? fechaObj.split('T')[0] : fechaObj.split(' ')[0];
  }
  const d = new Date(fechaObj);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

// Comprobar si un día específico de la cinta de calendario tiene actividad registrada
const tieneActividad = (fechaCalendarioObj) => {
  if (!fechaCalendarioObj) return false;
  const calDateStr = getCalendarISODate(fechaCalendarioObj);
  return registros.value.some(r => {
    return getLocalISODate(r.timestamp) === calDateStr;
  });
};

// Alternar el filtro al dar click en un botón de fecha en la cinta
const toggleFechaFiltro = (fechaCalendarioObj) => {
  if (!fechaCalendarioObj) return;
  const calDateStr = getCalendarISODate(fechaCalendarioObj);
  if (fechaFiltrada.value === calDateStr) {
    fechaFiltrada.value = null; // Si ya estaba seleccionado, se deselecciona para ver toda la semana
  } else {
    fechaFiltrada.value = calDateStr; // Si no, filtra por este día
  }
};

// Limpiar todas las búsquedas y filtros activos
const limpiarFiltros = () => {
  filtroNumEmpleado.value = '';
  filtroNombreReloj.value = '';
  fechaFiltrada.value = null;
};

// Aplicar filtros en memoria (Fecha Ribbon + Num Empleado + Nombre Reloj) y formatear filas
const registrosFiltrados = computed(() => {
  let resultado = registros.value;

  // 1. Filtrar por día seleccionado (Cinta de fechas) en zona horaria local
  if (fechaFiltrada.value) {
    resultado = resultado.filter(reg => {
      return getLocalISODate(reg.timestamp) === fechaFiltrada.value;
    });
  }

  // 2. Filtrar por Número de Empleado (Insenstive search)
  if (filtroNumEmpleado.value.trim() !== '') {
    const query = filtroNumEmpleado.value.trim().toLowerCase();
    resultado = resultado.filter(reg => String(reg.employeeId).toLowerCase().includes(query));
  }

  // 3. Filtrar por Nombre de Reloj (Insenstive search)
  if (filtroNombreReloj.value.trim() !== '') {
    const query = filtroNombreReloj.value.trim().toLowerCase();
    resultado = resultado.filter(reg => String(reg.clockName || '').toLowerCase().includes(query));
  }

  // Helper local para formatear el timestamp de tipo String sin conversiones horarias
  const formatTimestampString = (rawStr) => {
    if (!rawStr) return '---';
    let str = typeof rawStr === 'string' ? rawStr : (rawStr instanceof Date ? rawStr.toISOString().split('.')[0] : String(rawStr));
    const parts = str.includes('T') ? str.split('T') : str.split(' ');
    if (parts.length !== 2) return str;
    const dateParts = parts[0].split('-');
    if (dateParts.length !== 3) return str;
    const time = parts[1];
    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}, ${time}`;
  };

  // 4. Formatear datos y calcular la Quincena dinámicamente usando la hora local
  return resultado.map(reg => {
    const sd = new Date(reg.syncDate);
    
    // Determinar la fecha local de la checada para saber la quincena
    const localDateStr = getLocalISODate(reg.timestamp);
    const diaMes = localDateStr ? parseInt(localDateStr.split('-')[2], 10) : NaN;
    const quincenaVal = isNaN(diaMes) ? '---' : (diaMes <= 15 ? '1' : '2');

    return {
      ...reg,
      quincena: quincenaVal,
      timestampFormatted: formatTimestampString(reg.timestamp),
      syncDateFormatted: isNaN(sd.getTime()) ? '---' : sd.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
    };
  });
});

// Resumen del lote de asistencia en la semana activa
const resumenSemanal = computed(() => {
  const total = registros.value.length;
  const cron = registros.value.filter(r => r.source === 'hikvision-cron').length;
  const manual = registros.value.filter(r => r.source === 'app-manual').length;
  
  // Días con checadas registradas en la semana (calculado en hora local)
  const diasUnicos = new Set(registros.value.map(r => {
    return getLocalISODate(r.timestamp);
  }));

  return {
    total,
    cron,
    manual,
    diasConRegistro: diasUnicos.size
  };
});
</script>

<template>
  <div class="space-y-6 font-sans">
    <!-- 1. Encabezado Premium -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-t-4 border-inst-primario transition-all duration-300">
      <div>
        <h1 class="text-xl font-bold uppercase tracking-wider text-gray-800 flex items-center gap-2">
          <i class="fa-solid fa-clock-rotate-left text-inst-primario"></i>
          Monitoreo de Cargas Biométricas
        </h1>
        <p class="text-xs text-gray-500 font-medium mt-1">
          Consulta y auditoría de eventos recibidos por API (Script Cron o Cargas Manuales desde App Electron).
        </p>
      </div>

      <!-- Filtros Año y Semana -->
      <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <div class="flex-1 md:flex-initial min-w-[120px]">
          <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Año</label>
          <select v-model="anioSeleccionado" :disabled="cargando" class="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-inst-secundario text-xs font-semibold shadow-sm bg-white cursor-pointer transition">
            <option v-for="y in añosDisponibles" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>

        <div class="flex-1 md:flex-initial min-w-[140px]">
          <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Semana del Año</label>
          <select v-model="semanaSeleccionada" :disabled="cargando || semanasDisponibles.length === 0" class="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-inst-secundario text-xs font-semibold shadow-sm bg-white cursor-pointer transition">
            <option v-for="w in semanasDisponibles" :key="w" :value="w">Semana {{ w }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 2. Tarjetas de Resumen (Micro-métricas) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center gap-4 transition hover:shadow-md">
        <div class="w-12 h-12 rounded-full bg-inst-primario/10 flex items-center justify-center text-inst-primario text-xl">
          <i class="fa-solid fa-database"></i>
        </div>
        <div>
          <span class="block text-xs font-bold text-gray-400 uppercase">Total Eventos</span>
          <span class="text-2xl font-black text-gray-800">{{ resumenSemanal.total }}</span>
        </div>
      </div>

      <div class="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center gap-4 transition hover:shadow-md">
        <div class="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xl border border-blue-100">
          <i class="fa-solid fa-clock"></i>
        </div>
        <div>
          <span class="block text-xs font-bold text-gray-400 uppercase">Sincronizador (Cron)</span>
          <span class="text-2xl font-black text-blue-600">{{ resumenSemanal.cron }}</span>
        </div>
      </div>

      <div class="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center gap-4 transition hover:shadow-md">
        <div class="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 text-xl border border-amber-100">
          <i class="fa-solid fa-laptop-code"></i>
        </div>
        <div>
          <span class="block text-xs font-bold text-gray-400 uppercase">Cargas Manuales (App)</span>
          <span class="text-2xl font-black text-amber-600">{{ resumenSemanal.manual }}</span>
        </div>
      </div>

      <div class="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center gap-4 transition hover:shadow-md">
        <div class="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 text-xl border border-emerald-100">
          <i class="fa-solid fa-calendar-check"></i>
        </div>
        <div>
          <span class="block text-xs font-bold text-gray-400 uppercase">Días con Actividad</span>
          <span class="text-2xl font-black text-emerald-600">{{ resumenSemanal.diasConRegistro }} / 7</span>
        </div>
      </div>
    </div>

    <!-- 3. Cinta de Fechas Inteligente (Verde = Con Actividad, Rojo = Sin Actividad, Click = Filtrar Tabla) -->
    <div class="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
      <div class="flex justify-between items-center">
        <div class="text-xs text-gray-500 font-bold flex items-center gap-2 uppercase">
          <i class="fa-solid fa-calendar-days text-inst-primario"></i>
          <span>Cinta de Fechas (Click para filtrar día específico):</span>
        </div>
        <button v-if="fechaFiltrada" @click="fechaFiltrada = null" class="text-xs font-bold text-inst-primario hover:underline flex items-center gap-1">
          <i class="fa-solid fa-filter-circle-xmark"></i> Ver toda la semana
        </button>
      </div>
      
      <div class="flex flex-wrap gap-2.5">
        <button 
          v-for="d in dias" 
          :key="d.id"
          @click="toggleFechaFiltro(d.fecha)"
          :class="[
            'px-3.5 py-2 rounded-lg text-xs font-bold border transition-all duration-300 flex flex-col items-center gap-1 cursor-pointer min-w-[100px] shadow-sm',
            
            // Estado 1: El día está seleccionado actualmente
            fechaFiltrada === getCalendarISODate(d.fecha)
              ? (tieneActividad(d.fecha)
                  ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-300 scale-105 shadow'
                  : 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-300 scale-105 shadow')
              
              // Estado 2: El día no está seleccionado
              : (tieneActividad(d.fecha)
                  // Con actividad (Verde suave institucional)
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70 hover:scale-102'
                  // Sin actividad (Rojo suave institucional)
                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100/70 hover:scale-102')
          ]"
        >
          <span>{{ new Date(d.fecha).toLocaleDateString('es-MX', { weekday: 'short', timeZone: 'UTC' }).toUpperCase() }}</span>
          <span class="text-lg font-black leading-none">{{ new Date(d.fecha).getUTCDate() }}</span>
          <span class="text-[9px] font-medium tracking-tighter opacity-80">
            {{ new Date(d.fecha).toLocaleDateString('es-MX', { month: 'short', timeZone: 'UTC' }).toUpperCase() }}
          </span>
          <span v-if="!d.esLaboral" class="text-[9px] px-1 rounded bg-black/5 font-extrabold uppercase">F.S.</span>
        </button>
      </div>
    </div>

    <!-- 4. Filtros Avanzados por Columna (Num Empleado y Nombre Reloj) -->
    <div class="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
      <div class="text-xs font-bold text-gray-500 flex items-center gap-2 uppercase">
        <i class="fa-solid fa-filter text-inst-primario"></i>
        <span>Búsqueda y Filtros de Columna:</span>
      </div>
      
      <div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1 md:flex-initial">
        <!-- Filtro por Número de Empleado -->
        <div class="relative flex-1 sm:w-60">
          <i class="fa-solid fa-user absolute left-3 top-2.5 text-gray-400 text-xs"></i>
          <input 
            type="text" 
            v-model="filtroNumEmpleado" 
            placeholder="Buscar por Núm. Empleado..." 
            class="w-full pl-8 pr-8 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-inst-primario font-semibold text-gray-700"
          />
          <button v-if="filtroNumEmpleado" @click="filtroNumEmpleado = ''" class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer">
            <i class="fa-solid fa-circle-xmark text-xs"></i>
          </button>
        </div>

        <!-- Filtro por Nombre de Reloj -->
        <div class="relative flex-1 sm:w-60">
          <i class="fa-solid fa-clock absolute left-3 top-2.5 text-gray-400 text-xs"></i>
          <input 
            type="text" 
            v-model="filtroNombreReloj" 
            placeholder="Buscar por Nombre Reloj..." 
            class="w-full pl-8 pr-8 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-inst-primario font-semibold text-gray-700"
          />
          <button v-if="filtroNombreReloj" @click="filtroNombreReloj = ''" class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer">
            <i class="fa-solid fa-circle-xmark text-xs"></i>
          </button>
        </div>
        
        <!-- Botón Limpiar Filtros -->
        <button 
          v-if="filtroNumEmpleado || filtroNombreReloj || fechaFiltrada" 
          @click="limpiarFiltros" 
          class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold py-2 px-4 rounded-lg border border-gray-300 transition flex items-center gap-1 w-full sm:w-auto justify-center cursor-pointer shadow-sm"
        >
          <i class="fa-solid fa-filter-circle-xmark"></i>
          <span>Limpiar</span>
        </button>
      </div>
    </div>

    <!-- 5. Tabla de Datos Dinámica -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-3 relative">
      <!-- Overlay de Carga -->
      <div v-if="cargando" class="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center gap-2">
        <div class="w-10 h-10 rounded-full border-4 border-inst-secundario border-t-inst-primario animate-spin"></div>
        <span class="text-xs font-bold text-inst-primario uppercase tracking-widest">Consultando Registros...</span>
      </div>

      <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-xs font-bold mb-4 flex items-center gap-2">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>{{ error }}</span>
      </div>

      <!-- Resumen de resultados filtrados -->
      <div class="mb-3 text-[11px] font-bold text-gray-500 uppercase flex items-center gap-1" v-if="registrosFiltrados.length > 0">
        <i class="fa-solid fa-circle-info text-inst-primario"></i>
        <span>Mostrando <span class="text-inst-primario font-extrabold text-xs bg-inst-primario/10 px-2 py-0.5 rounded">{{ registrosFiltrados.length }}</span> resultados en base a los filtros actuales.</span>
      </div>

      <EasyDataTable
        :headers="headers"
        :items="registrosFiltrados"
        :rows-per-page="25"
        buttons-pagination
        theme-color="#6B1C3A"
        table-class-name="custom-attendance-table"
        empty-message="No se encontraron registros de checadas para los filtros aplicados"
      >
        <!-- Slot para la Quincena -->
        <template #item-quincena="item">
          <span v-if="item.quincena === '1'" class="bg-indigo-50 text-indigo-700 border border-indigo-200 font-extrabold px-2.5 py-0.5 rounded text-[10px] uppercase">
            Quincena 1
          </span>
          <span v-else-if="item.quincena === '2'" class="bg-purple-50 text-purple-700 border border-purple-200 font-extrabold px-2.5 py-0.5 rounded text-[10px] uppercase">
            Quincena 2
          </span>
          <span v-else class="text-gray-400">
            ---
          </span>
        </template>

        <!-- Slot para Formatear el Origen con Insignias -->
        <template #item-source="item">
          <span v-if="item.source === 'hikvision-cron'" class="bg-blue-100 text-blue-800 border border-blue-200 shadow-sm font-extrabold px-2.5 py-0.5 rounded-full text-[10px] tracking-wide inline-block uppercase">
            <i class="fa-solid fa-clock text-[9px] mr-1"></i> Cron Job
          </span>
          <span v-else-if="item.source === 'app-manual'" class="bg-amber-100 text-amber-800 border border-amber-200 shadow-sm font-extrabold px-2.5 py-0.5 rounded-full text-[10px] tracking-wide inline-block uppercase">
            <i class="fa-solid fa-desktop text-[9px] mr-1"></i> App Electron
          </span>
          <span v-else class="bg-gray-100 text-gray-600 border border-gray-200 font-extrabold px-2.5 py-0.5 rounded-full text-[10px] tracking-wide inline-block uppercase">
            {{ item.source }}
          </span>
        </template>

        <!-- Slot para resaltar el número de empleado -->
        <template #item-employeeId="item">
          <span class="font-bold text-gray-800 tracking-wider">
            {{ item.employeeId }}
          </span>
        </template>
        
        <!-- Slot para formatear las IPs vacías -->
        <template #item-clockIp="item">
          <span :class="item.clockIp ? 'text-gray-700 font-medium' : 'text-gray-400 font-normal italic'">
            {{ item.clockIp || 'no registrada' }}
          </span>
        </template>

        <!-- Slot para formatear los nombres de reloj vacíos -->
        <template #item-clockName="item">
          <span :class="item.clockName ? 'text-gray-700 font-medium animate-pulse text-indigo-950' : 'text-gray-400 font-normal italic'">
            {{ item.clockName || 'no registrado' }}
          </span>
        </template>
      </EasyDataTable>
    </div>
  </div>
</template>

<style scoped>
.custom-attendance-table {
  --easy-table-header-background-color: #F8FAFC;
  --easy-table-header-font-color: #475569;
  --easy-table-header-font-size: 11px;
  --easy-table-header-height: 44px;
  --easy-table-body-row-font-size: 12px;
  --easy-table-body-row-height: 48px;
  --easy-table-border: 1px solid #E2E8F0;
  --easy-table-row-border: 1px solid #F1F5F9;
}
</style>
