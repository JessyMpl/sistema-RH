import { ref, watch, onMounted } from 'vue';
import { AttendanceRepositoryImpl } from '@/infrastructure/repositories/AttendanceRepositoryImpl';
import { GetFilters } from '@/application/use-cases/GetFilters';
import { GetAttendanceByWeek } from '@/application/use-cases/GetAttendanceByWeek';

export function useAttendance() {
  const repository = new AttendanceRepositoryImpl();
  const getFiltersUseCase = new GetFilters(repository);
  const getAttendanceUseCase = new GetAttendanceByWeek(repository);

  const anioSeleccionado = ref(new Date().getFullYear());
  const semanaSeleccionada = ref(null);
  const añosDisponibles = ref([]);
  const semanasDisponibles = ref([]);
  const dias = ref([]);
  const registros = ref([]);
  const cargando = ref(false);
  const error = ref(null);
  
  let mapaFiltros = {};

  const cargarFiltros = async () => {
    try {
      cargando.value = true;
      mapaFiltros = await getFiltersUseCase.execute();
      
      // Obtener años ordenados de forma descendente (más reciente primero)
      añosDisponibles.value = Object.keys(mapaFiltros).map(Number).sort((a, b) => b - a);
      
      const anioActual = new Date().getFullYear();
      if (añosDisponibles.value.includes(anioActual)) {
        anioSeleccionado.value = anioActual;
      } else if (añosDisponibles.value.length > 0) {
        anioSeleccionado.value = añosDisponibles.value[0];
      }

      actualizarSemanas();
    } catch (err) {
      console.error(err);
      error.value = "Error al conectar con el servidor para obtener los filtros.";
    } finally {
      cargando.value = false;
    }
  };

  const actualizarSemanas = () => {
    const anio = anioSeleccionado.value;
    if (mapaFiltros[anio]) {
      // Ordenar semanas ascendentemente (1, 2, 3...)
      semanasDisponibles.value = mapaFiltros[anio].sort((a, b) => a - b);
      
      // Si la semana actual no está seleccionada o no es válida en este año, seleccionar la primera
      if (semanasDisponibles.value.length > 0) {
        // Intentar calcular la semana actual
        const hoy = new Date();
        const hoySemana = getISOWeekNumber(hoy);
        if (semanasDisponibles.value.includes(hoySemana)) {
          semanaSeleccionada.value = hoySemana;
        } else {
          semanaSeleccionada.value = semanasDisponibles.value[0];
        }
      }
    } else {
      semanasDisponibles.value = [];
      semanaSeleccionada.value = null;
    }
  };

  const buscarAsistencias = async () => {
    if (!anioSeleccionado.value || !semanaSeleccionada.value) return;
    try {
      cargando.value = true;
      error.value = null;
      const resultado = await getAttendanceUseCase.execute(anioSeleccionado.value, semanaSeleccionada.value);
      dias.value = resultado.dias;
      registros.value = resultado.registros;
    } catch (err) {
      console.error(err);
      error.value = "Error al cargar los registros de la semana seleccionada.";
    } finally {
      cargando.value = false;
    }
  };

  // Helper local para calcular la semana ISO
  function getISOWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }

  // Escuchar cambios de año para re-evaluar semanas disponibles
  watch(anioSeleccionado, () => {
    actualizarSemanas();
    buscarAsistencias();
  });

  // Escuchar cambios de semana para invocar búsqueda
  watch(semanaSeleccionada, () => {
    buscarAsistencias();
  });

  onMounted(() => {
    cargarFiltros();
  });

  return {
    anioSeleccionado,
    semanaSeleccionada,
    añosDisponibles,
    semanasDisponibles,
    dias,
    registros,
    cargando,
    error,
    buscarAsistencias
  };
}
