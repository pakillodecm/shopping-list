# Lista de la compra compartida — Documento de planificación

> Aplicación de lista de la compra compartida, gratuita y sin publicidad, para uso familiar. Sincronización en tiempo real, PWA multiplataforma (Android + iOS), coste cero.

**Estado:** planificación cerrada. Documento de referencia previo a la fase de diseño técnico e implementación.

---

## Índice

1. [Objetivos](#1-objetivos)
2. [Alcance (MVP y fases futuras)](#2-alcance)
3. [Actores y roles](#3-actores-y-roles)
4. [Requisitos funcionales](#4-requisitos-funcionales)
5. [Requisitos no funcionales](#5-requisitos-no-funcionales)
6. [Historias de usuario y criterios de aceptación](#6-historias-de-usuario)
7. [Modelo de dominio](#7-modelo-de-dominio)
8. [Decisiones técnicas y stack](#8-decisiones-tecnicas)
9. [Roadmap por fases](#9-roadmap)

---

<a name="1-objetivos"></a>
## 1. Objetivos

### Objetivo general

Desarrollar una aplicación de lista de la compra compartida, gratuita y sin publicidad, que el núcleo familiar adopte como herramienta principal de uso diario, sincronizada en tiempo real entre varios dispositivos y adaptada a los productos que la familia compra habitualmente.

### Objetivos específicos

| ID | Objetivo | Descripción |
|----|----------|-------------|
| OE-1 | Sincronización en tiempo real | Todo cambio en una lista (añadir, marcar, editar, borrar) se refleja de forma inmediata en los dispositivos de los demás miembros, sin recargar. |
| OE-2 | Colaboración multiusuario | Varias personas comparten y editan las mismas listas simultáneamente, con identidad propia. |
| OE-3 | Catálogo propio adaptado | El sistema conoce y sugiere los productos reales que la familia compra, en vez de un catálogo genérico ajeno. |
| OE-4 | Cero publicidad y control total | Sin anuncios ni funcionalidades impuestas; el producto lo decide el equipo, no un tercero. |
| OE-5 | Privacidad de los datos | Los datos de compra son solo de la familia, sin venta a terceros, con posibilidad de autoalojar. |
| OE-6 | Coste cero | El sistema completo (frontend, backend, despliegue) funciona dentro de planes gratuitos a escala familiar. |
| OE-7 | Baja fricción de uso | Instalar y usar la app es tan sencillo que cualquier miembro no técnico la usa sin ayuda. |
| OE-8 | Valor como pieza de portfolio | El proyecto queda bien documentado y arquitecturado como muestra de competencia full-stack, **sin que ello desvíe el foco del uso real** (objetivo secundario subordinado). |

---

<a name="2-alcance"></a>
## 2. Alcance

### Dentro del MVP (v1.0)

- Registro / inicio de sesión de usuarios.
- Crear una lista de la compra.
- Compartir una lista (invitación por las dos vías).
- Añadir ítems mediante texto libre.
- Marcar / desmarcar ítems.
- Editar y borrar ítems.
- Sincronización en tiempo real entre dispositivos.
- Instalable como PWA.
- Selector de tema (claro/oscuro).

### Fase 2 (mejoras de comodidad)

- Catálogo propio de productos habituales con autocompletado y sugerencias (OE-3).
- Organización de ítems por categorías / secciones del súper.
- Cantidades y unidades por ítem.
- Precios por ítem y total estimado de la compra.
- Respaldo periódico de datos (backup).

### Fase 3 (valor añadido)

- Historial de compras y productos recurrentes.
- Notificaciones push (mecanismo a decidir).
- Múltiples listas organizadas (semanal, farmacia, etc.).
- Modo offline con sincronización al reconectar.

### Fuera de alcance (registrado, no comprometido)

- Integración con APIs reales de supermercados (sin API pública oficial; scraping frágil y legalmente delicado). Línea de investigación futura, sujeta a viabilidad técnica y legal.
- Planificador de comidas / recetas con IA.
- App nativa en tiendas (Play Store / App Store).
- Eliminar cuenta de usuario (procedimiento diseñado y documentado, pospuesto).
- Internacionalización / multiidioma (arquitectura preparada, implementación pospuesta).

> Las fases 2 y 3 son **ampliaciones abiertas**, no compromisos cerrados. Se incorporan funcionalidades nuevas según surjan.

---

<a name="3-actores-y-roles"></a>
## 3. Actores y roles

- **Usuario registrado:** actor principal. Crea listas, se une a listas compartidas, gestiona ítems.
- **Propietario de una lista:** rol contextual (no un usuario distinto). El creador de una lista es su propietario. Puede realizar acciones sensibles sobre esa lista: eliminarla, expulsar miembros, aprobar solicitudes, regenerar el código.
- **Miembro de una lista:** usuario con acceso a una lista que no creó. Puede hacer todo lo cotidiano (añadir, marcar, editar, borrar ítems), pero no las acciones de propietario.
- **Sistema (Supabase):** actor no humano. Gestiona autenticación, propaga cambios en tiempo real y aplica las reglas de seguridad (RLS).

### Modelo de permisos

Dos niveles por lista: **propietario** y **miembro**. La única diferencia son las acciones destructivas y de gestión. Modelo deliberadamente simple; sin roles de "solo lectura" ni jerarquías adicionales.

### Acceso y privacidad

- **Registro abierto:** cualquiera puede crear una cuenta. Crear cuenta no da acceso a ningún dato ajeno.
- **Listas privadas por invitación:** una lista solo es visible/editable por su propietario y miembros invitados. No hay forma de descubrir o buscar listas ajenas.
- **Aislamiento a nivel de base de datos:** garantizado con Row Level Security, no solo en el frontend.

---

<a name="4-requisitos-funcionales"></a>
## 4. Requisitos funcionales

### Cuentas y sesión
- **RF-01.** Registro abierto (email, username, contraseña, nombre, apellidos).
- **RF-02.** Iniciar y cerrar sesión.
- **RF-03.** El username es único en el sistema y sirve como identificador público para invitaciones.

### Gestión de listas
- **RF-04.** Crear una lista (el creador se convierte en propietario).
- **RF-05.** Ver todas las listas donde se es propietario o miembro.
- **RF-06.** El propietario edita el nombre de una lista.
- **RF-07.** El propietario elimina una lista completa.
- **RF-08.** El propietario expulsa a un miembro.
- **RF-09.** Un miembro abandona una lista (con lógica de traspaso de propiedad — ver criterios).

### Invitaciones vía 1 (directa)
- **RF-10.** El propietario invita a un usuario registrado por username o email; la invitación aparece dentro de la app.
- **RF-11.** El invitado ve invitaciones pendientes y las acepta o rechaza.
- **RF-12.** Al aceptar, el usuario pasa a ser miembro.

### Invitaciones vía 2 (código / QR)
- **RF-13.** El propietario genera un código de invitación (y su QR) para una lista.
- **RF-14.** El propietario regenera el código, invalidando el anterior.
- **RF-15.** Un usuario introduce el código o escanea el QR para generar una solicitud de unión.
- **RF-16.** El propietario aprueba o deniega estrictamente cada solicitud.
- **RF-17.** Al aprobar, el solicitante pasa a ser miembro.
- **RF-24.** El usuario puede escanear el QR con la cámara para iniciar la solicitud de unión.

### Gestión de ítems
- **RF-18.** Cualquier miembro añade un ítem mediante texto libre.
- **RF-19.** Cualquier miembro marca / desmarca un ítem.
- **RF-20.** Cualquier miembro edita el texto de un ítem.
- **RF-21.** Cualquier miembro elimina un ítem.

### Tiempo real e instalación
- **RF-22.** Todo cambio en una lista o sus ítems se refleja en tiempo real en los dispositivos de todos los miembros, sin recargar.
- **RF-23.** La aplicación es instalable como PWA.

---

<a name="5-requisitos-no-funcionales"></a>
## 5. Requisitos no funcionales

### Seguridad y privacidad
- **RNF-01.** Aislamiento entre usuarios garantizado a nivel de base de datos mediante RLS.
- **RNF-02.** Contraseñas almacenadas siempre cifradas (hash), nunca en texto plano.
- **RNF-03.** Los códigos de invitación son aleatorios y no adivinables; por sí solos no otorgan acceso, solo inician una solicitud que el propietario aprueba.
- **RNF-04.** Los datos de compra no se comparten con terceros ni se usan con fines publicitarios.
- **RNF-05.** La arquitectura permite el autoalojamiento (Supabase open-source).

### Rendimiento
- **RNF-06.** La sincronización en tiempo real debe percibirse como inmediata; es un requisito prioritario, y la solución técnica debe optimizarse para minimizar la latencia percibida.
- **RNF-07.** Arranque y visualización de listas con rapidez en un móvil de gama media.

### Usabilidad
- **RNF-08.** Toda acción destructiva o irreversible exige confirmación explícita, con un patrón consistente en toda la app.
- **RNF-09.** Interfaz sencilla, usable por personas no técnicas sin formación previa.
- **RNF-10.** Responsive, con enfoque *mobile-first*.

### Coste y despliegue
- **RNF-11.** El sistema completo funciona íntegramente dentro de planes gratuitos a escala familiar.
- **RNF-12.** Instalable como PWA y utilizable en Android e iOS sin depender de tiendas.

### Mantenibilidad y calidad
- **RNF-13.** Código con estructura clara y modular, separación de responsabilidades.
- **RNF-14.** Proyecto documentado (README, decisiones de arquitectura, modelo de datos).

### Disponibilidad
- **RNF-15.** Se contempla la pausa por inactividad del plan gratuito de Supabase (7 días) con un mecanismo para evitarla.

### Theming e internacionalización
- **RNF-16.** *(Fase 2)* Mecanismo de respaldo periódico de datos (export programado), ante la ausencia de backups automáticos en el plan gratuito.
- **RNF-17.** Los colores se definen mediante variables CSS (design tokens). El MVP incluye un selector que permite cambiar de tema (al menos claro/oscuro).
- **RNF-18.** La interfaz se estructura para que los textos sean externalizables, dejando la arquitectura lista para una futura i18n sin reescritura significativa. Implementación de multiidioma pospuesta.

---

<a name="6-historias-de-usuario"></a>
## 6. Historias de usuario y criterios de aceptación

### Historias de usuario (MVP)

| ID | Historia | RF |
|----|----------|-----|
| HU-01 | Como visitante, quiero registrarme con email, username, contraseña, nombre y apellidos, para empezar a usar la app. | RF-01 |
| HU-02 | Como usuario, quiero iniciar y cerrar sesión, para acceder de forma segura. | RF-02 |
| HU-03 | Como usuario, quiero crear una lista, para organizar lo que necesito comprar. | RF-04 |
| HU-04 | Como usuario, quiero ver todas mis listas, para acceder a ellas rápidamente. | RF-05 |
| HU-05 | Como propietario, quiero editar el nombre de una lista, para mantenerla identificable. | RF-06 |
| HU-06 | Como propietario, quiero eliminar una lista, para deshacerme de las que no uso. | RF-07 |
| HU-07 | Como propietario, quiero expulsar a un miembro, para controlar el acceso. | RF-08 |
| HU-08 | Como miembro, quiero abandonar una lista ajena, para dejar de recibir algo que no me interesa. | RF-09 |
| HU-09 | Como propietario, quiero que al abandonar se traspase la propiedad, para que la lista no quede sin dueño. | RF-09 |
| HU-10 | Como propietario, quiero invitar por username o email, para sumar a alguien a mi lista. | RF-10 |
| HU-11 | Como invitado, quiero ver y aceptar/rechazar invitaciones, para decidir a qué listas me uno. | RF-11, RF-12 |
| HU-12 | Como propietario, quiero compartir el código/QR de mi lista (y regenerarlo), para dar acceso cómodamente. | RF-13, RF-14 |
| HU-13 | Como usuario, quiero unirme introduciendo un código o escaneando un QR, para solicitar entrar. | RF-15, RF-24 |
| HU-14 | Como propietario, quiero aprobar o denegar solicitudes, para controlar estrictamente quién entra. | RF-16, RF-17 |
| HU-15 | Como miembro, quiero añadir ítems escribiéndolos, para apuntar lo que hace falta. | RF-18 |
| HU-16 | Como miembro, quiero marcar/desmarcar ítems, para saber qué llevo ya. | RF-19 |
| HU-17 | Como miembro, quiero editar el texto de un ítem, para corregirlo. | RF-20 |
| HU-18 | Como miembro, quiero eliminar un ítem, para quitar lo que no hace falta. | RF-21 |
| HU-19 | Como miembro, quiero que los cambios de otros aparezcan al instante, para ver todos la misma lista. | RF-22 |
| HU-20 | Como usuario, quiero instalar la app en mi móvil, para abrirla desde la pantalla de inicio. | RF-23 |
| HU-21 | Como usuario, quiero cambiar entre tema claro y oscuro, para usar la apariencia más cómoda. | RNF-17 |

### Criterios de aceptación (historias críticas)

#### HU-01 — Registro
- **CA-01.1.** Registro con email, username, contraseña, nombre y apellidos → crea cuenta y permite iniciar sesión.
- **CA-01.2.** Email ya registrado → aviso, no se crea la cuenta.
- **CA-01.3.** Email con formato inválido → aviso, no se crea la cuenta.
- **CA-01.4.** Contraseña de menos de 8 caracteres → aviso, no se crea la cuenta.
- **CA-01.5.** Falta algún campo obligatorio (email, username, contraseña, nombre, apellidos) → aviso, no se crea la cuenta.
- **CA-01.6.** Registro correcto → contraseña almacenada cifrada (hash).
- **CA-01.7.** Username ya en uso → aviso, no se crea la cuenta.
- **CA-01.8.** Username con formato inválido (longitud fuera de 3–20, caracteres no permitidos, o que no empieza por letra) → aviso, no se crea la cuenta.

#### HU-09 — Abandono y traspaso de propiedad
- **CA-09.1.** Miembro no propietario abandona → se elimina su membresía; lista y demás miembros intactos.
- **CA-09.2.** Propietario con más miembros abandona eligiendo sucesor → propiedad al elegido, se elimina su membresía.
- **CA-09.3.** Propietario con más miembros abandona sin elegir → propiedad al miembro más antiguo (`joined_at` más temprano; desempate estable por id/created_at).
- **CA-09.4.** Propietario único intenta abandonar → el sistema advierte de que la lista se eliminará y exige confirmación explícita.
- **CA-09.5.** Confirmada → se elimina la lista y en cascada ítems, membresías, solicitudes y código.
- **CA-09.6.** Cancelada → nada cambia.

#### HU-10 / HU-11 — Invitación vía 1
- **CA-10.1.** Invitar a usuario registrado por email/username → crea `MembershipRequest` con `origin = INVITE`; el invitado la ve pendiente.
- **CA-10.2.** Email/username inexistente → aviso, no crea solicitud.
- **CA-10.3.** El usuario ya es miembro → se impide e informa.
- **CA-10.4.** Ya existe una solicitud pendiente para ese par (cualquier origen) → no crea duplicado; dirige a resolver la existente.
- **CA-10.5.** Auto-invitación → se impide.
- **CA-11.1.** Aceptar invitación → crea `Membership` (`joined_at` = momento de aceptación), elimina la solicitud, pasa a ver la lista.
- **CA-11.2.** Rechazar → elimina la solicitud, sin membresía.
- **CA-11.3.** Varias invitaciones pendientes → se ven todas y se resuelven por separado.
- **CA-11.4.** Invitación de una lista ya eliminada → desaparece silenciosamente.

#### HU-12 / HU-13 / HU-14 — Invitación vía 2 (código / QR)
- **CA-12.1.** Al crear una lista → ya tiene un `invitation_code` de 6 caracteres generado automáticamente.
- **CA-12.2.** El propietario ve el código y su QR.
- **CA-12.3.** Regenerar → nuevo código; el anterior deja de ser válido para nuevas solicitudes. Las solicitudes ya creadas siguen válidas.
- **CA-12.4.** No propietario intenta ver/regenerar el código → se impide.
- **CA-13.1.** Código válido → crea `MembershipRequest` con `origin = REQUEST`; el propietario la ve pendiente.
- **CA-13.2.** Código inexistente → aviso de código no válido.
- **CA-13.3.** Ya es miembro → informa, no crea solicitud.
- **CA-13.4.** Ya existe solicitud pendiente para ese par (cualquier origen) → no crea duplicado; dirige a la existente.
- **CA-13.5.** Propietario introduce su propio código → se impide.
- **CA-13.6.** Escanear con permiso de cámara concedido → lee el código y crea la solicitud (igual que tecleado).
- **CA-13.7.** Permiso de cámara denegado o sin cámara → informa y ofrece introducción manual.
- **CA-13.8.** QR no válido → aviso, no crea solicitud.
- **CA-14.1.** El propietario ve las solicitudes pendientes.
- **CA-14.2.** Aprobar → crea `Membership` (`joined_at` = momento de aprobación), elimina la solicitud.
- **CA-14.3.** Denegar → elimina la solicitud, sin membresía.
- **CA-14.4.** Solicitante ya aprobado por otra vía o inexistente → se gestiona sin duplicados ni incoherencias.

> **Regla transversal de invitaciones (simétrica):** como mucho una solicitud pendiente por par (usuario, lista), sin importar el origen. Si ya existe una pendiente y llega la otra vía, no se duplica: se dirige a resolver la existente (si era REQUEST la resuelve el propietario; si era INVITE, el invitado).

---

<a name="7-modelo-de-dominio"></a>
## 7. Modelo de dominio

### Entidades

**User**
- `id` (PK)
- `email` (único) — identidad de autenticación
- `password_hash`
- `username` (único, insensible a mayúsculas) — handle público para invitaciones
- `first_name`, `last_name`
- `created_at`

**List**
- `id` (PK)
- `owner_id` (FK → User) — puntero de propiedad
- `name`
- `invitation_code` (6 caracteres) — campo de la lista, no entidad aparte
- `created_at`

**Membership** (relación N:M User ↔ List)
- `id` (PK)
- `user_id` (FK → User)
- `list_id` (FK → List)
- `joined_at`

**MembershipRequest** (unifica invitación y solicitud)
- `id` (PK)
- `user_id` (FK → User)
- `list_id` (FK → List)
- `origin` (enum: `INVITE` | `REQUEST`)
- `created_at`
- *Sin campo `status`: la existencia de la fila significa "pendiente".*

**ListItem** (línea dentro de una lista)
- `id` (PK)
- `list_id` (FK → List)
- `product_id` (FK → Product, **nullable**) — se usa desde Fase 2
- `author_id` (FK → User, **nullable**)
- `text`
- `checked` (bool)
- `created_at`, `modified_at`
- *(Fase 2)* `quantity`, `unit`, `price`

**Product** (catálogo — preparado para Fase 2, vacío en el MVP)
- `id` (PK)
- `name`

### Relaciones

- **User ↔ List (propietario):** 1:N. Cada lista tiene exactamente un propietario (`owner_id`); un usuario posee varias listas.
- **User ↔ List (miembros):** N:M vía `Membership`.
- **List → ListItem:** 1:N. Cada `ListItem` pertenece a una sola lista.
- **Product → ListItem:** 1:N. Un producto del catálogo puede aparecer en muchos `ListItem` de distintas listas.
- **MembershipRequest:** conecta un User con una List (pendiente), con su `origin`.

### Reglas de dominio (invariantes)

- `email` y `username` son únicos. El `username` es insensible a mayúsculas (se almacena en minúsculas).
- **El propietario de una lista es siempre también miembro** (tiene su `Membership`). La propiedad es un rol adicional sobre la membresía, no un sustituto.
- Existe exactamente un propietario por lista en todo momento.
- Solo el propietario ejecuta acciones sensibles (borrar lista, expulsar, aprobar solicitudes, regenerar código).
- Traspaso de propiedad: nuevo propietario elegido, o en su defecto el miembro con `joined_at` más temprano (desempate estable).
- Como mucho una `Membership` por par (user, list).
- Como mucho una `MembershipRequest` pendiente por par (user, list), sin importar el origen.
- Al crear una lista, fijar `owner_id` y crear la `Membership` del creador deben ser atómicos.
- Borrado en cascada al eliminar una lista: sus `ListItem`, `Membership`, `MembershipRequest` (el código va dentro de la propia lista).

### Formato del código de invitación

6 caracteres seguidos, sin separador. Mayúsculas A–Z y dígitos 0–9, **excluyendo ambiguos** (O, I, L, 0, 1). Aleatorio, no adivinable, regenerable. Alfabeto de 31 símbolos.

### Formato del username

- Longitud 3–20 caracteres.
- Permitidos: letras (a–z), dígitos (0–9) y guion bajo (`_`). Sin puntos, guiones, espacios ni símbolos.
- Debe empezar por una letra.
- Único, insensible a mayúsculas.

### Procedimiento "Eliminar usuario" (pospuesto, no-MVP)

Documentado para el futuro:
1. Por cada lista donde es propietario con más miembros → traspasar propiedad (elegido o más antiguo).
2. Por cada lista donde es propietario único → eliminar la lista en cascada.
3. Poner `author_id = null` en todos sus `ListItem`.
4. Borrar todas sus `Membership`.
5. Borrar todas las `MembershipRequest` donde figure como `user` (INVITE y REQUEST).
6. Borrar el `User`.

---

<a name="8-decisiones-tecnicas"></a>
## 8. Decisiones técnicas y stack

### Filtros de decisión

**Indispensables (descartan si fallan):**
- RI-1: gratis 100% a escala familiar.
- RI-2: funciona en Android e iOS.
- RI-3: sincronización en tiempo real.
- RI-4: instalable en el móvil.
- RI-5: privacidad real (aislamiento forzado en backend).
- RI-6: baja fricción de instalación y uso.

**Deseables (por orden de peso):** RD-2 (portfolio) > RD-1 (reutilizar Angular) > RD-3 (autoalojamiento).

### Decisiones

| ID | Decisión | Elección | Justificación resumida |
|----|----------|----------|------------------------|
| DT-1 | Tipo de app | **PWA** | Un solo código Android+iOS, sin fricción de tiendas, actualizaciones instantáneas, gratis. La opción nativa cae por el coste de la cuenta de Apple (viola RI-1). |
| DT-2 | Frontend | **Angular** | Ya se domina (RD-1) y es carta de portfolio fuerte en el mercado español (RD-2). Soporte PWA nativo. RD-1 y RD-2 alineados. |
| DT-3 | Backend | **Supabase** | Postgres relacional + Auth + Realtime + Storage integrados. Tiempo real y RLS casi de fábrica. Open-source y autoalojable. Plan gratuito suficiente. |
| DT-4 | Autenticación | **Supabase Auth** | Integrada, gestiona el hash, se integra de forma nativa con RLS (`auth.uid()`). Email como identidad; username como handle. Sin verificación de email en el MVP. |
| DT-5 | Tiempo real | **Supabase Realtime** (Postgres Changes) | Suscripción a cambios de tablas; resuelve RI-3 sin montar WebSockets. Respeta RLS. |
| DT-6 | Seguridad de datos | **Row Level Security (RLS)** | Políticas a nivel de BD; la privacidad no depende del frontend. Integrada con Supabase Auth. |
| DT-7 | Theming | **Variables CSS + selector claro/oscuro en MVP** | Design tokens desde el inicio (barato); selector visible incluido en el MVP. |
| DT-8 | i18n | **Preparada, no implementada** | Textos externalizables desde el inicio; librería de traducción pospuesta (p. ej. Transloco). |
| DT-9 | QR | **Completo en el MVP** | Generar/mostrar (vista propietario) + introducir y escanear con cámara (vista usuario). El escaneo desemboca en el mismo flujo que el código manual; siempre existe la salida manual. |
| DT-10 | Hosting frontend | **Cloudflare Pages** | Gratis y generoso; aporta aprendizaje/portfolio (RD-2). Fricción de configuración mínima. |
| DT-11 | Anti-pausa Supabase | **Ping programado con GitHub Actions** | Gratis, sin servicios nuevos, patrón estándar. El mismo workflow servirá para el backup de Fase 2. |

**Stack final:** PWA · Angular · Supabase (Postgres + Auth + Realtime) · RLS · Cloudflare Pages · GitHub Actions.

**Herramientas de QR previsibles (a concretar en implementación):** generación con `angularx-qrcode` o similar; escaneo con `@zxing/ngx-scanner` (ZXing) u otra librería de lectura.

---

<a name="9-roadmap"></a>
## 9. Roadmap por fases

Orden de construcción por dependencias (no plazos temporales). Cada etapa deja algo tangible y probado.

- **Etapa 0 — Cimientos.** Proyecto Angular como PWA, proyecto Supabase, conexión entre ambos, despliegue en Cloudflare Pages funcionando, patrón de variables CSS establecido. → *Un "hola mundo" instalable y desplegado, con la tubería completa.*
- **Etapa 1 — Autenticación y cuentas.** Registro (con todas sus reglas), login/logout, y RLS configurado desde el principio conforme se crean las tablas. → *La gente crea cuenta y entra; los datos nacen protegidos.*
- **Etapa 2 — Listas.** Crear (con código autogenerado y membresía del propietario, atómico), ver, editar nombre, eliminar. → *Gestión de listas propias.*
- **Etapa 3 — Ítems.** Añadir, marcar/desmarcar, editar, borrar. → *Lista funcional para una persona.*
- **Etapa 4 — Tiempo real.** Supabase Realtime sobre listas e ítems, respetando RLS. → *Dos dispositivos ven los mismos cambios al instante.*
- **Etapa 5 — Invitaciones.** Vía 1 (invitar/aceptar/rechazar) y vía 2 (código/QR, escanear, solicitar, aprobar/denegar), con unicidad y borrado al resolver. → *Varias personas comparten y editan.*
- **Etapa 6 — Traspaso y salida.** Abandonar, traspaso de propiedad y caso del propietario único (borrado con confirmación). → *Gestión de membresía completa.*
- **Etapa 7 — Pulido y pruebas.** Selector de tema, patrón de confirmación de acciones destructivas, pruebas de PWA y escaneo QR en Android e iOS reales, mecanismo anti-pausa. → *MVP terminado y listo para uso real.*

### Lógica del orden

- **Autenticación temprana:** en este stack la seguridad (RLS) se apoya en la identidad del usuario; construir las tablas ya con RLS es más limpio que añadir seguridad a posteriori.
- **Tiempo real en medio:** después de tener datos que sincronizar (listas e ítems), pero antes de la colaboración; se prueba con la misma cuenta en dos dispositivos.
- **Colaboración hacia el final:** es la parte con más casuística (dos vías, unicidad, aprobaciones); se aborda con la base ya firme.
