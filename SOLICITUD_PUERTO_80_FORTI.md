# 🔐 Solicitud: Apertura del Puerto 80 TCP en FortiGate

**Fecha:** 8 de junio de 2026  
**Solicitante:** Equipo DTIC — Desarrollo  
**Prioridad:** Alta  
**Tipo:** Temporal (puede cerrarse después de la renovación)

---

## 📌 Motivo

El **certificado SSL (Let's Encrypt)** del dominio `edomex-dtic.duckdns.org` **expiró el 12 de abril de 2026** y necesitamos renovarlo urgentemente.

La herramienta de renovación (`certbot`) requiere que el **puerto 80 TCP** esté accesible desde Internet para completar la verificación del dominio (ACME HTTP-01 Challenge).

Actualmente, el puerto 80 está siendo interceptado por la interfaz de administración del FortiGate, lo cual impide que la solicitud de verificación llegue al servidor Nginx interno.

---

## 🔧 Configuración Requerida

Crear una regla de **Port Forwarding / Virtual IP** en el FortiGate con los siguientes parámetros:

| Parámetro | Valor |
|---|---|
| **Nombre sugerido** | `web-app_80` o `certbot_letsencrypt` |
| **Interfaz** | Internet1_IPFIJA (wan1) |
| **Puerto externo** | 80 TCP |
| **IP destino interna** | 10.0.80.6 |
| **Puerto destino interno** | 80 TCP |
| **Protocolo** | TCP |

> ⚠️ **Importante:** Esta regla debe tener **mayor prioridad** que la redirección a la interfaz admin del FortiGate para el puerto 80, o bien la interfaz admin debe moverse a otro puerto para ese dominio.

### Referencia visual

La configuración es idéntica a las reglas existentes. Ejemplo:

```
web-app_82   → Internet1_IPFIJA (wan1) → 186.96.139.152 (TCP: 82)  → 10.0.80.6 (TCP: 82)
web-app_80   → Internet1_IPFIJA (wan1) → 186.96.139.152 (TCP: 80)  → 10.0.80.6 (TCP: 80)  ← NUEVA
```

---

## ✅ Procedimiento de renovación

Una vez abierto el puerto, nosotros ejecutaremos:

```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

Tiempo estimado: **menos de 1 minuto**.

---

## 🔒 Después de la renovación

El puerto 80 puede:

- **Opción A:** Dejarse abierto permanentemente para renovaciones automáticas futuras (Let's Encrypt renueva cada 60-90 días).
- **Opción B:** Cerrarse inmediatamente y abrir manualmente cada vez que se requiera renovar. *(No recomendado)*

> 💡 **Recomendación:** Dejar el puerto 80 abierto de forma permanente hacia el servidor 10.0.80.6 y configurar un **cron de renovación automática**, para evitar que el certificado expire nuevamente. Esto ya funciona con las mejores prácticas de seguridad, ya que Nginx solo responde al challenge de Let's Encrypt en ese puerto.

---

## 📊 Impacto del certificado expirado

Con el certificado vencido, los siguientes servicios presentan errores de conexión SSL:

| Puerto | Servicio | Estado actual |
|---|---|---|
| 8088 | Biométrico — Frontend | ⚠️ Certificado expirado |
| 8089 | Biométrico — Backend API | ⚠️ Certificado expirado |
| 82 | Biométrico — Frontend (alterno) | ⚠️ Certificado expirado |
| 84 | Equidata — API | ⚠️ Certificado expirado |
| 85 | Equidata — Frontend | ⚠️ Certificado expirado |
| 86 | Equidata — PostgREST | ⚠️ Certificado expirado |
| 90 | Seguimiento Jurídico — Backend | ⚠️ Certificado expirado |
| 91 | Seguimiento Jurídico — Frontend | ⚠️ Certificado expirado |

> **Todos los servicios SSL del servidor se benefician de esta renovación**, ya que comparten el mismo certificado.

---

## 📞 Contacto

Cualquier duda, estamos disponibles para coordinar la apertura del puerto en el momento que mejor convenga.

¡Gracias por el apoyo! 🙌
