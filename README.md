# Viento de los cojones

Planificador de rutas en bici que **traza la ruta en función del viento**, no que
te dice el viento de una ruta que ya tienes.

Le dices de dónde sales, cuántos kilómetros quieres y qué prefieres sufrir, y
prueba una docena de trazados distintos, los simula tramo a tramo con la
previsión horaria y te devuelve el que mejor le viene al aire — incluida la hora
a la que conviene salir.

Nacido en Tierra de Campos, donde el aire es una variable de entrenamiento.

---

## Qué hace, exactamente

| | |
|---|---|
| **Circular o lineal** | Bucle que vuelve al punto de partida con la distancia pedida, o punto A → punto B con variantes laterales. |
| **Carretera, camino o mixto** | Perfiles de enrutado distintos y, con OpenRouteService, reparto real de firme (% asfalto). |
| **Volver a favor / palo primero / menos esfuerzo** | Tres funciones objetivo distintas sobre la misma simulación. |
| **Mejor hora de salida** | Evalúa cada hora dentro del margen que le des y ordena por el peaje que te va a cobrar el viento. |
| **Sentido de la marcha** | El mismo bucle en sentido contrario es otra ruta a efectos de viento: se evalúan los dos. |
| **GPX con horas de paso** | Exporta la ruta con `<time>` en cada punto, así el Garmin o el Wahoo te dan la hora estimada de cada tramo. |

## Cómo decide

1. **Genera candidatos.** Para una circular, barre 12 rumbos de salida (cada 30°)
   y construye para cada uno un polígono "caminado" con el perímetro pedido:
   sales con rumbo θ, giras 360/n en cada vértice y vuelves al origen. Eso da
   control explícito sobre *por dónde sales*, que es justo la palanca que mueve
   el viento. Luego refina las mejores para ajustar la distancia real.

   Con clave de OpenRouteService se añaden además bucles trazados por el propio
   router (`round_trip`), que sigue la red de carreteras en vez de perseguir
   vértices inventados. Los dos generadores compiten y decide la puntuación.

2. **Descarta lo que no es un recorrido.** El fallo clásico de generar bucles
   por waypoints: si un vértice cae en mitad del campo, el router va a tocarlo
   y se vuelve por el mismo sitio. Un pico de ida y vuelta con giro de 180.

   `overlapFraction()` trocea la ruta en celdas de 120 m y mide qué fracción
   cae en una celda ya visitada — lineal, en vez del O(n²) de comparar
   segmentos dos a dos. Se descarta lo que pase del 12% y se penaliza fuerte lo
   que quede, con peso suficiente para ganarle a una diferencia moderada de
   viento. Medido antes y después sobre las mismas rutas: del 17–26% repetido
   al 8–14%.

3. **Descarga la previsión.** Una sola llamada a Open-Meteo para una rejilla de
   7 puntos que cubre la zona de la ruta. El viento se interpola en el espacio
   por distancia inversa y en el tiempo linealmente, siempre sobre las
   **componentes u/v** — promediar grados daría disparates cuando el viento
   cruza el norte.

4. **Simula avanzando el reloj.** Trocea la ruta en tramos de 400 m y consulta
   la previsión *en el instante en el que pasarías por cada punto*, no en el de
   salida. En una ruta de tres horas eso cambia bastante el resultado.

5. **Resuelve el balance de potencia.** Por cada tramo, con el viento proyectado
   sobre el rumbo y la pendiente:

   ```
   P = [ ½·ρ·CdA·|v+w|·(v+w) + Crr·m·g·cos θ + m·g·sin θ ] · v / η
   ```

   e invierte esa ecuación por bisección para sacar la velocidad de equilibrio.
   El viento a 10 m (que es lo que dan los modelos) se corrige a la altura del
   ciclista con un perfil logarítmico sobre campo abierto (z₀ = 0,05 m).

6. **Puntúa.** Tiempo total, fracción a favor y en contra, viento medio en
   el último 35% de la ruta, ruta repetida y — si has pedido carretera — firme.
   Las tres estrategias son pesos distintos sobre esos mismos números.

## Perfil de ciclista

El tiempo estimado sale de un perfil que puedes afinar hasta donde quieras. Se
guarda en tu navegador.

- **Antropometría.** Con altura y peso se calcula la superficie corporal de Du
  Bois y de ahí el CdA del cuerpo, escalado por la postura (manos arriba,
  manetas, manillar bajo, acoples).
- **Material.** Cuadro, ruedas, neumáticos, ropa, casco y equipaje aportan cada
  uno su parte al CdA y al Crr. El catálogo cubre lo que hay en el mercado
  (Cervélo S5, Tarmac SL8, Madone, Aeroad, Propel, Foil, Dogma… y ruedas Zipp,
  Enve, Roval, DT Swiss, Dura-Ace, Bora, Hunt, Vision) agrupado por familias.
