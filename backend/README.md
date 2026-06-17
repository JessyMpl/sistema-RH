# 💼 API de Control Biométrico y Asistencia — RRHH (Backend)

Este es el backend del sistema de control de asistencia y biométricos de Recursos Humanos, desarrollado con **Express.js**, **Prisma ORM**, y **Neon PostgreSQL**.

---

## 🎯 Objetivo del Proyecto

El objetivo principal de esta API es automatizar, validar y procesar el registro de entradas y salidas (checadas) de los empleados. Transforma datos crudos provenientes de relojes checadores (generalmente importados desde archivos Excel) en reportes limpios de puntualidad y asistencia.

### Funcionalidades Clave
1. **Gestión de Empleados (Servidores Públicos):** Altas, bajas, cambios de departamento e historial de movimientos.
2. **Procesamiento de Biométricos (Excel):** Lectura, previsualización y guardado de archivos de checadas quincenales, calculando retardos de manera automática basados en las tolerancias y políticas institucionales.
3. **Cálculo de Regímenes de Trabajo:** Lógica especializada para personal `NORMAL` (horario de oficina), `ESPECIAL` (guardias 24x48 o turnos rotativos), `LISTA` (asistencia por pase de lista), y `EXENTO` (personal directivo/exento).
4. **Justificaciones:** Registro de incidencias justificadas (comisiones, incapacidades, etc.) con diferentes coberturas (Entrada, Salida o Completo).
5. **Generador de Reportes (Sábana):** Creación y descarga directa en Excel utilizando plantillas preestablecidas y diseño de colores condicionales (para retardos y faltas) usando `exceljs`.
6. **Autenticación:** Sistema de login seguro con encriptación `bcryptjs` y tokens JWT.

---

## 🚀 Cómo Iniciar el Proyecto y Comandos de Desarrollo

### 1. Levantar el Servidor Backend
Para encender la API de Express, ejecuta en la carpeta `backend`:
```bash
node index.js
```
*(Nota: Si usas `nodemon` para desarrollo con recarga automática, puedes usar `npx nodemon index.js` o configurar un script de inicio).*

### 2. Levantar el Frontend (Interfaz de Usuario)
Para levantar la aplicación cliente (generalmente ubicada en la carpeta del frontend):
```bash
npx pnpm run dev --host
```
El parámetro `--host` permite exponer el servidor de desarrollo en la red local.

### 3. Linteado (Lint con ESLint)
Para analizar y validar la calidad y formato del código Javascript:
```bash
npm run lint
```

---

## 🗺️ Arquitectura de la Base de Datos

A continuación se presenta el modelo relacional del sistema definido en Prisma:

```mermaid
erDiagram
    Usuario {
        Int id PK
        String nombre
        String email UK
        String password
        String rol
    }

    Horario {
        Int id PK
        String nombre
        String horaEntrada
        String horaSalida
    }

    ServidorPublico {
        Int id PK
        String nombreCompleto
        String numeroEmpleado UK
        String departamento
        Regimen regimen
        Boolean activo
        Int horarioId FK
        DateTime fechaIngreso
        DateTime fechaBaja
        String motivoBaja
    }

    Asistencia {
        Int id PK
        DateTime fecha
        String entrada
        String salida
        Int minutosRetardo
        String incidencia
        Int servidorId FK
    }

    HistorialMovimiento {
        Int id PK
        Int servidorId FK
        String tipoMovimiento
        String datoAnterior
        String datoNuevo
        DateTime fecha
    }

    Justificacion {
        Int id PK
        String motivo
        String folioDocumento
        String observaciones
        String cobertura
        DateTime fechaRegistro
        Int servidorId FK
        Int asistenciaId FK "1:1"
    }

    Horario ||--o{ ServidorPublico : "aplica a"
    ServidorPublico ||--o{ Asistencia : "registra"
    ServidorPublico ||--o{ HistorialMovimiento : "tiene"
    ServidorPublico ||--o{ Justificacion : "solicita"
    Asistencia ||--|| Justificacion : "justifica (1:1)"
```

