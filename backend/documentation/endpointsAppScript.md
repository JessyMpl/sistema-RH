# 📡 Especificación de Endpoints — API RRHH

**Versión:** 1.0  
**Fecha:** Junio 2026  
**Proyecto:** RH Semujeres Checador  

---

## Resumen

La API RRHH expone **2 endpoints** para recibir registros de asistencia, cada uno con reglas independientes:

| # | Endpoint | Origen | Frecuencia | Auth |
|---|----------|--------|------------|------|
| 1 | `POST /api/v1/attendance/cron` | Script automático (`sync_cron.js`) | 4 veces/día | Bearer Token |
| 2 | `POST /api/v1/attendance/app` | App de escritorio (Electron) | Manual / On-demand | Bearer Token |

> **Ambos** validan duplicados con la misma lógica, pero tienen reglas de negocio diferentes.

---

## 🗄️ Esquema de Base de Datos (Compartido)

```sql
CREATE TABLE attendance_records (
    id                BIGSERIAL PRIMARY KEY,
    employee_id       VARCHAR(50)   NOT NULL,
    timestamp         TIMESTAMPTZ   NOT NULL,
    serial_number     VARCHAR(50)   NOT NULL,
    card_number       VARCHAR(50)   DEFAULT '',
    source            VARCHAR(30)   NOT NULL DEFAULT 'unknown',
    clock_ip          VARCHAR(45)   DEFAULT '',
    clock_name        VARCHAR(100)  DEFAULT '',
    sync_date         TIMESTAMPTZ   DEFAULT NOW(),
    created_at        TIMESTAMPTZ   DEFAULT NOW(),

    -- Restricción de unicidad para evitar duplicados
    CONSTRAINT uq_attendance_record
        UNIQUE (employee_id, timestamp, serial_number)
);

-- Índices para consultas frecuentes
CREATE INDEX idx_attendance_employee  ON attendance_records (employee_id);
CREATE INDEX idx_attendance_timestamp ON attendance_records (timestamp);
CREATE INDEX idx_attendance_date      ON attendance_records (DATE(timestamp));
CREATE INDEX idx_attendance_source    ON attendance_records (source);
```

### Clave de Deduplicación

```
employee_id + timestamp + serial_number
```

Si ya existe un registro con esta combinación → **se ignora** (no es error).

---

---

# 📌 ENDPOINT 1: Script Automático (Cron)

## `POST /api/v1/attendance/cron`

Recibe lotes masivos de registros desde `sync_cron.js`. Se ejecuta **4 veces al día** y siempre envía los registros de **ayer + hoy**.

### Reglas específicas

| Regla | Valor |
|-------|-------|
| Máximo de registros por lote | **100** |
| Reintentos en caso de error 5xx | Sí, hasta 3 veces con backoff |
| Duplicados | Se ignoran silenciosamente |
| Fuente esperada | `hikvision-cron` |
| Rate limit | 10 requests/minuto |

---

### 🔐 Autenticación

```http
POST /api/v1/attendance/cron HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer <RH_API_TOKEN>
```

---

### 📥 Request Body