- **FTP y factor de intensidad.** La potencia objetivo es FTP × IF. Si pones un
  IF que no se sostiene la duración que sale, te avisa.
- **Rebufo.** Dices con cuántos vas y qué fracción del tiempo ruedas tapado
  (relevando a partes iguales en un grupo de 4 sería el 75%). El ahorro se
  aplica al CdA y **se degrada tramo a tramo según lo angulado que entre el
  aire**: con viento de lado el grupo se abre en abanico y tapa la mitad.
- **Densidad del aire real.** Se calcula con la presión, temperatura y humedad
  previstas en cada punto. En la meseta a 800 m un mediodía de agosto el aire
  pesa un 14% menos que el estándar a nivel del mar, y eso son minutos.

Sobre los números del catálogo: los túneles publican sus resultados en unidades
que no se pueden mezclar (gramos a 45 km/h, vatios a 40, CdA de la rueda sola en
su propio utillaje), así que aquí no se copian tablas. Se construye un modelo
coherente y se ancla cada familia en el rango que reportan esas pruebas. Las
diferencias relativas entre grupos son fieles a la literatura; el valor absoluto
de un modelo concreto es una estimación.

## Qué no hace

- No tiene en cuenta la protección de setos, tapias o desmontes: el viento es el
  del modelo a campo abierto.
- El aumento de resistencia por viento cruzado (yaw) no se modela en el CdA;
  sólo se usa la componente frontal. Sí se usa el ángulo aparente para degradar
  el rebufo.
- La previsión es previsión. A 3 días es orientativa; a 10, folclore.
- El catálogo de material son familias, no medidas de cada referencia concreta.

---

## Servicios que usa

