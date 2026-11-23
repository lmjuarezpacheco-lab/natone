# NatOne

Extensión para Owlbear Rodeo: tracker de iniciativa con reroll por ronda y dice roller con dados 3D.

## Instalar

En Owlbear Rodeo: *Extensiones → Agregar extensión personalizada* y pega esta dirección:

```
https://anoobdm.com/natone/manifest.json
```

Después activa *NatOne* en la sala.

## Qué hace

**Iniciativa**

- Clic derecho en un token → *Agregar a iniciativa*.
- El GM escribe la iniciativa a mano (por ejemplo, si se tiró en D&D Beyond) o la tira con el botón de d20.
- El bonificador se guarda en el token. Sigue ahí aunque el token salga del tracker.
- Ajustes del GM:
  - **Normal**: una tirada para todo el combate.
  - **Reroll cada ronda → Automático**: al terminar la ronda, el tracker tira d20 + bonificador para todos.
  - **Reroll cada ronda → Manual**: al terminar la ronda, las iniciativas se vacían y se vuelven a escribir o tirar.
  - **Marcar en el mapa el token en turno**: un marco ámbar rodea al token activo. Cada cliente dibuja el suyo como
    elemento local, así que no se guarda en la escena. Si el token está oculto, solo el GM ve el marco.
  - **Los jugadores pueden cambiar su propia iniciativa**: cada jugador edita solo los tokens que le pertenecen.
    El GM asigna el jugador de cada token en el menú `⋯`. El cliente del GM valida cada cambio, así que
    el GM debe estar conectado.

**Dados**

- d4 a d100, modificador, tirada oculta, historial compartido.
- Con 2 o más dados del mismo tamaño aparece el control *Todos / Más altos / Más bajos* y cuántos se suman.
  Atajos de un clic: *Ventaja*, *Desventaja* y *4d6, 3 más altos*.
- El campo de texto acepta la misma regla escrita: `4d6kh3`, `2d20kl1 + 5`.
- Los dados 3D salen de la bandeja 5 segundos después de la tirada.
- Dados 3D apagados por defecto. Cada persona los enciende en *Mis dados* y elige entre 9 modelos.
  Con ese panel abierto, la bandeja muestra una vista previa del modelo y color elegidos.
  Con 3D apagado, el motor 3D no se descarga.
- Los demás ven el resultado de la tirada, no la animación.

**Monstruos** (solo GM)

- *Importar JSON* lee archivos de monstruos en formato 5etools (`bestiary-*.json` o archivos homebrew con lista `monster`).
  El archivo lo aporta cada GM. La extensión no descarga ni incluye contenido.
- *Nuevo monstruo* abre el editor homebrew: estadísticas, salvaciones, habilidades, rasgos y acciones con ataque y daño.
  *Editar* en cualquier hoja abre el mismo editor.
- *Exportar homebrew* descarga las hojas creadas en el editor como `natone-homebrew.json`.
  *Importar JSON* también lee ese archivo, para pasar las hojas a otro navegador.
- Las hojas se guardan solo en el navegador del GM (IndexedDB). No se envían a la sala.
- Cada hoja tira pruebas, salvaciones, habilidades, ataques y daño. Opciones: ventaja, daño crítico, tirada oculta.
  Estas tiradas no usan dados 3D.
- *Asignar a tokens seleccionados* vincula la hoja con tokens del mapa, pone su bonificador de iniciativa y los agrega al tracker.
- Límites: los monstruos que copian a otro de un archivo distinto (`_copy`) se omiten, y los cambios `_mod` no se aplican.

Archivos de ejemplo para *Importar JSON*, en la carpeta [`ejemplos`](ejemplos). Los monstruos son inventados:

- [`plantilla-monstruo.json`](https://github.com/lmjuarezpacheco-lab/natone/releases/download/ejemplos/plantilla-monstruo.json): un monstruo en blanco para rellenar.
- [`ejemplo-monstruos.json`](https://github.com/lmjuarezpacheco-lab/natone/releases/download/ejemplos/ejemplo-monstruos.json): dos monstruos completos en el formato de NatOne.
- [`ejemplo-formato-5etools.json`](https://github.com/lmjuarezpacheco-lab/natone/releases/download/ejemplos/ejemplo-formato-5etools.json): un monstruo en el formato 5etools.

Sobre el contenido: solo el material del SRD es libre (CC-BY-4.0, con atribución a Wizards of the Coast).
El resto de los libros oficiales tiene copyright. Si publicas esta extensión, no incluyas archivos de monstruos.

## Desarrollo

```bash
npm install
npm run dev
```

`http://localhost:5173` abre una vista previa con datos de ejemplo.

Para probar dentro de Owlbear Rodeo: *Extensiones → Agregar extensión* y pega
`http://localhost:5173/manifest.json`.

```bash
npm test
npm run build
```

Cada push a `main` pasa los tests, compila y publica en Cloudflare Pages (`.github/workflows/deploy.yml`).
El sitio completo vive en `anoobdm.com`: la carpeta `sitio/` es la página de la raíz y la extensión se sirve en `/natone/`.

`dist/` es un sitio estático, así que también sirve en otro hosting con HTTPS. Si el sitio vive en una
subcarpeta, compila con `BASE_PATH=/nombre-de-la-carpeta/ npm run build`.

## Créditos

- Los números de los modelos con color libre usan texturas propias, más gruesas y con contorno, en `dice-overrides/`.
  `scripts/make-contrast-textures.sh` las genera a partir de las originales (requiere ImageMagick).
- Dados 3D: [dice-box](https://github.com/3d-dice/dice-box) y [dice-themes](https://github.com/3d-dice/dice-themes) de Frank Ali, licencia MIT.