### Explicación de las Tablas y Relaciones
*   **`Horario`:** Almacena los turnos permitidos (ej. "Administrativo" con entrada a las 09:00 y salida a las 18:00).
*   **`ServidorPublico`:** Es el catálogo de personal. Contiene datos laborales clave y se relaciona con un `Horario`. Soporta campos para el control de expediente (`fechaIngreso`, `fechaBaja`).
*   **`Asistencia`:** Registra las entradas, salidas, retardo calculado en minutos y la incidencia (ej. `FALTA`, `RETARDO`, `OMISION_E`). Tiene una restricción única compuesta `@@unique([servidorId, fecha])` para evitar duplicar registros en un mismo día.
*   **`HistorialMovimiento`:** Bitácora histórica automática. Cuando editas el departamento o régimen de un empleado, el sistema guarda un registro de auditoría aquí.
*   **`Justificacion`:** Almacena los justificantes oficiales que anulan las incidencias de asistencia. Se vincula **1 a 1** con un registro de asistencia específico y resguarda datos como folio del oficio y tipo de cobertura (`ENTRADA`, `SALIDA` o `COMPLETO`).

---

## ⚡ Neon: La Base de Datos Serverless

### ¿Qué es Neon?
**Neon** es un servicio de base de datos **PostgreSQL Serverless** (en la nube). 

### Conceptos Clave para entender Neon:
1.  **Arquitectura Separada (Almacenamiento y Cómputo):** Neon separa el motor de procesamiento (cómputo) del almacenamiento de los datos. Esto permite que el cómputo se apague o encienda a demanda.
2.  **Auto-suspensión (Cold Starts):** Si la API no realiza consultas durante unos minutos, Neon suspende automáticamente el cómputo para ahorrar recursos. Cuando la API vuelve a hacer una petición, la base de datos se activa en unos milisegundos de forma transparente.
3.  **Branching (Ramificación):** Al igual que en Git, Neon permite crear "ramas" de la base de datos con un clic. Puedes crear una rama de pruebas (con todos los datos de producción) para ensayar migraciones complejas sin alterar la base de datos real.

---

## ⬢ Prisma ORM: El Traductor de la Base de Datos

### ¿Qué es Prisma?
**Prisma** es un ORM (Object-Relational Mapper) de última generación. En lugar de escribir consultas SQL puras (como `SELECT * FROM ...`), usas métodos nativos de Javascript estructurados en objetos, obteniendo auto-completado y validación de tipos automática.

### Componentes de Prisma en este Proyecto:
1.  **El Archivo `prisma/schema.prisma`:** Es el archivo central de configuración de base de datos. Define la conexión y estructura de las tablas.
2.  **El Conector de PostgreSQL y Adaptador Serverless (`@prisma/adapter-pg`):**
    Dado que Neon es serverless y las conexiones pueden abrirse/cerrarse constantemente, el proyecto usa un pool de conexiones tradicional de Node-Postgres (`pg`) y se lo inyecta a Prisma a través de `@prisma/adapter-pg`.

---

## 🔗 Integración y Flujo de Conexión en el Código