| Servicio | Para qué | Coste |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Viento horario, rachas, lluvia, presión, altimetría | Gratis, sin clave, hasta 10.000 peticiones/día no comerciales |
| [BRouter](https://brouter.de/) | Enrutado ciclista con perfiles y altimetría | Gratis, sin clave |
| [OpenRouteService](https://openrouteservice.org/) | Enrutado con desglose de firme | Gratis con clave (≈2.000 peticiones/día) |
| [OSRM de FOSSGIS](https://routing.openstreetmap.de/) | Último recurso | Gratis, sin clave |
| [CARTO](https://carto.com/attributions) + OpenStreetMap | Teselas del mapa | Gratis con atribución |

El enrutado va **en cadena y conmuta solo**: si el primero se cae o satura, se
pasa al siguiente en vez de tumbar el plan. Sin clave el orden es BRouter →
OSRM; con clave, OpenRouteService → BRouter → OSRM.

### Carretera es una obligación, camino es una preferencia

La asimetría es real: una gravel rueda perfectamente por asfalto, pero una
cubierta de 25 en un camino de tierra es un pinchazo y una vuelta andando. Así
que cuando se pide **carretera** se descartan los bucles por debajo del 95% de
asfalto y, entre los que quedan, cada metro de tierra penaliza en la
puntuación. Si ninguno llega, se avisa con el porcentaje real en vez de colar
tierra por la puerta de atrás.

El dato de firme sale de `extras.surface` de OpenRouteService, que es medido.
Sin clave no hay reparto de firme, y entonces el filtro no puede aplicarse.

> Nota: `avoid_features: ["unpavedroads"]` **no** es válido en los perfiles
> ciclistas de ORS. Devuelve un error 2003 y tumba la petición entera.

Los perfiles de BRouter encajan casi uno a uno con lo que se pide:

| Por dónde | BRouter | OpenRouteService |
|---|---|---|
| Carretera | `fastbike` | `cycling-road` |
| Mixto | `trekking` | `cycling-regular` |
| Camino | `gravel` | `cycling-mountain` |

Así que **sin clave la app funciona entera**: lo único que aporta la clave de
ORS es el desglose de firme (% de asfalto) y un cupo propio que no depende de
lo cargados que estén los servidores públicos.

## Cuentas (opcional)

Nada de esto hace falta para planificar una ruta. **Sin base de datos la app
funciona exactamente igual** y guarda el perfil en el navegador; la cuenta sólo
añade llevarte el perfil, las bicis y las rutas de un dispositivo a otro. Es una
decisión de diseño: una herramienta que te dice si vas a comer viento no puede
pedirte que te registres para usarla.

Cuando quieras activarlas:

```bash
# 1. Base de datos — en Vercel: Storage → Create Database → Postgres
npx vercel env pull .env.local

# 2. Secreto de sesión
npx auth secret

# 3. Tablas (idempotente, se puede repetir)
npm run db:setup
```

Y al menos un proveedor de acceso, en las variables del proyecto:

| Proveedor | Variables | Dónde |
|---|---|---|
| Google | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials), con redirección a `https://TU-DOMINIO/api/auth/callback/google` |
| Enlace por correo | `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` | [Resend](https://resend.com), nivel gratuito |

Los proveedores se encienden solos según las credenciales que existan: con los
dos configurados salen los dos botones, con uno sale uno, y sin ninguno la
página de acceso lo dice en vez de fallar.

Se guardan **el perfil** (cuerpo y motor), **las bicis** (cada una con su CdA y
su Crr, porque la de carretera y la de gravel no tienen nada que ver) y **las
rutas**, trazadas o importadas.

## Poner en marcha

```bash
npm install
cp .env.example .env.local   # opcional: pega tu ORS_API_KEY
npm run dev
```

Clave gratuita de OpenRouteService en <https://openrouteservice.org/dev/#/signup>.

## Desplegar en Vercel

1. Importa el repo en <https://vercel.com/new>.
2. Framework: **Next.js** (se detecta solo). Sin ajustes de build.
3. En *Settings → Environment Variables*, añade `ORS_API_KEY` si tienes clave.
   Los cambios de variables solo entran con un despliegue nuevo.
4. Deploy.

### La región importa, y mucho

`vercel.json` fija `cdg1` (París). No es un detalle: todas las fuentes de datos
son europeas, y ejecutar las funciones en Washington multiplicaba los tiempos
hasta agotar el límite de 60 s. Medido con `/api/diag`, que cronometra cada
servicio **desde donde corre la función**:

| Servicio | iad1 (Washington) | cdg1 (París) |
|---|---|---|
| Open-Meteo | 547 ms | 97 ms |
| OSRM | 334 ms | 69 ms |
| OpenRouteService | 494 ms | 138 ms |
| BRouter | 11 975 ms | 12 560 ms |

Con eso, un plan pasó de 60 s (y timeout) a **1,3 s**. BRouter no mejoró al
cambiar de región: no era latencia de red, sino que su servidor público va
sobrecargado calculando cada ruta en el momento. Por eso está el último de la
cadena.

Cronometrar desde un portátil no sirve: desde España BRouter tardaba 140 ms.

### Límites y protecciones

Cada petición a un proveedor se rinde a los 9 s y pasa al siguiente; el plan
entero tiene un plazo de 38 s, muy por debajo del límite de la plataforma, para
que un error salga **siempre como JSON**. Si se agota, la plataforma devolvería
texto plano y el navegador fallaría con un `Unexpected token 'A'` que no dice
nada del problema real.

Cuando la cadena conmuta, el motivo del fallo aparece en `meta.warnings`.

## El worker de MapLibre

MapLibre 6 deduce la URL de su worker de `import.meta.url` y se rinde si no
empieza por `http`:

```js
if (!/^https?:/.test(import.meta.url)) return "";
```

Bajo cualquier bundler moderno (Turbopack incluido) eso devuelve cadena vacía,
MapLibre hace `new Worker("")` y el worker nace muerto **sin lanzar nada**. El
basemap se sigue viendo porque las teselas ráster van por el hilo principal,
pero toda fuente GeoJSON se tesela en el worker: la ruta, las flechas y las
alternativas desaparecen con la consola limpia.

Por eso `scripts/copy-maplibre-worker.mjs` copia el worker a `public/maplibre/`
en cada build (`prebuild` y `predev`) y `MapView` lo apunta con `setWorkerUrl()`.

Para comprobarlo en un navegador de verdad, que es la única forma de verificar
WebGL:

```bash
node scripts/visual-check.mjs http://localhost:3000 salida.png
```

Traza una ruta, pregunta a MapLibre qué está renderizando de verdad
(`queryRenderedFeatures`), cuenta los píxeles de color de la captura y guarda
un recorte del mapa en claro y en oscuro. `scripts/probe.mjs` va más abajo aún:
intercepta `Worker` y vuelca el estado interno del estilo.

## Estructura

```
src/
  app/
    api/plan/route.ts      validación + orquestación
    api/geocode/route.ts   búsqueda de lugares (Pelias o Nominatim)
    page.tsx  layout.tsx  globals.css  icon.svg  opengraph-image.tsx
  lib/
    geo.ts        haversine, rumbos, remuestreo, bucles poligonales
    physics.ts    balance de potencia, descomposición del viento, simulación
    wind.ts       Open-Meteo, campo de viento interpolable, altimetría
    routing.ts    ORS + OSRM tras la misma interfaz, geocodificación
    planner.ts    candidatos, barrido horario, puntuación y refinado
    gpx.ts  format.ts  types.ts
  components/
    Planner.tsx   estado y formulario
    MapView.tsx   MapLibre: ruta coloreada por viento, flechas, popups
    RouteProfile.tsx  perfil de viento + velocidad + relieve
    WindRose.tsx  HourStrip.tsx  PlaceInput.tsx
```

## Licencia

MIT.
