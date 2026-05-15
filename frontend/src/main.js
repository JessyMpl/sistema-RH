import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './style.css'

// 💡 1. Importamos la tabla dinámica y sus estilos
import Vue3EasyDataTable from 'vue3-easy-data-table';
import 'vue3-easy-data-table/dist/style.css';

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 💡 2. Registramos el componente globalmente para usarlo en todo el sistema
app.component('EasyDataTable', Vue3EasyDataTable);

app.mount('#app')