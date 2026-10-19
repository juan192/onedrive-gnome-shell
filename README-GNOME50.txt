OneDrive Client v13 - GNOME Shell 50 / Wayland

Changes from v12:
- Keeps the Start/Stop switch as the only service Start/Stop control.
- Removes the redundant Start/Stop menu item.
- Adds: Estado: Detenido / Sincronizando / Sincronizado.
- Adds: Ultima sincronizacion: HH:MM, derived asynchronously from systemd journal.
- Adds: Forzar sincronizacion ahora.
  This does NOT use onedrive --force-sync. While monitor mode is running, launching a
  second onedrive --sync process would conflict with the client database lock.
  Instead, the menu action asynchronously restarts onedrive.service, which triggers
  the monitor's initial synchronization cycle safely.
- Preserves the user's custom active/disabled/working OneDrive icons.
- All systemctl/journalctl/onedrive queries remain asynchronous.

V14 changes:
- Added 'Login / Reautenticar' menu item.
- Uses the official `onedrive --reauth` flow.
- If the monitor service is active, it is stopped asynchronously before reauthentication to avoid profile/database conflicts.
- The service is not automatically restarted after authentication; use the OneDrive switch when authentication is complete.
