# OneDrive Client for GNOME Shell 50

Extensión para **GNOME Shell 50 / Wayland** que permite controlar y monitorizar el cliente OneDrive para Linux de [abraunegg](https://github.com/abraunegg/onedrive).

## Funciones principales

- Arrancar y detener OneDrive mediante un interruptor.
- Mostrar el estado actual:
  - Detenido
  - Sincronizando
  - Sincronizado
- Mostrar la hora de la última sincronización.
- Forzar una sincronización.
- Login / Reautenticar.
- Mostrar el estado del servicio.
- Mostrar el proceso y logs del servicio.
- Abrir OneDrive en el navegador.
- Abrir la carpeta local de OneDrive.
- Compatible con GNOME Shell 50 y Wayland.

---

# Requisitos

Antes de instalar la extensión debes tener instalado y configurado el cliente OneDrive para Linux:

https://github.com/abraunegg/onedrive

Puedes comprobar que OneDrive está instalado con:

```bash
onedrive --version
```

También puedes comprobar que el servicio existe con:

```bash
systemctl --user status onedrive
```

---

# Instalación

## 1. Descargar la extensión

Descarga el repositorio:

```bash
git clone https://github.com/juan192/onedrive-gnome-shell.git
```

Entra en la carpeta:

```bash
cd onedrive-gnome-shell
```

---

## 2. Comprobar el UUID

El UUID de la extensión se encuentra en:

```text
metadata.json
```

Por ejemplo:

```json
"uuid": "onedrive@juanayala.github.com"
```

La carpeta de instalación debe tener exactamente el mismo nombre que el UUID.

---

## 3. Crear la carpeta de extensiones

Si no existe:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/
```

---

## 4. Copiar la extensión

Suponiendo que el UUID sea:

```text
onedrive@juanayala.github.com
```

ejecuta:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/onedrive@juanayala.github.com
```

Después copia los archivos:

```bash
cp -a ./* ~/.local/share/gnome-shell/extensions/onedrive@juanayala.github.com/
```

También puedes copiar los archivos ocultos si los hubiera con:

```bash
cp -a . ~/.local/share/gnome-shell/extensions/onedrive@juanayala.github.com/
```

---

# Recargar GNOME Shell

## Wayland

En Wayland es necesario cerrar la sesión y volver a entrar.

Puedes hacerlo desde el menú de GNOME o desde terminal:

```bash
gnome-session-quit --logout --no-prompt
```

Después vuelve a iniciar sesión.

## X11

En X11 también puedes cerrar sesión y volver a entrar.

En algunas versiones de GNOME es posible reiniciar GNOME Shell con:

```text
Alt + F2
```

escribir:

```text
r
```

y pulsar Enter.

Esta opción no funciona en Wayland.

---

# Comprobar que GNOME detecta la extensión

Ejecuta:

```bash
gnome-extensions info onedrive@juanayala.github.com
```

Deberías ver información similar a:

```text
Nombre: OneDrive Client
Versión: 1
Activado: No
Estado: INITIALIZED
```

También puedes comprobar que aparece en la lista de extensiones:

```bash
gnome-extensions list | grep -i onedrive
```

---

# Habilitar la extensión

Desde terminal:

```bash
gnome-extensions enable onedrive@juanayala.github.com
```

Comprueba el estado:

```bash
gnome-extensions info onedrive@juanayala.github.com
```

Debería indicar:

```text
Activado: Sí
Estado: ACTIVE
```

También puedes habilitarla desde la aplicación:

```text
Extensiones
```

de GNOME.

---

# Deshabilitar la extensión

Desde terminal:

```bash
gnome-extensions disable onedrive@juanayala.github.com
```

Después puedes comprobarlo con:

```bash
gnome-extensions info onedrive@juanayala.github.com
```

Debería mostrar:

```text
Activado: No
Estado: INACTIVE
```

Deshabilitar la extensión no elimina OneDrive ni sus archivos.

---

# Desinstalar la extensión

Primero deshabilítala:

```bash
gnome-extensions disable onedrive@juanayala.github.com
```

Después elimina la carpeta:

```bash
rm -rf ~/.local/share/gnome-shell/extensions/onedrive@juanayala.github.com
```

Cierra sesión y vuelve a entrar.

---

# Actualizar la extensión

Entra en la carpeta donde clonaste el repositorio:

```bash
cd ~/onedrive-gnome-shell
```

Descarga la última versión:

```bash
git pull
```

Deshabilita la extensión:

```bash
gnome-extensions disable onedrive@juanayala.github.com
```

Copia nuevamente los archivos:

```bash
cp -a . ~/.local/share/gnome-shell/extensions/onedrive@juanayala.github.com/
```

Después cierra sesión:

```bash
gnome-session-quit --logout --no-prompt
```

Vuelve a iniciar sesión y habilita la extensión:

```bash
gnome-extensions enable onedrive@juanayala.github.com
```

---

# Uso

Al activar la extensión aparecerá un icono de OneDrive en la barra superior de GNOME.

El menú muestra:

```text
OneDrive                     [ON/OFF]

Estado: Sincronizado
Última sincronización: 20:00

Forzar sincronización ahora
Login / Reautenticar
Mostrar estado del servicio
Mostrar proceso del servicio
Abrir sitio web de OneDrive
Abrir carpeta local de OneDrive
```

## Interruptor OneDrive

Activa o detiene:

```text
onedrive.service
```

ON:

```bash
systemctl --user start onedrive
```

OFF:

```bash
systemctl --user stop onedrive
```

---

# Estados

La extensión puede mostrar:

```text
Estado: Detenido
```

```text
Estado: Sincronizando…
```

```text
Estado: Sincronizado
```

Además muestra la hora de la última sincronización correcta:

```text
Última sincronización: 20:00
```

---

# Forzar sincronización

La opción:

```text
Forzar sincronización ahora
```

provoca una nueva sincronización del servicio OneDrive.

Durante el proceso el estado debería cambiar a:

```text
Sincronizando…
```

y posteriormente:

```text
Sincronizado
```

---

# Login / Reautenticar

La opción:

```text
Login / Reautenticar
```

ejecuta:

```bash
onedrive --reauth
```

y permite volver a autenticar la cuenta de Microsoft.

Si OneDrive está funcionando, la extensión detiene previamente el servicio para evitar conflictos durante la autenticación.

Después de completar la autenticación puedes volver a activar OneDrive mediante el interruptor.

---

# Diagnóstico

## Comprobar el servicio

```bash
systemctl --user status onedrive
```

## Ver logs en tiempo real

```bash
journalctl --user -u onedrive -f
```

## Ver las últimas 50 líneas

```bash
journalctl --user -u onedrive -n 50 --no-pager
```

## Comprobar la extensión

```bash
gnome-extensions info onedrive@juanayala.github.com
```

---

# Estructura del proyecto

```text
onedrive-gnome-shell/
├── extension.js
├── metadata.json
├── stylesheet.css
├── README.md
├── LICENSE
└── imgs/
    ├── active.png
    ├── disabled.png
    └── working.png
```

---

# Licencia

Este proyecto deriva de:

https://github.com/dvmasterfx/Onedrive-Gnome-Shell-45

y de proyectos anteriores relacionados con OneDrive para GNOME Shell.

Se distribuye bajo licencia:

```text
GPL-2.0-or-later
```

Consulta el archivo `LICENSE` para más información.

---

# Créditos

Cliente OneDrive para Linux:

https://github.com/abraunegg/onedrive

Proyecto original de la extensión:

https://github.com/dvmasterfx/Onedrive-Gnome-Shell-45
