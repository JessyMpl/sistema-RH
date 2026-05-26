<script setup>
import { useRouter } from 'vue-router';

// Recibimos la variable 'vistaActiva' desde el Panel
defineProps({
  vistaActiva: String
});

// Preparamos el emisor para avisarle al Panel que queremos cambiar de vista
const emit = defineEmits(['cambiar-vista']);

const router = useRouter();

const cerrarSesion = () => {
  localStorage.removeItem('token');
  router.push('/');
};
</script>

<template>
  <aside class="w-64 bg-inst-primario text-white flex flex-col min-h-screen">
    <div class="p-6 text-center border-b border-white/20">
      <h2 class="text-2xl font-bold text-white">Sistema Control de Asistencia</h2>
      <p class="text-xs text-white mt-1 ">Panel de Administración</p>
    </div>

   <nav class="flex-1 p-4 space-y-2">
      <button @click="emit('cambiar-vista', 'reporte')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'reporte' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-fingerprint w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Procesar Datos</span>
      </button>

        <button @click="emit('cambiar-vista', 'consultas')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'consultas' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-magnifying-glass w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Consultas</span>
      </button>

       <button @click="emit('cambiar-vista', 'empleados')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'empleados' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-users w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight"> Gestión Personal</span>
      </button>

         <button @click="emit('cambiar-vista', 'incidencias')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'incidencias' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-circle-exclamation w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Incidencias</span>
      </button>

       <button @click="emit('cambiar-vista', 'justificaciones')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'justificaciones' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-file-pen w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Justificaciones</span>
      </button>

      <button @click="emit('cambiar-vista', 'reporteFinal')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'reporteFinal' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-calendar w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight"> Reporte </span>
      </button>
      

      <button @click="emit('cambiar-vista', 'perfil')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'perfil' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-gear w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Mi Perfil</span>
      </button>
    </nav>

    <div class="p-4 border-t border-white/20">
      <button @click="cerrarSesion" class="w-full flex items-center px-4 py-2 text-white rounded-lg transition">
        <i class="fa-solid fa-arrow-right-from-bracket w-6 text-center mr-2 text-lg"></i>
        <span class="hover:underline ">Cerrar Sesión</span>
      </button>
    </div>
  </aside>
</template>