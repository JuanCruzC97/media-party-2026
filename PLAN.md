# Plan · Del pozo de agua al oro negro

Documental interactivo sobre el descubrimiento del petróleo en Comodoro Rivadavia
y el nacimiento de YPF, basado en la nota de ADNSUR del 13 de diciembre de 2020.

## Objetivo

Convertir la nota y el artifact de línea de tiempo en una experiencia web
cinematográfica, con scroll narrativo, escena 3D del castillete, fotografías de
archivo y visualizaciones de datos. El contenido debe cubrir toda la información
de la nota: hechos, fechas, cifras, nombres, citas y legado.

## Formato

- Scrollytelling de 8 actos + epílogo.
- Escena 3D fija de fondo, cámara guiada por el scroll.
- Fotografías históricas tratadas como placas de archivo, con epígrafe y fuente.
- Capa documental desplegable para incluir los detalles completos sin saturar.
- Modo cine: autoavance de la misma secuencia.
- Epílogo con órbita libre del castillete.
- Fallback estático para `prefers-reduced-motion` y para fallos de WebGL.

## Mapa de contenidos

### 0 · Prólogo — “El día”
- 13/12/1907, Kilómetro 3. Una gota de kerosene confirma lo que se sospechaba.
- Desde 1907 se celebra el Día del Descubrimiento del Petróleo.
- YPF nace en 1922, se privatiza en los 90 y luego vuelve al Estado.

### 1 · 1903–1906 — “Buscaban agua”
- Poblado fundado para tener salida al mar.
- 1903: Dirección de Minas, Geología e Hidrología envía una perforadora; 107 m.
- 1906: reactivación; 14/12 se descarga la “Wenceslao Escalante”, una de las
  cuatro del sistema Fauck y Cía. compradas en Viena.

### 2 · 1907 — “El pozo 2”
- 24/03: comienza la búsqueda de agua; José Fuchs a cargo.
- Mediados de año: problemas de personal; Julio Krause envía a Humberto Beghin,
  que queda a cargo del campamento y la perforación.
- Noviembre: el pozo 2 llega a 500 m; Krause consulta a Fuchs por telégrafo y
  Fuchs autoriza continuar.

### 3 · 11–13/12/1907 — “Los tres días”
- 11/12: olor a gas de kerosene; Fuchs y Beghin comunican la sospecha a Buenos
  Aires. Telegrama completo.
- 12/12: Krause ordena suspender la perforación y sacar el agua para comprobar.
- 13/12, cerca de las 8: Beghin confirma el hallazgo en la canaleta; 535 m.
- Frase histórica y mensaje al Gobierno: “kerosene de la mejor calidad”.

### 4 · 1910–1919 — “El Estado”
- 1910: Dirección General de Explotación de Petróleo, presidida por Luis Huergo;
  dependiente de la Dirección de Minas, Geología e Hidrología del Ministerio de
  Agricultura.
- Gestiones por un puerto, construcción de un muelle y compra de otro en Caleta
  Córdova; casas, proveeduría y servicios para los trabajadores.
- 1919: Chalet Huergo, luego Monumento Nacional Histórico; albergó presidentes y
  figuras internacionales.

### 5 · 1922 — “Nace YPF”
- Creación de YPF; general Mosconi, primer director; plan de cuatro años;
  destilería de Ensenada.
- 22/02: primer surtidor de kerosene en Buenos Aires; 20/06: primero de nafta.
- 60 t de petróleo almacenadas en Comodoro.
- Argentina, mayor consumidor de petróleo de América del Sur (delante de Chile,
  Brasil y Venezuela) y segundo productor detrás de Venezuela.
- Comodoro: 130 de los 137 pozos del país.

### 6 · 1923–1930 — “La era Mosconi”
- 1923: producción de 450.328 m³; 343.889 m³ de YPF con 89 pozos; resto privado.
- 01/01/1927: usina eléctrica central de 25.000 HP.
- 1930: producción de 1.170.300 m³; 721.592 m³ de YPF.
- Gestión de Mosconi hasta septiembre de 1930.

