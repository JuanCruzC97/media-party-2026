# El castillete

Visor 3D de un castillete minero de madera, modelado proceduralmente con
Three.js. Sin textos ni etapas: la estructura sobre su paisaje, con órbita y
zoom.

## Ejecutar

```bash
cd media-party-2026
python3 -m http.server 4173
```

Abrir <http://localhost:4173>.

## Interacción

- Arrastrar para girar alrededor del castillete.
- Rueda del ratón o pellizco táctil para acercar / alejar.

## Archivos

```
index.html              canvas a pantalla completa
src/main.js             arranque y render loop
src/scene.js            cámara, órbita, luces y paisaje atmosférico
src/structure.js        castillete, terreno, colinas, valla y polvo
src/style.css           cielo, viñeta y fade-in
vendor/three.module.js
vendor/OrbitControls.js
```

## Créditos

Referencia visual: castillete minero de madera. Demo creada con la skill
`web3d-integration-patterns`.
