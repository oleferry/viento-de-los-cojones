# Ondivento — guía de producto

Documento de incorporación para dirección de marketing. Cuenta **qué es la app,
para quién, qué la diferencia, qué puede y qué no puede prometerse**, y las
restricciones reales de coste y escala que condicionan cualquier campaña.

Para el detalle técnico (algoritmos, fórmulas, proveedores) está el
[README](README.md). Este documento no lo repite: lo traduce.

- **Producto en vivo:** <https://ondivento.com>
- **Estado:** funcionando en producción, **sin usuarios reales todavía**
- **Equipo:** una persona
- **Fecha del documento:** agosto de 2026

---

## 1. Qué es, en una frase

> Un planificador de rutas en bici que **traza la ruta en función del viento**,
> en vez de decirte el viento de una ruta que ya tienes.

Esa inversión es todo el producto. Conviene interiorizarla antes de escribir una
sola línea de copy, porque es lo único que no tiene nadie más.

## 2. El problema real

Para un ciclista de carretera, el viento es la variable que más condiciona una
salida y la única que no se puede entrenar. En terreno llano y abierto —Tierra
de Campos, La Mancha, los Monegros, buena parte de Castilla— decide si una
salida de 80 km es agradable o un castigo.

El error clásico es salir con el viento a favor porque se va cómodo, y volver
80 km de cara, reventado y con frío. Todo ciclista de meseta lo ha hecho.

Las herramientas actuales no resuelven esto:

| Herramienta | Qué hace | Qué le falta |
|---|---|---|
| Windy, AEMET, Meteoblue | Te dicen qué viento hace | No saben por dónde vas a ir |
| Komoot, Strava, RideWithGPS | Trazan rutas muy bien | Ignoran el viento por completo |
| Garmin / Wahoo | Te dan el viento en tiempo real | Cuando ya estás dentro y no hay remedio |

Nadie **traza la ruta** partiendo del viento. Ese es el hueco.

## 3. Qué hace, en lenguaje de usuario

Le dices de dónde sales, cuántos kilómetros quieres y qué prefieres sufrir. Te
devuelve el trazado que mejor le viene al aire, y la hora a la que conviene
salir.

**Lo que ve el usuario:**

- **Ruta circular** que vuelve al punto de salida, o **de A a B**
- **Tres estrategias** según lo que prefiera:
  - *Volver a favor* — el regalo, al final (la que resuelve el error clásico)
  - *El palo primero* — de cara al salir, a favor al volver
  - *Menos esfuerzo* — minimiza el viento en toda la ruta
- **Carretera, camino o mixto**, con reparto real de asfalto
- **Mejor hora de salida**, comparando cada hora del margen que dé
- **Pronóstico a 5 días**: "¿y si voy mañana?" — a menudo la respuesta útil
- **Importar su propia ruta** (GPX, TCX, KML) y que le diga cuándo hacerla y en
  qué sentido
- **Perfil de ciclista** afinable: cuerpo, bici, material, grupo con quien sale
- **Descarga el GPX** con la hora estimada de paso por cada punto
- **Comparte la ruta** por enlace, con vista previa en WhatsApp y redes
- **Avisos por correo**: "hoy toca buen viento para tu ruta"
- **Se instala como app** en el móvil y abre sin cobertura
- **Español e inglés**

**Sin necesidad de cuenta.** Planificar funciona igual sin registrarse. La cuenta
solo añade llevarse el perfil y las rutas de un dispositivo a otro. Es una
decisión deliberada, y da un argumento de venta honesto: *una herramienta que te
dice si vas a comer viento no puede pedirte que te registres para usarla*.

### Compartir: la pieza que importa para crecer

Merece explicación aparte porque es el único mecanismo de difusión que tiene hoy
el producto.

Al pulsar **Compartir** se genera un enlace con el trazado exacto. Quien lo
recibe no ve una postal: **abre la ruta simulada con el viento de hoy y con su
propio perfil de ciclista**. Es decir, el enlace no envejece — la misma ruta
compartida en marzo sigue contestando "¿a qué hora la hago?" en octubre.

