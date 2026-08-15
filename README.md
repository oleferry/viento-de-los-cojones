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

2. **Descarga la previsión.** Una sola llamada a Open-Meteo para una rejilla de
   7 puntos que cubre la zona de la ruta. El viento se interpola en el espacio
   por distancia inversa y en el tiempo linealmente, siempre sobre las
   **componentes u/v** — promediar grados daría disparates cuando el viento
   cruza el norte.

3. **Simula avanzando el reloj.** Trocea la ruta en tramos de 400 m y consulta
   la previsión *en el instante en el que pasarías por cada punto*, no en el de
   salida. En una ruta de tres horas eso cambia bastante el resultado.

4. **Resuelve el balance de potencia.** Por cada tramo, con el viento proyectado
   sobre el rumbo y la pendiente:

   ```
   P = [ ½·ρ·CdA·|v+w|·(v+w) + Crr·m·g·cos θ + m·g·sin θ ] · v / η
   ```

   e invierte esa ecuación por bisección para sacar la velocidad de equilibrio.
   El viento a 10 m (que es lo que dan los modelos) se corrige a la altura del
   ciclista con un perfil logarítmico sobre campo abierto (z₀ = 0,05 m).

5. **Puntúa.** Tiempo total, fracción a favor y en contra, y el viento medio en
   el último 35% de la ruta. Las tres estrategias son pesos distintos sobre esos
   mismos números.

## Qué no hace

- No tiene en cuenta la protección de setos, tapias o desmontes: el viento es el
  del modelo a campo abierto.
- El aumento de resistencia por viento cruzado (yaw) no se modela; sólo se usa
  la componente frontal.
- La previsión es previsión. A 3 días es orientativa; a 10, folclore.

---

## Servicios que usa

| Servicio | Para qué | Coste |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Viento horario, rachas, lluvia, altimetría | Gratis, sin clave, hasta 10.000 peticiones/día no comerciales |
| [OpenRouteService](https://openrouteservice.org/) | Enrutado ciclista con perfiles y firme | Gratis con clave (≈2.000 peticiones/día) |
| [OSRM de FOSSGIS](https://routing.openstreetmap.de/) | Enrutado de respaldo | Gratis, sin clave, uso moderado |
| [CARTO](https://carto.com/attributions) + OpenStreetMap | Teselas del mapa | Gratis con atribución |

Sin clave de ORS la app **funciona igualmente** con OSRM: pierdes la distinción
carretera/camino y el desglose de firme, y la altimetría se saca aparte de
Open-Meteo.

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
4. Deploy.

El endpoint `/api/plan` está declarado con `maxDuration = 60`, suficiente para
las ~15 peticiones de enrutado que hace una circular.

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
