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
  <aside class="w-64 bg-gray-800 text-white flex flex-col">
    <div class="p-6 text-center border-b border-gray-700">
      <h2 class="text-2xl font-bold text-blue-400">Sistema RH</h2>
      <p class="text-xs text-gray-400 mt-1">Panel de Administración</p>
    </div>

    <nav class="flex-1 p-4 space-y-2">
      <button @click="emit('cambiar-vista', 'reporte')"
        :class="['w-full text-left px-4 py-3 rounded-lg transition', vistaActiva === 'reporte' ? 'bg-blue-600' : 'hover:bg-gray-700']">
        📄 Procesar Excel
      </button>

      <button @click="emit('cambiar-vista', 'empleados')"
        :class="['w-full text-left px-4 py-3 rounded-lg transition', vistaActiva === 'empleados' ? 'bg-blue-600' : 'hover:bg-gray-700']">
        👥 Gestión de Empleados
      </button>

      <button @click="emit('cambiar-vista', 'consultas')"
        :class="['w-full text-left px-4 py-3 rounded-lg transition', vistaActiva === 'consultas' ? 'bg-blue-600' : 'hover:bg-gray-700']">
        🔍 Incidencias
      </button>

      <button @click="emit('cambiar-vista', 'historial')"
        :class="['w-full text-left px-4 py-3 rounded-lg transition', vistaActiva === 'historial' ? 'bg-blue-600' : 'hover:bg-gray-700']">
        🗂️ Historial Quincenal
      </button>

      <button @click="emit('cambiar-vista', 'perfil')"
        :class="['w-full text-left px-4 py-3 rounded-lg transition', vistaActiva === 'perfil' ? 'bg-blue-600' : 'hover:bg-gray-700']">
        ⚙️ Mi Perfil
      </button>
    </nav>

    <div class="p-4 border-t border-gray-700">
      <button @click="cerrarSesion" class="w-full text-left px-4 py-2 text-red-400 hover:bg-gray-700 rounded-lg transition">
        🚪 Cerrar Sesión
      </button>
    </div>
  </aside>
</template>