Tres cosas relevantes para marketing:

- **Ni quien comparte ni quien abre necesitan cuenta.** Cero fricción en los dos
  extremos de la cadena, que es justo donde se pierde la gente.
- **Al pegarlo en WhatsApp o X sale una tarjeta** con la forma real del trazado,
  los kilómetros y el desnivel. Un enlace con imagen se propaga; uno de texto
  plano, no.
- **El enlace es la demo.** Alguien que nunca ha oído hablar de Ondivento entra
  por una ruta concreta que le ha pasado un amigo, y lo primero que ve es el
  producto funcionando sobre algo que le interesa. Es mejor puerta de entrada que
  cualquier página de aterrizaje.

Lo que **no** hace todavía: la tarjeta no muestra el peaje del aire, solo forma,
distancia y desnivel. Es deliberado — esa imagen la pide el servidor de WhatsApp
y calcular el viento ahí la haría lenta. Si en algún momento interesa una imagen
más vendedora, se puede hacer, pero es trabajo aparte.

## 4. Cómo funciona (lo justo para hablar con propiedad)

No hace falta entender la física, pero sí saber que **la hay**, porque es el
diferenciador defendible.

1. **Prueba una docena de trazados distintos** saliendo en direcciones
   diferentes. La dirección de salida es la palanca que mueve el viento.
2. **Descarta lo que no es una ruta**: mide cuánto se repite el recorrido y tira
   lo que sea un ir y volver por el mismo sitio.
3. **Simula cada trazado avanzando el reloj**: consulta la previsión en el
   instante en el que pasarías por cada punto, no en el de salida. En una ruta
   de tres horas eso cambia el resultado.
4. **Resuelve la ecuación de potencia** en cada tramo de 400 m, con el viento
   proyectado sobre tu rumbo y la pendiente, para sacar tu velocidad real.
5. **Puntúa y ordena** según la estrategia elegida.

**Detalles que sí merece la pena contar** porque distinguen de un juguete:

- El viento se corrige de los 10 m que dan los modelos **a la altura del
  ciclista**.
- La **densidad del aire** se calcula con presión, temperatura y humedad reales.
  En la meseta a 800 m un mediodía de agosto el aire pesa un 14% menos que el
  estándar, y eso son minutos.
- El **rebufo** se degrada según lo angulado que entre el aire: con viento de
  lado el grupo se abre en abanico y tapa la mitad.
- El **CdA** sale de tu antropometría (superficie corporal de Du Bois) más el
  material, no de un número inventado.

### Sobre el catálogo de material: honestidad obligatoria

El catálogo cubre cuadros, ruedas, neumáticos, ropa, casco y equipaje de lo que
hay en el mercado. **Pero los valores son estimaciones ancladas en la
literatura, no medidas de cada referencia.** Los túneles de viento publican en
unidades incompatibles entre sí, así que se construyó un modelo coherente y se
ancló cada familia en el rango que reportan esas pruebas.

Las **diferencias relativas entre familias** son fieles. El **valor absoluto de
un modelo concreto es una estimación**.

> **Nunca escribir** "sabemos exactamente cuánto arrastra tu Cervélo S5". Sí se
> puede escribir "distingue una bici aero de una clásica con criterio, no a ojo".

## 5. Qué NO se puede prometer