```json
{
  "records": [
    {
      "employeeId": "12345",
      "timestamp": "2026-06-05T09:01:23-06:00",
      "serialNumber": "987654321",
      "cardNumber": "A1B2C3D4"
    },
    {
      "employeeId": "12345",
      "timestamp": "2026-06-05T18:05:10-06:00",
      "serialNumber": "987654322",
      "cardNumber": ""
    }
  ],
  "source": "hikvision-cron",
  "syncDate": "2026-06-05T15:00:00.000Z"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `records` | `Array<Record>` | ✅ | Lote de registros (máx. 100) |
| `source` | `string` | ✅ | Debe ser `"hikvision-cron"` |
| `syncDate` | `string (ISO 8601)` | ✅ | Momento exacto de la sincronización |

#### Campos de cada Record

| Campo | Tipo | Requerido | Ejemplo |
|-------|------|-----------|---------|
| `employeeId` | `string` | ✅ | `"12345"` |
| `timestamp` | `string (ISO 8601)` | ✅ | `"2026-06-05T09:01:23-06:00"` |
| `serialNumber` | `string` | ✅ | `"987654321"` |
| `cardNumber` | `string` | ❌ | `"A1B2C3D4"` (vacío si usó huella) |

---

### 📤 Responses

#### ✅ 200 OK

```json
{
  "success": true,
  "message": "Lote procesado correctamente",
  "data": {
    "received": 50,
    "inserted": 35,
    "duplicated": 15,
    "errors": 0
  }
}
```

#### ⚠️ 207 Multi-Status — Errores parciales

```json
{
  "success": false,
  "message": "Lote procesado con errores",
  "data": {
    "received": 50,
    "inserted": 30,
    "duplicated": 10,
    "errors": 10
  },
  "errorDetails": [
    { "index": 5, "employeeId": "99999", "reason": "employeeId no encontrado" }
  ]
}
```

#### ❌ 400 Bad Request

```json
{ "success": false, "message": "El campo 'records' es requerido y debe ser un arreglo no vacío" }
```

#### ❌ 401 Unauthorized

```json
{ "success": false, "message": "Token de autenticación inválido o expirado" }
```

#### ❌ 413 Payload Too Large

```json
{ "success": false, "message": "El lote excede el máximo de 100 registros" }
```

#### ❌ 429 Too Many Requests

```json
{ "success": false, "message": "Rate limit excedido. Reintente en 60s", "retryAfter": 60 }
```

---

### 🧪 Casos de Prueba — Endpoint Cron

| # | Escenario | Esperado |
|---|-----------|----------|
| 1 | 50 registros nuevos | `200` → inserted: 50 |
| 2 | 50 registros ya existentes | `200` → duplicated: 50 |
| 3 | 30 nuevos + 20 duplicados | `200` → inserted: 30, duplicated: 20 |
| 4 | Sin token | `401` |
| 5 | `source` diferente a `hikvision-cron` | `400` — source inválido |
| 6 | 150 registros | `413` |
| 7 | Registro sin `employeeId` | `400` |
| 8 | 2da ejecución del mismo día | `200` → inserted: 0, duplicated: N |

---

### ⏰ Horarios de invocación

| Hora | Rango de datos |
|------|---------------|
| 09:11 AM | Ayer 00:00 → Hoy 09:11 |
| 10:00 AM | Ayer 00:00 → Hoy 10:00 |
| 06:10 PM | Ayer 00:00 → Hoy 18:10 |
| 08:00 PM | Ayer 00:00 → Hoy 20:00 |

---

---

# 📌 ENDPOINT 2: App de Escritorio (Manual)

## `POST /api/v1/attendance/app`

Recibe registros enviados manualmente desde la app Electron (RHSM). El usuario selecciona un reloj, extrae datos y los envía a la nube.

### Reglas específicas

| Regla | Valor |
|-------|-------|
| Máximo de registros por lote | **100** |
| Reintentos automáticos | Sí, hasta 3 veces con backoff |
| Duplicados | Se ignoran silenciosamente |
| Fuente esperada | `app-manual` |
| Rate limit | 30 requests/minuto (más flexible que el cron) |
| Datos extra | Incluye `clockIp` y `clockName` |

---

### 🔐 Autenticación

```http
POST /api/v1/attendance/app HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer <RH_API_TOKEN>
```

---

### 📥 Request Body

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
  "syncDate": "2026-06-05T16:50:00.000Z",
  "userId": "admin-rh-01"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `records` | `Array<Record>` | ✅ | Lote de registros (máx. 100) |
| `source` | `string` | ✅ | Debe ser `"app-manual"` |
| `clockIp` | `string` | ✅ | IP del reloj desde donde se extrajeron |
| `clockName` | `string` | ❌ | Nombre descriptivo del reloj |
| `syncDate` | `string (ISO 8601)` | ✅ | Momento en que se hizo la extracción |
| `userId` | `string` | ❌ | Usuario de la app que ejecutó la sync |

#### Campos de cada Record

Mismos que el Endpoint 1:

| Campo | Tipo | Requerido |
|-------|------|-----------|
| `employeeId` | `string` | ✅ |
| `timestamp` | `string (ISO 8601)` | ✅ |
| `serialNumber` | `string` | ✅ |
| `cardNumber` | `string` | ❌ |

---

### 📤 Responses

#### ✅ 200 OK

```json
{
  "success": true,
  "message": "Registros recibidos desde app",
  "data": {
    "received": 25,
    "inserted": 20,
    "duplicated": 5,
    "errors": 0,
    "clockIp": "192.168.103.29",
    "clockName": "TECNOLOGIAS"
  }
}
```

#### ❌ Errores

Mismos códigos que el Endpoint 1: `400`, `401`, `413`, `429`, `500`.

---

### 🧪 Casos de Prueba — Endpoint App

| # | Escenario | Esperado |
|---|-----------|----------|
| 1 | Envío manual exitoso | `200` → inserted: N |
| 2 | Mismos registros que ya envió el cron | `200` → duplicated: N |
| 3 | Sin `clockIp` | `400` — clockIp requerido |
| 4 | `source` diferente a `app-manual` | `400` — source inválido |
| 5 | Token expirado | `401` |
| 6 | Envío cruzado (app + cron mismo dato) | `200` → duplicated (la clave única es la misma) |

---

---

# 🔄 Lógica Compartida — INSERT con Deduplicación

Ambos endpoints usan la **misma tabla** y la **misma lógica de deduplicación**:

### PostgreSQL

```sql
INSERT INTO attendance_records
    (employee_id, timestamp, serial_number, card_number, source, clock_ip, clock_name, sync_date)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT ON CONSTRAINT uq_attendance_record
    DO NOTHING
RETURNING id;
```

### MySQL

```sql
INSERT IGNORE INTO attendance_records
    (employee_id, timestamp, serial_number, card_number, source, clock_ip, clock_name, sync_date)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
