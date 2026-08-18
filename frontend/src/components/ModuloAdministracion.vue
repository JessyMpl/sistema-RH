<script setup>
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api'; // Asegúrate de que esta ruta sea correcta

const tabActiva = ref('areas'); 
const valorBusquedaArea = ref('');
const cargandoAreas = ref(false);
const listaAreas = ref([]);

const headersAreas = [
  { text: "ID", value: "id", sortable: true, width: 80 },
  { text: "NOMBRE DEL ÁREA O DEPARTAMENTO", value: "nombre", sortable: true },
  { text: "ACCIONES", value: "acciones", align: "center", width: 150 }
];

// 1. CARGAR DATOS
const cargarAreas = async () => {
  cargandoAreas.value = true;
  try {
    const res = await fetch(apiUrl('/api/administracion/areas'));
    if (!res.ok) throw new Error('Error al obtener datos');
    listaAreas.value = await res.json();
  } catch (error) {
    console.error(error);
  } finally {
    cargandoAreas.value = false;
  }
};

// 2. CREAR
const abrirModalNuevaArea = async () => {
  const { value: nombreArea } = await Swal.fire({
    title: 'Nueva Área de Adscripción',
    input: 'text',
    inputPlaceholder: 'Ej. DIRECCIÓN JURÍDICA',
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#6B1C3A',
    inputValidator: (value) => {
      if (!value) return '¡Necesitas escribir un nombre!';
    }
  });

  if (nombreArea) {
    try {
      const res = await fetch(apiUrl('/api/administracion/areas'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombreArea })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      Swal.fire('¡Éxito!', 'El área se registró correctamente.', 'success');
      cargarAreas();
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    }
  }
};