En el backend, la conexión se centraliza en [config/db.js](file:///var/www/html/sites/biometrico/backend/config/db.js):

```javascript
// backend/config/db.js
require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// 1. Creamos la piscina (pool) de conexiones físicas usando la URL de Neon
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 2. Pasamos esa piscina al adaptador compatible con Prisma
const adapter = new PrismaPg(pool);

// 3. Inicializamos el Cliente de Prisma inyectándole el adaptador
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
```

### 🚨 Corrección y Optimización Realizada en la Validación
Durante la revisión del proyecto, se identificó un problema potencial:
*   Existía un archivo `database.js` en la raíz del proyecto y otro en `config/db.js`, ambos instanciando **dos clientes de Prisma distintos**.
*   Esto habría generado dos pools de conexiones a Neon, agotando rápidamente la cuota de conexiones simultáneas del plan gratuito de la base de datos.
*   **Solución Aplicada:** Se modificó [database.js](file:///var/www/html/sites/biometrico/backend/database.js) en la raíz para que actúe únicamente como redirección al módulo centralizado:
    ```javascript
    const prisma = require('./config/db');
    module.exports = prisma;
    ```
    Y se re-enrutó el import en [routes/empleadoRoutes.js](file:///var/www/html/sites/biometrico/backend/routes/empleadoRoutes.js) para utilizar el archivo centralizado, logrando un patrón **Singleton** único para toda la aplicación.

---

## 🛠️ Comandos de Administración de Prisma

Para administrar la base de datos en tu entorno local, ejecuta estos comandos dentro de la carpeta `backend`:

*   **Sincronizar base de datos con el esquema actual (sin borrar datos si es posible):**
    ```bash
    npx prisma db push
    ```
    *Esta instrucción sincroniza el archivo de esquema `schema.prisma` directamente con la base de datos de Neon.*

*   **Generar el Cliente (Indispensable tras modificar schema.prisma):**
    ```bash
    npx prisma generate
    ```
    *Esta instrucción genera el Prisma Client, que es la librería interna de Javascript para realizar consultas.*

*   **Prisma Studio (Una interfaz gráfica web excelente para ver y editar los datos de tu BD):**
    ```bash
    npx prisma studio
    ```

---

## 💡 Ejemplos de Consultas Reales Usadas en el Backend

### 1. Lectura con Filtros y Relaciones (Select con Join)
Para obtener las asistencias pendientes de justificación de un empleado:
```javascript
const pendientes = await prisma.asistencia.findMany({
  where: {
    AND: [
      { incidencia: { in: ['RETARDO', 'FALTA'] } },
      { justificacion: null } // Que no tengan justificación registrada
    ]
  },
  include: {
    servidor: true // Realiza un JOIN implícito para traer los datos del empleado
  }
});
```

### 2. Transacciones Atómicas (Todo o Nada)
Cuando registras una justificación, debes **crear el registro de justificación** e inmediatamente **actualizar la asistencia** a "JUSTIFICADA". Si uno falla, el otro debe revertirse (Rollback). En Prisma se logra con `$transaction`:
```javascript
await prisma.$transaction([
  prisma.justificacion.create({
    data: {
      asistenciaId: 10,
      servidorId: 5,
      motivo: "Comisión médica"
    }
  }),
  prisma.asistencia.update({
    where: { id: 10 },
    data: {
      incidencia: "JUSTIFICADA",
      minutosRetardo: 0
    }
  })
]);
```

### 3. Operaciones Masivas Raw SQL (Desempeño Nivel Dios)
Para la importación masiva de empleados desde Excel, en lugar de hacer miles de consultas individuales, la API construye un `INSERT INTO ... ON CONFLICT ("numeroEmpleado") DO UPDATE ...` en bloque, ejecutándolo en una sola consulta de alto rendimiento con:
```javascript
await prisma.$executeRawUnsafe(query);
```

---

## 📡 Endpoints de Integración — Asistencia (Cron / App Electron)

La API expone endpoints bajo el prefijo `/api/v1/attendance` para recibir registros de asistencia de manera masiva y automatizada con validación y deduplicación.

### 🔐 Autenticación
Los endpoints requieren autenticación mediante un Token Bearer estático configurado en el entorno (`RH_API_TOKEN` en `.env`).
```http
Authorization: Bearer 0813585dcf5ee7cc4941a590cebb1b6b4e7e1287dad4c03c8e3f0ca256885c73
```

### 1. Script Automático (Cron) — `POST /api/v1/attendance/cron`
Recibe lotes masivos de registros automáticos.
*   **Source requerido:** `hikvision-cron`
*   **Body de ejemplo:**
    ```json
    {
      "records": [
        {
          "employeeId": "12345",
          "timestamp": "2026-06-05T09:01:23-06:00",
          "serialNumber": "987654321",
          "cardNumber": "A1B2C3D4"
        }
      ],
      "source": "hikvision-cron",
      "syncDate": "2026-06-05T15:00:00.000Z"
    }
    ```

### 2. App de Escritorio (Electron) — `POST /api/v1/attendance/app`
Recibe registros extraídos y subidos de forma manual desde relojes específicos.
*   **Source requerido:** `app-manual`
*   **Campos adicionales obligatorios:** `clockIp` (IP del reloj checador).
*   **Body de ejemplo:**
    ```json
    {
      "records": [
        {
          "employeeId": "12345",
          "timestamp": "2026-06-05T09:01:23-06:00",
          "serialNumber": "987654321",
          "cardNumber": "A1B2C3D4"
        }
      ],
      "source": "app-manual",
      "clockIp": "192.168.103.29",
      "clockName": "TECNOLOGIAS",
      "syncDate": "2026-06-05T16:50:00.000Z"
    }
    ```

### 📤 Formato de Respuestas (Ejemplo)
*   **`200 OK` (Procesamiento completo):**
    ```json
    {
      "success": true,
      "message": "Lote procesado correctamente",
      "data": {
        "received": 1,
        "inserted": 1,
        "duplicated": 0,
        "errors": 0
      }
    }
    ```
*   **`207 Multi-Status` (Procesado con algunos registros corruptos o incompletos):**
    ```json
    {
      "success": false,
      "message": "Lote procesado con algunos errores de validación",
      "data": {
        "received": 2,
        "inserted": 1,
        "duplicated": 0,
        "errors": 1
      }
    }
    ```

---

## 📅 Catálogo de Calendario y Consultas Filtradas (Año y Semana)

Se ha implementado una tabla de **Calendario** (`calendario`) que actúa como catálogo de fechas para dar soporte al filtrado cronológico.

### 1. El Modelo `Calendario`
Este modelo desglosa cada fecha individual en componentes listos para consulta:
*   `fecha`: Formato `DATE` único.
*   `anio` / `mes` / `dia`.
*   `semana`: Semana ISO del año (1 a 53).
*   `diaSemana`: Día de la semana (1 = Lunes, 7 = Domingo).
*   `quincena`: Primer quincena (1) o Segunda quincena (2).
*   `esLaboral`: Indica si es de Lunes a Viernes.

### 2. Poblar el Calendario (Semilla de 21 años: 2020 a 2040)
Para poblar la tabla con el catálogo de fechas (cubriendo el pasado y 15 años al futuro), ejecuta el script de semilla creado en [scripts/seedCalendario.js](file:///var/www/html/sites/biometrico/backend/scripts/seedCalendario.js):
```bash
node scripts/seedCalendario.js
```

---

### 3. Endpoints de Consulta de Asistencia

#### A. Obtener Registros Filtrados — `GET /api/v1/attendance/registros`
Devuelve la estructura de días correspondientes a la semana solicitada y todos los registros de asistencia dentro de ese intervalo.
*   **Parámetros query (Opcionales):**
    *   `anio`: Año a filtrar (Ej. `2026`). Si se omite, calcula el año actual.
    *   `semana`: Semana del año (Ej. `23`). Si se omite, calcula la semana actual.
*   **Ejemplo de llamada:**
    `GET /api/v1/attendance/registros?anio=2026&semana=23`
*   **Respuesta Exitosa (`200 OK`):**
    ```json
    {
      "success": true,
      "anio": 2026,
      "semana": 23,
      "dias": [
        {
          "id": 2345,
          "fecha": "2026-06-08T00:00:00.000Z",
          "anio": 2026,
          "mes": 6,
          "dia": 8,
          "semana": 23,
          "diaSemana": 1,
          "quincena": 1,
          "esLaboral": true
        }
      ],
      "registros": [
        {
          "id": "1098237192",
          "employeeId": "12345",
          "timestamp": "2026-06-08T09:01:23.000Z",
          "serialNumber": "987654321",
          "cardNumber": "A1B2C3D4",
          "source": "hikvision-cron",
          "clockIp": "",
          "clockName": "",
          "syncDate": "2026-06-08T15:00:00.000Z",
          "createdAt": "2026-06-08T15:05:00.000Z"
        }
      ]
    }
    ```

#### B. Obtener Filtros Disponibles — `GET /api/v1/attendance/filtros-disponibles`
Devuelve un catálogo estructurado de todos los años y semanas que contienen fechas en la base de datos. Sirve para poblar de forma dinámica los menús desplegables del Frontend.
*   **Ejemplo de llamada:**
    `GET /api/v1/attendance/filtros-disponibles`
*   **Respuesta Exitosa (`200 OK`):**
    ```json
    {
      "success": true,
      "filtros": {
        "2025": [1, 2, 3, 4, 5, "...", 52],
        "2026": [1, 2, 3, 4, 5, "...", 52]
      }
    }
    ```


