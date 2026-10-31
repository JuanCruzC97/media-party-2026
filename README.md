# Del pozo de agua al oro negro

Sitio interactivo sobre el descubrimiento del petróleo en Comodoro Rivadavia y
el nacimiento de YPF (1903–1923), basado en la nota de ADNSUR del 13 de
diciembre de 2020.

**Sitio publicado:** <https://juancruzc97.github.io/media-party-2026/>

El proyecto propone dos recorridos por la misma historia:

- **Exploración visual** (`experiencia/`): scrollytelling de ocho actos y un
  epílogo, con una escena 3D del castillete y el paisaje patagónico, fotografías
  de archivo, visualizaciones y modo cine.
- **Línea de tiempo** (`artifact/`): documento cronológico autocontenido con
  fechas, cifras, nombres y citas de la nota original.

## Estructura

```
index.html                  portada del proyecto
experiencia/
  index.html                scrollytelling 3D
  src/                      escena, historia, capítulos y estilos
  assets/                   fotografías y tipografías
  vendor/                   Three.js y OrbitControls
  torre/                    módulos legacy sin uso en la app actual
artifact/
  index.html                línea de tiempo standalone
PLAN.md                     plan de contenidos y arquitectura
.nojekyll                   desactiva el procesamiento de Jekyll en Pages
```

## Desarrollo local

Cualquier servidor estático sirve; no hay build ni dependencias que instalar.

```bash
python3 -m http.server 4173
```

Abrir <http://localhost:4173/> para la portada, o directamente:

- <http://localhost:4173/experiencia/>
- <http://localhost:4173/artifact/>

## GitHub Pages

El sitio se publica desde la rama `main`, en la raíz del repositorio
(Settings → Pages → Deploy from a branch → `main` / `/`). No requiere acciones
ni compilación: los archivos se sirven tal como están.

## Créditos

- Fuente periodística: [ADNSUR, 13/12/2020](https://www.adnsur.com.ar/sociedad/comodoro-rivadavia--la-ciudad-donde-se-descubrio-el-petroleo-y-nacio-la-historica-ypf_a5fd5a66e1ff12e43bc98791d).
- Escena 3D: Three.js, modelado procedural.
- Tipografías: Fraunces e IBM Plex Sans.