```

**Resultado:**
- `RETURNING id` devuelve fila → **nuevo** (`inserted++`)
- No devuelve nada → **duplicado** (`duplicated++`)

---

# 📊 Pseudocódigo — Controller compartido

```javascript
// Usado por AMBOS endpoints, solo cambia la validación de 'source'
async function processAttendanceBatch(req, res, expectedSource) {
  // 1. Auth
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !isValidToken(token)) {
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }

  // 2. Validar payload
  const { records, source, syncDate, clockIp, clockName, userId } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'records es requerido' });
  }
  if (records.length > 100) {
    return res.status(413).json({ success: false, message: 'Máximo 100 registros' });
  }
  if (source !== expectedSource) {
    return res.status(400).json({ success: false, message: `source debe ser "${expectedSource}"` });
  }

  // 3. Validación extra para endpoint /app
  if (expectedSource === 'app-manual' && !clockIp) {
    return res.status(400).json({ success: false, message: 'clockIp es requerido' });
  }

  // 4. Insertar con deduplicación
  let inserted = 0, duplicated = 0, errors = 0;

  for (const record of records) {
    if (!record.employeeId || !record.timestamp || !record.serialNumber) {
      errors++;
      continue;
    }

    const result = await db.query(
      `INSERT INTO attendance_records
         (employee_id, timestamp, serial_number, card_number, source, clock_ip, clock_name, sync_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ON CONSTRAINT uq_attendance_record DO NOTHING
       RETURNING id`,
      [record.employeeId, record.timestamp, record.serialNumber,
       record.cardNumber || '', source, clockIp || '', clockName || '', syncDate || new Date()]
    );

    result.rowCount > 0 ? inserted++ : duplicated++;
  }

  // 5. Responder
  return res.status(errors > 0 ? 207 : 200).json({
    success: errors === 0,
    message: errors === 0 ? 'Lote procesado correctamente' : 'Lote con errores',
    data: { received: records.length, inserted, duplicated, errors }
  });
}

// ─── Rutas ──────────────────────────────────────────
// POST /api/v1/attendance/cron
router.post('/cron', (req, res) => processAttendanceBatch(req, res, 'hikvision-cron'));

// POST /api/v1/attendance/app
router.post('/app',  (req, res) => processAttendanceBatch(req, res, 'app-manual'));
```

# 📋 Configuración de Variables de Entorno (.env) para Integración

El servidor backend está configurado en producción en el puerto **5176** y es administrado por **PM2** bajo el nombre de proceso `biometrico-backend`.
El dominio de producción público expuesto es:
**`https://edomex-dtic.duckdns.org:8089`**

---

### 1. Variables de Entorno para el Agente del Script de Sincronización (Cron)

El script de sincronización automática (`sync_cron.js`) debe configurar su archivo `.env` local con los siguientes valores:

```env
# URL base de la API de asistencia (apunta al dominio público y puerto mapeado)
RH_API_URL="https://edomex-dtic.duckdns.org:8089/api/v1/attendance"

# Token Bearer de autenticación para validar la carga de datos
RH_API_TOKEN="0813585dcf5ee7cc4941a590cebb1b6b4e7e1287dad4c03c8e3f0ca256885c73"
```

> [!NOTE]
> El script cron debe concatenar la ruta `/cron` a la URL configurada para enviar sus peticiones, es decir, el endpoint final será:
> `https://edomex-dtic.duckdns.org:8089/api/v1/attendance/cron`

---

### 2. Variables de Entorno para el Agente de la App de Escritorio (Electron)

La aplicación de escritorio de Recursos Humanos (Electron / React / Vue) debe configurar su archivo `.env` local de la siguiente manera:

```env
# URL base de la API de asistencia (apunta al dominio público y puerto mapeado)
RH_API_URL="https://edomex-dtic.duckdns.org:8089/api/v1/attendance"

# Token Bearer de autenticación para validar la carga de datos
RH_API_TOKEN="0813585dcf5ee7cc4941a590cebb1b6b4e7e1287dad4c03c8e3f0ca256885c73"
```

> [!NOTE]
> La aplicación de escritorio debe concatenar la ruta `/app` a la URL configurada para enviar sus peticiones, es decir, el endpoint final será:
> `https://edomex-dtic.duckdns.org:8089/api/v1/attendance/app`

---

### 📊 Tabla de Variables de Entorno

| Variable | Rol en Script Cron | Rol en App Electron | Descripción |
| :--- | :---: | :---: | :--- |
| `RH_API_URL` | ✅ Usa `/cron` | ✅ Usa `/app` | URL base de la API. Debe configurarse exactamente como `https://edomex-dtic.duckdns.org:8089/api/v1/attendance`. |
| `RH_API_TOKEN` | ✅ Requerido | ✅ Requerido | Token estático utilizado para la cabecera `Authorization: Bearer <TOKEN>`. |

---

*Especificación para API RRHH — RH Semujeres Checador v1.0 (Actualizada para Producción)*

