# Arquitectura inicial

## Alcance

- Lee únicamente carpetas elegidas por el usuario.
- Indexa FLAC y muestra resolución, artista, álbum, duración y título.
- Reproduce localmente mediante una URL de loopback protegida por un token efímero.
- Expone el mismo archivo en la red local para Cast, sin subirlo a Internet.
- Admite solicitudes HTTP `HEAD`, `Range` y CORS requeridas por receptores multimedia.

## Flujo

```text
Carpeta local
  ├─ lector de metadatos ──> biblioteca/UI
  └─ servidor HTTP efímero
       ├─ 127.0.0.1 ──> reproductor del PC
       └─ IP de la LAN ──> Chromecast
```

El renderer nunca recibe rutas reales del sistema de archivos. Solo recibe URLs temporales. El servidor mantiene una lista explícita de archivos autorizados y genera un token nuevo en cada ejecución.

## Decisiones

1. **Electron + TypeScript para el primer MVP.** Permite una aplicación instalable y acceso a red local, archivos y protocolos Cast desde Node.
2. **FLAC directo, sin transcodificación.** Google documenta soporte de FLAC hasta 96 kHz/24-bit en sus dispositivos de audio compatibles.
3. **Cast separado del reproductor local.** Chromecast reproduce desde el servidor LAN; el PC actúa como control remoto. No se intenta duplicar la salida de sonido del PC.
4. **Salida local intercambiable.** El elemento de audio sirve para validar biblioteca y UX. Para bit-perfect/WASAPI exclusivo se añadirá luego un backend nativo, sin cambiar la biblioteca ni Cast.

## Google Cast implementado

1. Descubre dispositivos Cast por mDNS/DNS-SD.
2. Conecta con el Default Media Receiver mediante Cast v2.
3. Envía la `castUrl` de la pista seleccionada con MIME `audio/flac`.
4. Sincroniza reproducción, pausa y estado, y permite detener la sesión.
5. Mantiene el servidor protegido por un token efímero y limitado a los archivos seleccionados.

No hay perfiles de calidad: se entrega el FLAC original y el receptor decide si puede decodificarlo. El objetivo validado es hasta 96 kHz/24-bit. La prueba final debe realizarse con el modelo físico de Chromecast objetivo y Firewall de Windows habilitado solo para la red privada.