### 7 · 1930–presente — “La huella”
- Prosperidad: Hospital Presidente Alvear (Km 3), escuela, capilla Santa Lucía,
  gamelas, proveeduría (hoy CERET) y más escuelas.
- Shell en Diadema; Astra en Km 20; Compañía Ferrocarrilera Patagónica; cines
  históricos; viejo cine de Km 8; Chalet Huergo.
- YPF se privatiza en los 90 y luego vuelve al Estado.
- Siglo XXI: el petróleo sigue siendo la principal fuerza económica; frecuencias
  aéreas, consumo e inmigración.
- Cierre con Fuchs y Beghin.

### 8 · Epílogo — “Explorar”
- Órbita libre, créditos, fuente y enlace a la nota.

## Sistema visual

- Paleta: papel `#f4efe4`, tinta `#171512`, petróleo `#102a25`, ámbar `#c08a3e`,
  óxido `#a14e2a`, gris patagónico `#9aa49f`.
- Tipografía: Fraunces 300/600 para títulos, citas y años; IBM Plex Sans 400/600
  para cuerpo, datos y UI.
- Fotos: duotono/sepia, grano, borde de papel, máscara de entrada y zoom lento.
- Movimiento: cámara pesada, transiciones de 600–900 ms, parallax suave.
- Sin animaciones rebotantes. Respetar `prefers-reduced-motion`.
- Los datos se visualizan en SVG/DOM; el 3D no compite con la lectura.

## Arquitectura

```
index.html                        portada del proyecto
experiencia/index.html            shell, contenido, timeline, índice, créditos
experiencia/src/main.js           arranque y loop
experiencia/src/chapters.js       cámaras, atmósferas, datos y metadatos por acto
experiencia/src/story.js          scroll, cámara, modo cine, timeline, índice
experiencia/src/scene.js          stage, cámara, luces, atmósfera, órbita
experiencia/src/structure.js      castillete, campo de torres, campamento, canaleta
experiencia/src/visuals.js        medidor de profundidad, pozos, gráfico, contadores
experiencia/src/style.css         sistema visual, responsive, reduced motion
experiencia/assets/photos/        fotos de archivo
experiencia/assets/fonts/         Fraunces + IBM Plex Sans
artifact/index.html               línea de tiempo standalone
```

- Canvas fijo; capítulos con `position: sticky` en desktop y flujo normal en mobile.
- Timeline maestra en JS: acto activo + progreso local.
- Cámara: poses por acto, interpolación suave y micro-movimiento.
- Atmósfera: interpolación de cielo, niebla, sol, exposición.
- Escena: torre con recorte vertical de construcción, campo de torres
  instanciadas, campamento, luces y gota de petróleo.
- Fotos: placas dentro de cada acto, con `--p` para escalar/recortar.
- Datos: 137 pozos, producción 1923/1930, 25.000 HP, contadores.
- Accesibilidad: contenido en el DOM, canvas decorativo, fallback estático,
  navegación por teclado, foco visible, contraste.

## Fases

- [ ] Fase 0 · Plan, assets, fuentes y créditos.
- [ ] Fase 1 · Shell HTML/CSS, capítulos estáticos, responsive.
- [ ] Fase 2 · Escena 3D, cámara, atmósfera y estados.
- [ ] Fase 3 · Scroll, placas, secuencia de descubrimiento y modo cine.
- [ ] Fase 4 · Visualizaciones de datos y epílogo.
- [ ] Fase 5 · QA, performance, reduced motion, fallback y documentación.

## Criterios de aceptación

- Todos los hechos, cifras, nombres y citas de la nota están representados.
- La experiencia funciona en desktop y mobile; el contenido es legible sin 3D.
- No hay errores de consola ni imágenes rotas.
- `prefers-reduced-motion` muestra una versión estática completa.
- El modo cine avanza y se pausa con la interacción.
- La órbita libre funciona en el epílogo.
- Créditos de fotos y fuente visibles.
