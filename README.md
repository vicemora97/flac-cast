# Flac Cast

Base de una app de escritorio que reproduce archivos FLAC locales y los sirve directamente a dispositivos Google Cast dentro de la misma red.

## Estado actual

- Selector de carpeta.
- Múltiples carpetas locales o de red, administrables desde la aplicación.
- Escaneo recursivo de archivos `.flac`.
- Metadatos y resolución de cada pista.
- Carátulas embebidas o archivos `cover`, `folder`, `front` y `album` en JPG, PNG o WebP.
- Navegación por pistas, álbumes, artistas y playlists persistentes.
- Búsqueda global y cola manual FIFO separada de la reproducción programada.
- Reproducción local con anterior, siguiente, aleatorio y repetición por álbum o pista.
- Transporte personalizado cuyo color se adapta a la carátula del álbum.
- Servidor efímero con token, CORS y soporte de rangos listo para Cast.
- Descubrimiento de dispositivos Google Cast por mDNS.
- Envío del FLAC original, pausa, reanudación, volumen sincronizado y desconexión desde la app.
- Controles de reproducción en la miniatura de la barra de tareas de Windows.
- Bandeja de Windows, atajos de teclado y restauración de la sesión de reproducción.
- Sin telemetría, nube, cuentas ni carga de archivos.
- Actualización incremental mediante eventos del sistema y verificación de respaldo cada diez minutos.
- Precalentamiento gradual en disco de las próximas pistas para reducir esperas al usar Cast.

Consulta [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) para conocer el flujo local y Cast.

## Usar Chromecast

1. Conecta el PC y el Chromecast a la misma red local.
2. Si Firewall de Windows pregunta, permite Electron únicamente en redes privadas.
3. Abre **Cast**, elige el dispositivo y selecciona una pista.

La app intenta enviar primero el FLAC original. Si el receptor lo rechaza, prueba el MIME alternativo y finalmente convierte localmente a WAV PCM. Para la Samsung S700D usa PCM 16-bit clásico por compatibilidad con su receptor Cast, aplicando dithering al convertir desde 24-bit. No sube el archivo a Internet ni usa formatos con pérdida.

## Ejecutar en desarrollo

```powershell
npm.cmd install
npm.cmd run dev
```

En este equipo debe usarse `npm.cmd` porque PowerShell bloquea el wrapper `npm.ps1`.

## Aplicación de Windows

La aplicación guarda en `%APPDATA%\Hires Local`:

- la carpeta de música elegida;
- el tamaño y la posición de la ventana;
- el índice de metadatos de la biblioteca;
- las carátulas deduplicadas.

Al iniciar, muestra inmediatamente el índice guardado y revisa las carpetas en segundo plano. Solo vuelve a leer los metadatos de archivos FLAC nuevos o modificados. Si un NAS no está disponible, conserva su índice en vez de vaciar la biblioteca.

Para generar la aplicación y el instalador x64:

```powershell
npm.cmd run make:win
```

El instalador se genera en `out\make\squirrel.windows\x64\Flac Cast Setup.exe`.

El instalador actual no está firmado digitalmente, por lo que Windows SmartScreen puede mostrar una advertencia al distribuirlo en otros equipos.

## Límite de calidad

El MVP acepta FLAC y muestra su resolución. La meta de Cast es 24-bit/96 kHz. La reproducción local inicial usa la mezcla normal de Windows; salida WASAPI exclusiva/bit-perfect se evaluará como módulo nativo en una etapa posterior.