Esto no es letra pequeña: es la línea que separa un producto creíble de uno que
decepciona al primer uso. Los propios [términos](https://ondivento.com/es/terminos)
lo dicen: *es una estimación, no una promesa*.

- **La previsión es previsión.** A 3 días orienta; a 10, es folclore.
- **No sabe de setos, tapias ni desmontes.** El viento es el del modelo a campo
  abierto. En una ruta protegida, se equivocará.
- **El firme depende de OpenStreetMap.** Si un tramo no está etiquetado, no se
  sabe. Se dice explícitamente en la interfaz.
- **Los tiempos dependen del perfil que meta el usuario.** Si pone un FTP
  optimista, saldrán tiempos optimistas.
- **No modela el aumento de resistencia por viento cruzado** en el CdA, solo la
  componente frontal.

Ninguna campaña debería prometer minutos exactos ni "la ruta perfecta". El
mensaje honesto y suficientemente potente es: **sales sabiendo por dónde te va a
pegar el aire, en vez de descubrirlo a mitad de camino**.

## 6. Público objetivo

**Núcleo (a quien está hecho):** ciclista de carretera aficionado, sale de 2 a 5
veces por semana, rutas de 40–120 km, vive en terreno llano y ventoso. Le importa
el rendimiento lo bastante como para conocer su FTP. En España: ambas Castillas,
Aragón, Navarra, Extremadura.

**Extensiones naturales:**
- **Gravel y cicloturismo** — ya soportado (perfiles de camino, equipaje,
  alforjas)
- **Grupos y clubes** — el modelo de rebufo ya está; "salimos 8, ¿por dónde
  vamos el domingo?"
- **Internacional** — la app está en inglés y las fuentes de datos son
  mundiales. Países llanos y ventosos: Países Bajos, Dinamarca, norte de
  Alemania, este de Inglaterra, llanuras de EE.UU.

El dominio y la marca se eligieron **deliberadamente para vender fuera de
España**: se descartaron nombres castizos por eso. "Ondivento" funciona en
español, italiano y como marca neutra en inglés.

## 7. Estado actual y qué falta

**Funcionando en producción y verificado:**

| | |
|---|---|
| Planificación, simulación, pronóstico 5 días | ✅ |
| Importar GPX/TCX/KML | ✅ |
| Perfil de ciclista y catálogo de material | ✅ |
| Español e inglés, con selector | ✅ |
| Cuentas (Google y enlace por correo) | ✅ |
| Guardar rutas y bicis | ✅ |
| Avisos de viento por correo | ✅ |
| **Compartir una ruta por enlace, con imagen de vista previa** | ✅ |
| Instalable como app, funciona sin cobertura | ✅ |
| Privacidad y términos publicados | ✅ |
| Analítica de uso | ✅ |

**Lo que no hay todavía:**

- **Usuarios reales.** Cero. Nunca se ha anunciado.
- **Exportar a TCX/FIT** (ahora solo GPX).
- **Integración con Strava/Komoot.** No existe.
- **Detección automática de FTP** desde ficheros de actividad.
- **Cualquier forma de monetización.**

## 8. Restricciones que condicionan cualquier campaña

**Esto es lo más importante que un CMO debe saber antes de planificar nada.**

La app se apoya en servicios gratuitos con cupos diarios:

| Servicio | Cupo | Qué pasa al superarlo |
|---|---|---|
| OpenRouteService | ~2.000 peticiones/día | Conmuta a servidores públicos, sin reparto de firme |
| Open-Meteo | 10.000/día, **uso no comercial** | Deja de responder |
| Vercel (plan Hobby) | Límites de plan gratuito | Ver abajo |

**Cada ruta planificada consume entre 7 y 13 peticiones de enrutado**, medido
sobre distancias de 30 a 120 km. Eso significa que el cupo de OpenRouteService
da para unas **150-250 rutas al día**. Una campaña que traiga mil visitas en una
tarde lo agota.

**Dos cláusulas que hay que mirar antes de monetizar:**

1. **Open-Meteo gratuito es para uso no comercial.** Si Ondivento pasa a ser
   comercial, hace falta plan de pago.
2. **El plan Hobby de Vercel es para uso no comercial.** Ya nos topamos con sus
   límites: solo permite **un cron al día**, por lo que el aviso de viento se
   manda una vez cada mañana y no dos.

> **Conclusión práctica:** el producto está listo para enseñarse, pero
> **no está dimensionado para un lanzamiento masivo ni para cobrar**. Antes de
> cualquier campaña grande hay que decidir presupuesto de infraestructura. No es
> mucho dinero, pero no es cero, y hay que decidirlo antes y no durante.

## 9. Qué se puede medir (y qué no)

Hay **Vercel Web Analytics**: visitas, páginas, referentes, dispositivos.
Agregado y anónimo.

**No hay** seguimiento entre webs, ni píxeles publicitarios, ni cookies de
terceros. Es una decisión de diseño coherente con lo que se le promete al
usuario en la página de privacidad, que dice literalmente que no hay publicidad
ni rastreo.

Cambiar eso es posible, pero **exigiría reescribir la política de privacidad y
probablemente un banner de consentimiento**, lo que empeora el producto. Merece
una conversación antes de asumir que se pueden meter las herramientas de
marketing habituales.

> **Un matiz que conviene tener claro antes de vender privacidad como bandera.**
> Hasta que llegó compartir, la app no guardaba absolutamente nada de quien no
> tuviera cuenta. Ahora hay una excepción: si pulsas *Compartir*, esa ruta se
> guarda en el servidor, porque es lo que hace que el enlace funcione. La
> política de privacidad ya lo dice, y advierte además de que el punto de salida
> de una ruta dice bastante de dónde vives. El mensaje sigue siendo fuerte —
> *sin publicidad, sin rastreo, sin cuenta obligatoria* — pero **no** se puede
> escribir "no guardamos nada" a secas.

Lo que sí se puede medir sin tocar nada: rutas planificadas, cuentas creadas,
rutas guardadas, avisos activados y **rutas compartidas**. Son datos propios del
producto.

Compartir es además la métrica más útil que hay ahora mismo, porque se puede
medir el circuito entero: cuántos enlaces se generan, cuántas visitas llegan a
`/r/…`, y cuántas de esas acaban planificando una ruta propia. Eso es un embudo
de difusión real, no una métrica de vanidad.

## 10. Vocabulario

Para escribir copy sin meter la pata:

| Término | Qué es |
|---|---|
| **Peaje del aire** | Minutos que te cuesta el viento frente a un día en calma. Es el número central del producto. |
| **A favor / de cara / de lado** | Cómo entra el viento respecto a tu rumbo. |
| **Rebufo** | Ir resguardado detrás de otro ciclista. |
| **CdA** | Cuánto arrastre ofreces al aire. Menor es mejor. |
| **Crr** | Resistencia a la rodadura del neumático. |
| **FTP** | Potencia que un ciclista sostiene una hora. Referencia estándar. |
| **Factor de intensidad (IF)** | Fracción del FTP que piensas sostener. |
| **Firme** | Si el suelo es asfalto o tierra. |

**Registro de marca:** directo, sin épica, con humor seco. La app dice cosas como
*"de noche no se sale"* o *"el palo primero"*. Habla como un ciclista a otro, no
como una consultora. Conviene mantenerlo.

## 11. Primeras preguntas que conviene responder

Ordenadas por lo que bloquean:

1. **¿Esto se va a monetizar?** Condiciona las licencias de datos y el plan de
   infraestructura. Bloquea casi todo lo demás.
2. **¿España primero o internacional desde el día uno?** La app ya está en
   inglés; el producto funciona en cualquier sitio. Es decisión de foco, no
   técnica.
3. **¿Cuánto presupuesto de infraestructura hay?** Determina cuánta gente puede
   entrar a la vez sin que se degrade.
4. **¿Cómo se siembra el primer puñado de enlaces?** El mecanismo de difusión ya
   existe y funciona, pero solo se activa si alguien comparte, y hoy no hay
   nadie. Un club, un grupo de WhatsApp de una zona ventosa o media docena de
   rutas buenas ya compartidas de antemano bastan para arrancarlo.

---

## Apéndice: enlaces

- Producto: <https://ondivento.com>
- Privacidad: <https://ondivento.com/es/privacidad>
- Términos: <https://ondivento.com/es/terminos>
- Detalle técnico: [README.md](README.md)
- Contacto de datos personales: privacidad@ondivento.com