// 3. ACTUALIZAR
const editarArea = async (area) => {
  const { value: nuevoNombre } = await Swal.fire({
    title: 'Editar Área',
    input: 'text',
    inputValue: area.nombre,
    showCancelButton: true,
    confirmButtonText: 'Actualizar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#6B1C3A',
    inputValidator: (value) => {
      if (!value) return 'El nombre no puede quedar vacío';
    }
  });

  if (nuevoNombre && nuevoNombre !== area.nombre) {
    try {
      const res = await fetch(apiUrl(`/api/administracion/areas/${area.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoNombre })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      Swal.fire('¡Actualizado!', 'El nombre del área cambió.', 'success');
      cargarAreas();
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    }
  }
};

// 4. ELIMINAR (Baja Lógica)
const eliminarArea = async (area) => {
  const result = await Swal.fire({
    title: '¿Eliminar Área?',
    text: `Darás de baja: ${area.nombre}. Ya no aparecerá al registrar personal.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#902c3e',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(apiUrl(`/api/administracion/areas/${area.id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      
      Swal.fire('¡Eliminado!', 'El área fue dada de baja.', 'success');
      cargarAreas();
    } catch (error) {
      Swal.fire('Error', 'No se pudo eliminar el área.', 'error');
    }
  }
};

// ==========================================
// 2. LÓGICA PARA DÍAS INHÁBILES
// ==========================================
const valorBusquedaDia = ref('');
const cargandoDias = ref(false);
const listaDias = ref([]);

const headersDias = [
  { text: "FECHA", value: "fechaFormat", sortable: true, width: 120 },
  { text: "TIPO", value: "tipo", sortable: true, width: 130 },
  { text: "DESCRIPCIÓN", value: "descripcion", sortable: true },
  { text: "ACCIONES", value: "acciones", align: "center", width: 100 }
];

const cargarDias = async () => {
  cargandoDias.value = true;
  try {
    const res = await fetch(apiUrl('/api/administracion/dias-inhabiles'));
    if (!res.ok) throw new Error('Error al obtener datos');
    const data = await res.json();
    
    listaDias.value = data.map(d => ({
      ...d,
      // Formateamos la fecha a YYYY-MM-DD limpio para la vista
      fechaFormat: new Date(d.fecha).toISOString().split('T')[0]
    }));
  } catch (error) {
    console.error(error);
  } finally {
    cargandoDias.value = false;
  }
};

const abrirModalNuevoDia = async () => {
  const { value: formValues } = await Swal.fire({
    title: 'Registrar Día Inhábil',
    html: `
      <div class="text-left space-y-4 mt-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha exacta:</label>
          <input type="date" id="swal-fecha" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario">
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Clasificación:</label>
          <select id="swal-tipo" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario">
            <option value="FERIADO">Día Feriado Oficial</option>
            <option value="VACACIONES">Periodo Vacacional</option>
            <option value="SIN_CONTRATO">Día sin Contrato (Aplica a TODOS)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo / Descripción:</label>
          <input type="text" id="swal-desc" placeholder="Ej. Aniversario de la Independencia" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario">
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Guardar Fecha',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#6B1C3A',
    preConfirm: () => {
      const fecha = document.getElementById('swal-fecha').value;
      const tipo = document.getElementById('swal-tipo').value;
      const descripcion = document.getElementById('swal-desc').value;
      if (!fecha || !descripcion) {
        Swal.showValidationMessage('La fecha y el motivo son obligatorios.');
        return false;
      }
      return { fecha, tipo, descripcion };
    }
  });

  if (formValues) {
    try {
      const res = await fetch(apiUrl('/api/administracion/dias-inhabiles'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      Swal.fire('¡Guardado!', 'La fecha se registró en el calendario.', 'success');
      cargarDias();
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    }
  }
};

const eliminarDia = async (dia) => {
  const result = await Swal.fire({
    title: '¿Eliminar Fecha?',
    text: `Borrarás el ${dia.tipo.replace('_', ' ')} del ${dia.fechaFormat}.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#902c3e',
    confirmButtonText: 'Sí, borrar',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(apiUrl(`/api/administracion/dias-inhabiles/${dia.id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      
      Swal.fire('¡Eliminado!', 'El día fue removido del calendario.', 'success');
      cargarDias();
    } catch (error) {
      Swal.fire('Error', 'No se pudo eliminar el registro.', 'error');
    }
  }
};

// ==========================================
// 3. LÓGICA PARA USUARIOS DEL SISTEMA
// ==========================================
const valorBusquedaUsuario = ref('');
const cargandoUsuarios = ref(false);
const listaUsuarios = ref([]);

const headersUsuarios = [
  { text: "NOMBRE", value: "nombre", sortable: true },
  { text: "CORREO ELECTRÓNICO", value: "email", sortable: true },
  { text: "PERFIL", value: "rol", sortable: true, width: 120 },
  { text: "SEGURIDAD", value: "acciones", align: "center", width: 150 }
];

const cargarUsuarios = async () => {
  cargandoUsuarios.value = true;
  try {
    const res = await fetch(apiUrl('/api/administracion/usuarios'));
    if (!res.ok) throw new Error('Error al obtener datos');
    listaUsuarios.value = await res.json();
  } catch (error) {
    console.error(error);
  } finally {
    cargandoUsuarios.value = false;
  }
};

const abrirModalNuevoUsuario = async () => {
  const { value: formValues } = await Swal.fire({
    title: 'Registrar Nuevo Usuario',
    html: `
      <div class="text-left space-y-4 mt-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo:</label>
          <input type="text" id="swal-user-nombre" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario">
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Correo (Usuario de acceso):</label>
          <input type="email" id="swal-user-email" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario">
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Contraseña Inicial:</label>
          <input type="password" id="swal-user-pass" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario">
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Rol / Permisos:</label>
          <select id="swal-user-rol" class="w-full p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario">
            <option value="RH">Recursos Humanos (Operador)</option>
            <option value="ADMIN">Administrador (Control Total)</option>
          </select>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Registrar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#6B1C3A',
    preConfirm: () => {
      const nombre = document.getElementById('swal-user-nombre').value;
      const email = document.getElementById('swal-user-email').value;
      const password = document.getElementById('swal-user-pass').value;
      const rol = document.getElementById('swal-user-rol').value;

      if (!nombre || !email || !password) {
        Swal.showValidationMessage('Nombre, correo y contraseña son obligatorios.');
        return false;
      }
      return { nombre, email, password, rol };
    }
  });

  if (formValues) {
    try {
      const res = await fetch(apiUrl('/api/administracion/usuarios'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      Swal.fire('¡Registrado!', 'El usuario ya puede acceder al sistema.', 'success');
      cargarUsuarios();
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    }
  }
};

const cambiarPassword = async (usuario) => {
  const { value: nuevaPassword } = await Swal.fire({
    title: 'Resetear Contraseña',
    text: `Para: ${usuario.nombre}`,
    input: 'password',
    inputPlaceholder: 'Escribe la nueva contraseña',
    showCancelButton: true,
    confirmButtonText: 'Actualizar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#6B1C3A',
    inputValidator: (value) => {
      if (!value || value.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
    }
  });

  if (nuevaPassword) {
    try {
      const res = await fetch(apiUrl(`/api/administracion/usuarios/${usuario.id}/password`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevaPassword })
      });
      if (!res.ok) throw new Error('Error al actualizar');
      
      Swal.fire('¡Actualizada!', 'La contraseña fue cambiada exitosamente.', 'success');
    } catch (error) {
      Swal.fire('Error', 'No se pudo cambiar la contraseña.', 'error');
    }
  }
};

const eliminarUsuario = async (usuario) => {
  const result = await Swal.fire({
    title: '¿Revocar acceso?',
    text: `Eliminarás permanentemente al usuario ${usuario.email}.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#902c3e',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(apiUrl(`/api/administracion/usuarios/${usuario.id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      
      Swal.fire('¡Eliminado!', 'El acceso fue revocado.', 'success');
      cargarUsuarios();
    } catch (error) {
      Swal.fire('Error', 'No se pudo eliminar el usuario.', 'error');
    }
  }
};

// Arrancar al inicio
onMounted(() => {
  cargarAreas();
  cargarDias();
  cargarUsuarios();
});
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- Encabezado y Pestañas -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h2 class="text-xl font-bold text-gray-800 mb-4 border-b pb-2">
        <i class="fa-solid fa-gears text-inst-primario mr-2"></i> Configuración del Sistema
      </h2>
      
      <div class="flex flex-wrap gap-2">
        <button @click="tabActiva = 'areas'" :class="['px-6 py-2 rounded-md font-bold text-sm transition', tabActiva === 'areas' ? 'bg-inst-primario text-white shadow' : 'text-gray-600 hover:bg-gray-100 border border-gray-200']">
          <i class="fa-solid fa-sitemap mr-2"></i> Áreas de Adscripción
        </button>
        <button @click="tabActiva = 'dias'" :class="['px-6 py-2 rounded-md font-bold text-sm transition', tabActiva === 'dias' ? 'bg-inst-primario text-white shadow' : 'text-gray-600 hover:bg-gray-100 border border-gray-200']">
          <i class="fa-solid fa-calendar-xmark mr-2"></i> Días Inhábiles
        </button>
        <button @click="tabActiva = 'usuarios'" :class="['px-6 py-2 rounded-md font-bold text-sm transition', tabActiva === 'usuarios' ? 'bg-inst-primario text-white shadow' : 'text-gray-600 hover:bg-gray-100 border border-gray-200']">
          <i class="fa-solid fa-users-gear mr-2"></i> Usuarios
        </button>
      </div>
    </div>

    <!-- CONTENIDO: ÁREAS DE ADSCRIPCIÓN -->
    <div v-if="tabActiva === 'areas'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="w-full max-w-md relative">
          <i class="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
          <input v-model="valorBusquedaArea" type="text" placeholder="Buscar área..." class="w-full pl-10 p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario" />
        </div>
        
        <button @click="abrirModalNuevaArea" class="px-4 py-2 bg-inst-primario hover:bg-inst-secundario text-white font-bold rounded shadow-sm transition text-sm flex items-center gap-2 whitespace-nowrap">
          <i class="fa-solid fa-plus"></i> Registrar Nueva Área
        </button>
      </div>

      <EasyDataTable 
        :headers="headersAreas" 
        :items="listaAreas" 
        :search-value="valorBusquedaArea" 
        :search-field="['nombre']" 
        :rows-per-page="10" 
        :loading="cargandoAreas"
        table-class-name="img-strattia-style"
      >
        <template #item-nombre="item">
          <span class="font-bold text-gray-700">{{ item.nombre }}</span>
        </template>
        
        <template #item-acciones="item">
          <div class="flex justify-center gap-2">
            <button @click="editarArea(item)" class="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded text-xs font-bold transition">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button @click="eliminarArea(item)" class="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-2 py-1 rounded text-xs font-bold transition">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </template>
      </EasyDataTable>
    </div>

   
    <!-- CONTENIDO: DÍAS INHÁBILES -->
    <div v-if="tabActiva === 'dias'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="w-full max-w-md relative">
          <i class="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
          <input v-model="valorBusquedaDia" type="text" placeholder="Buscar por año o descripción..." class="w-full pl-10 p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario" />
        </div>
        
        <button @click="abrirModalNuevoDia" class="px-4 py-2 bg-inst-primario hover:bg-inst-secundario text-white font-bold rounded shadow-sm transition text-sm flex items-center gap-2 whitespace-nowrap">
          <i class="fa-solid fa-calendar-plus"></i> Registrar Fecha
        </button>
      </div>

      <EasyDataTable 
        :headers="headersDias" 
        :items="listaDias" 
        :search-value="valorBusquedaDia" 
        :search-field="['fechaFormat', 'descripcion', 'tipo']" 
        :rows-per-page="15" 
        :loading="cargandoDias"
        table-class-name="img-strattia-style"
      >
        <template #item-fechaFormat="item">
          <span class="font-mono font-bold text-gray-700">{{ item.fechaFormat }}</span>
        </template>

        <template #item-tipo="item">
          <span :class="item.tipo === 'FERIADO' ? 'bg-blue-100 text-blue-800' : item.tipo === 'VACACIONES' ? 'bg-green-100 text-green-800' : 'bg-gray-600 text-white'" class="px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow-sm">
            {{ item.tipo.replace('_', ' ') }}
          </span>
        </template>
        
        <template #item-acciones="item">
          <button @click="eliminarDia(item)" class="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-2 py-1 rounded text-xs font-bold transition">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </template>
      </EasyDataTable>
    </div>

    <!-- CONTENIDO: USUARIOS -->
    <div v-if="tabActiva === 'usuarios'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="w-full max-w-md relative">
          <i class="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
          <input v-model="valorBusquedaUsuario" type="text" placeholder="Buscar por nombre o correo..." class="w-full pl-10 p-2 border border-gray-300 rounded text-sm outline-none focus:border-inst-primario" />
        </div>
        
        <button @click="abrirModalNuevoUsuario" class="px-4 py-2 bg-inst-primario hover:bg-inst-secundario text-white font-bold rounded shadow-sm transition text-sm flex items-center gap-2 whitespace-nowrap">
          <i class="fa-solid fa-user-plus"></i> Nuevo Usuario
        </button>
      </div>

      <EasyDataTable 
        :headers="headersUsuarios" 
        :items="listaUsuarios" 
        :search-value="valorBusquedaUsuario" 
        :search-field="['nombre', 'email']" 
        :rows-per-page="10" 
        :loading="cargandoUsuarios"
        table-class-name="img-strattia-style"
      >
        <template #item-nombre="item">
          <span class="font-bold text-gray-700">{{ item.nombre }}</span>
        </template>
        
        <template #item-rol="item">
          <span :class="item.rol === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'" class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border">
            {{ item.rol }}
          </span>
        </template>
        
        <template #item-acciones="item">
          <div class="flex justify-center gap-2">
            <button @click="cambiarPassword(item)" class="bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded text-xs font-bold transition" title="Cambiar Contraseña">
              <i class="fa-solid fa-key"></i>
            </button>
            <button @click="eliminarUsuario(item)" class="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-2 py-1 rounded text-xs font-bold transition" title="Eliminar Usuario">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </template>
      </EasyDataTable>
    </div>

  </div>
</template>

<style scoped>
/* Los colores de tu diseño */
.bg-inst-primario { background-color: #6B1C3A; }
.text-inst-primario { color: #6B1C3A; }
.border-inst-primario { border-color: #6B1C3A; }
.bg-inst-secundario { background-color: #902c3e; }

/* Reutilizamos el estilo de tus tablas */
.img-strattia-style {
  --easy-table-header-background-color: #f8fafc;
  --easy-table-header-font-color: #475569;
  --easy-table-header-font-size: 13px;
  --easy-table-body-row-font-size: 13px;
  --easy-table-border: 1px solid #e2e8f0;
  --easy-table-row-border: 1px solid #e2e8f0;
}
</style>