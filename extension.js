/* extension.js
 *
 * GPL-2.0-or-later
 * GNOME Shell 50 compatibility build.
 * Based on dvmasterfx/Onedrive-Gnome-Shell-45.
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('One Drive'));

        this._destroyed = false;
        this._refreshInProgress = false;
        this._serviceActionInProgress = false;
        this._updatingSwitch = false;
        this._folder = '';
        this._lastSyncTimestamp = null;

        this.statusIcon = new St.Icon({
            icon_name: '',
            style_class: 'disabledIcon',
        });

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        box.add_child(this.statusIcon);
        box.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
        this.add_child(box);

        // Service control: the switch is the only Start/Stop control.
        this.menuItemOnOff = new PopupMenu.PopupSwitchMenuItem('OneDrive', false);
        this.menu.addMenuItem(this.menuItemOnOff);
        this.menuItemOnOff.statusAreaKey = 'OneDrive';
        this.menuItemOnOff.connect('toggled', () => {
            if (this._updatingSwitch || this._destroyed)
                return;
            this.onOff(this.menuItemOnOff._switch.state);
        });

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Informational status panel: compact, flat and left-aligned like the other menu items.
        this.syncInfoItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this.syncInfoBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            style_class: 'sync-info-box',
        });

        this.stateLabel = new St.Label({
            text: _('Estado: Detenido'),
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            style_class: 'sync-info-state',
        });
        this.lastSyncLabel = new St.Label({
            text: _('Última sincronización: --'),
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            style_class: 'sync-info-last',
        });

        this.syncInfoBox.add_child(this.stateLabel);
        this.syncInfoBox.add_child(this.lastSyncLabel);
        this.syncInfoItem.add_child(this.syncInfoBox);
        this.menu.addMenuItem(this.syncInfoItem);

        this.itemForceSync = new PopupMenu.PopupMenuItem(_('Forzar sincronización ahora'));
        this.itemForceSync.add_style_class_name('onedrive-menu-item');
        this.itemForceSync.connect('activate', () => {
            this._forceSyncNow();
        });
        this.menu.addMenuItem(this.itemForceSync);

        this.itemReauth = new PopupMenu.PopupMenuItem(_('Login / Reautenticar'));
        this.itemReauth.add_style_class_name('onedrive-menu-item');
        this.itemReauth.connect('activate', () => {
            this._loginReauth();
        });
        this.menu.addMenuItem(this.itemReauth);

        const itemStatus = new PopupMenu.PopupMenuItem(_('Mostrar estado del servicio'));
        itemStatus.add_style_class_name('onedrive-menu-item');
        const statusApp = Gio.AppInfo.create_from_commandline(
            'systemctl --user status onedrive',
            null,
            Gio.AppInfoCreateFlags.SUPPORTS_STARTUP_NOTIFICATION |
            Gio.AppInfoCreateFlags.NEEDS_TERMINAL
        );
        itemStatus.connect('activate', () => {
            statusApp.launch([], global.create_app_launch_context(0, -1));
        });
        this.menu.addMenuItem(itemStatus);

        const itemProcess = new PopupMenu.PopupMenuItem(_('Mostrar proceso del servicio'));
        itemProcess.add_style_class_name('onedrive-menu-item');
        const processApp = Gio.AppInfo.create_from_commandline(
            'journalctl --user-unit=onedrive -f',
            null,
            Gio.AppInfoCreateFlags.SUPPORTS_STARTUP_NOTIFICATION |
            Gio.AppInfoCreateFlags.NEEDS_TERMINAL
        );
        itemProcess.connect('activate', () => {
            processApp.launch([], global.create_app_launch_context(0, -1));
        });
        this.menu.addMenuItem(itemProcess);

        const itemWeb = new PopupMenu.PopupMenuItem(_('Abrir sitio web de OneDrive'));
        itemWeb.add_style_class_name('onedrive-menu-item');
        itemWeb.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri('https://onedrive.live.com/', null);
        });
        this.menu.addMenuItem(itemWeb);

        const itemFolder = new PopupMenu.PopupMenuItem(_('Abrir carpeta local de OneDrive'));
        itemFolder.add_style_class_name('onedrive-menu-item');
        itemFolder.connect('activate', () => {
            if (this._folder)
                Gio.AppInfo.launch_default_for_uri(Gio.File.new_for_path(this._folder).get_uri(), null);
            else
                Main.notify("OneDrive 'sync_dir' not found");
        });
        this.menu.addMenuItem(itemFolder);

        let problem = false;
        for (const binary of ['onedrive', 'systemctl', 'journalctl']) {
            if (!this._checkBinary(binary)) {
                problem = true;
                break;
            }
        }
        if (problem)
            return;

        // All potentially slow external commands are asynchronous.
        this._setOneDriveFolderAsync();
        this._refreshStatusAsync();

        // Five seconds is responsive enough while avoiding excessive journal queries.
        this._refreshLoop = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
            this._refreshStatusAsync();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _checkBinary(binary) {
        if (GLib.find_program_in_path(binary) === null) {
            Main.notify(`I can't find program '${binary}'. This extension will not work!`);
            return false;
        }
        return true;
    }

    _runAsync(argv, callback) {
        let subprocess;
        try {
            subprocess = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
        } catch (e) {
            if (!this._destroyed)
                console.error(`OneDrive extension: failed to start ${argv.join(' ')}: ${e.message}`);
            callback?.(false, '', e.message);
            return;
        }

        subprocess.communicate_utf8_async(null, null, (proc, result) => {
            if (this._destroyed)
                return;
            try {
                const [, stdout, stderr] = proc.communicate_utf8_finish(result);
                callback?.(proc.get_successful(), stdout ?? '', stderr ?? '');
            } catch (e) {
                console.error(`OneDrive extension: command failed ${argv.join(' ')}: ${e.message}`);
                callback?.(false, '', e.message);
            }
        });
    }

    _setOneDriveFolderAsync() {
        this._runAsync(['onedrive', '--display-config'], (ok, stdout) => {
            if (!ok)
                return;

            for (const line of stdout.split('\n')) {
                if (!line.includes("Config option 'sync_dir'"))
                    continue;

                const equals = line.indexOf('=');
                if (equals < 0)
                    continue;

                let folder = line.slice(equals + 1).trim();
                if (folder.startsWith('~/'))
                    folder = GLib.build_filenamev([GLib.get_home_dir(), folder.slice(2)]);
                this._folder = folder;
                break;
            }
        });
    }

    _refreshStatusAsync() {
        if (this._destroyed || this._refreshInProgress || this._serviceActionInProgress)
            return;

        this._refreshInProgress = true;

        this._runAsync(['systemctl', '--user', 'is-active', 'onedrive'], (_ok, stdout) => {
            if (this._destroyed)
                return;

            const active = stdout.trim() === 'active';

            // Read recent messages as JSON so timestamps are machine-readable.
            this._runAsync([
                'journalctl', '--user', '-u', 'onedrive', '-n', '100', '--no-pager', '-o', 'json'
            ], (_journalOk, journalOut) => {
                if (this._destroyed)
                    return;

                const journalState = this._parseJournalState(journalOut);
                if (journalState.lastSyncTimestamp !== null)
                    this._lastSyncTimestamp = journalState.lastSyncTimestamp;

                this._applyState(active, active && journalState.working);
                this._refreshInProgress = false;
            });
        });
    }

    _parseJournalState(journalOut) {
        let lastCompleteIndex = -1;
        let lastSyncTimestamp = null;
        const entries = [];

        for (const line of journalOut.split('\n')) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                entries.push({
                    message: String(entry.MESSAGE ?? ''),
                    timestamp: entry.__REALTIME_TIMESTAMP ? Number(entry.__REALTIME_TIMESTAMP) : null,
                });
            } catch (_e) {
                // Ignore malformed/non-JSON lines without affecting GNOME Shell.
            }
        }

        for (let i = 0; i < entries.length; i++) {
            const message = entries[i].message;
            if (message.includes('Sync with Microsoft OneDrive is complete')) {
                lastCompleteIndex = i;
                if (Number.isFinite(entries[i].timestamp))
                    lastSyncTimestamp = entries[i].timestamp;
            }
        }

        const workingTerms = [
            'Starting a sync',
            'Syncing changes from Microsoft OneDrive',
            'Fetching items from the OneDrive',
            'Scanning the local file system',
            'Performing a database consistency',
            'Downloading',
            'Uploading',
        ];

        // Activity after the most recent completion means the current cycle is working.
        let working = false;
        for (let i = lastCompleteIndex + 1; i < entries.length; i++) {
            const message = entries[i].message;
            if (workingTerms.some(term => message.includes(term))) {
                working = true;
                break;
            }
        }

        // If the service has never completed a cycle yet but is producing startup/sync logs,
        // it is also considered to be synchronising.
        if (lastCompleteIndex < 0 && entries.some(e => workingTerms.some(term => e.message.includes(term))))
            working = true;

        return {working, lastSyncTimestamp};
    }

    _applyState(active, working) {
        if (this._destroyed)
            return;

        if (!active) {
            this.statusIcon.set_property('style_class', 'disabledIcon');
            this._setSwitchState(false);
            this.stateLabel.text = _('Estado: Detenido');
            this._setEmblem();
        } else if (working) {
            this.statusIcon.set_property('style_class', 'workingIcon');
            this._setSwitchState(true);
            this.stateLabel.text = _('Estado: Sincronizando…');
            this._setEmblem('synchronizing');
        } else {
            this.statusIcon.set_property('style_class', 'activeIcon');
            this._setSwitchState(true);
            this.stateLabel.text = _('Estado: Sincronizado');
            this._setEmblem('default');
        }

        this.lastSyncLabel.text = `Última sincronización: ${this._formatLastSync()}`;

        // Force redraw of the styled icon without relying on X11-specific APIs.
        this.statusIcon.set_property('icon_name', 'system-search-symbolic');
        this.statusIcon.set_property('icon_name', '');
    }

    _formatLastSync() {
        if (this._lastSyncTimestamp === null)
            return '--';

        // systemd journal timestamps are microseconds since Unix epoch.
        const seconds = Math.floor(this._lastSyncTimestamp / 1000000);
        const dt = GLib.DateTime.new_from_unix_local(seconds);
        if (!dt)
            return '--';
        return dt.format('%H:%M');
    }

    _setSwitchState(state) {
        if (this.menuItemOnOff._switch.state === state)
            return;

        this._updatingSwitch = true;
        this.menuItemOnOff.setToggleState(state);
        this._updatingSwitch = false;
    }

    _setEmblem(state) {
        if (!this._folder || this._destroyed)
            return;

        const file = Gio.File.new_for_path(this._folder);
        file.query_info_async(
            'metadata::emblems',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null,
            (source, result) => {
                if (this._destroyed)
                    return;
                try {
                    const info = source.query_info_finish(result);
                    info.set_attribute_stringv('metadata::emblems', state === undefined ? [] : [state]);
                    source.set_attributes_async(
                        info,
                        Gio.FileQueryInfoFlags.NONE,
                        GLib.PRIORITY_DEFAULT,
                        null,
                        (fileSource, setResult) => {
                            if (this._destroyed)
                                return;
                            try {
                                fileSource.set_attributes_finish(setResult);
                            } catch (e) {
                                console.debug(`OneDrive extension: emblem update failed: ${e.message}`);
                            }
                        }
                    );
                } catch (e) {
                    console.debug(`OneDrive extension: emblem query failed: ${e.message}`);
                }
            }
        );
    }

    onOff(desiredState) {
        if (this._destroyed || this._serviceActionInProgress)
            return;

        this._serviceActionInProgress = true;
        this.menuItemOnOff.reactive = false;
        this.itemForceSync.reactive = false;
        this.itemReauth.reactive = false;

        const action = desiredState ? 'start' : 'stop';
        this._runAsync(['systemctl', '--user', action, 'onedrive'], (ok, _stdout, stderr) => {
            if (this._destroyed)
                return;

            this._serviceActionInProgress = false;
            this.menuItemOnOff.reactive = true;
            this.itemForceSync.reactive = true;
            this.itemReauth.reactive = true;

            if (!ok) {
                Main.notify(`OneDrive: systemctl ${action} failed${stderr ? `: ${stderr.trim()}` : ''}`);
                this._setSwitchState(!desiredState);
            }

            this._refreshStatusAsync();
        });
    }

    _forceSyncNow() {
        if (this._destroyed || this._serviceActionInProgress)
            return;

        this._serviceActionInProgress = true;
        this.menuItemOnOff.reactive = false;
        this.itemForceSync.reactive = false;
        this.itemReauth.reactive = false;
        this.stateLabel.text = _('Estado: Sincronizando…');
        this.statusIcon.set_property('style_class', 'workingIcon');

        // A second `onedrive --sync` process must not run while --monitor owns the DB.
        // Restarting the monitor service safely triggers its initial synchronisation cycle.
        this._runAsync(['systemctl', '--user', 'restart', 'onedrive'], (ok, _stdout, stderr) => {
            if (this._destroyed)
                return;

            this._serviceActionInProgress = false;
            this.menuItemOnOff.reactive = true;
            this.itemForceSync.reactive = true;
            this.itemReauth.reactive = true;

            if (ok)
                Main.notify(_('OneDrive: sincronización solicitada'));
            else
                Main.notify(`OneDrive: no se pudo iniciar la sincronización${stderr ? `: ${stderr.trim()}` : ''}`);

            this._refreshStatusAsync();
        });
    }

    _launchReauthTerminal() {
        try {
            const reauthApp = Gio.AppInfo.create_from_commandline(
                'onedrive --reauth',
                null,
                Gio.AppInfoCreateFlags.SUPPORTS_STARTUP_NOTIFICATION |
                Gio.AppInfoCreateFlags.NEEDS_TERMINAL
            );
            reauthApp.launch([], global.create_app_launch_context(0, -1));
            Main.notify(_('OneDrive: completa la autenticación en el navegador y la terminal'));
        } catch (e) {
            Main.notify(`OneDrive: no se pudo abrir la reautenticación: ${e.message}`);
        }
    }

    _loginReauth() {
        if (this._destroyed || this._serviceActionInProgress)
            return;

        // `onedrive --reauth` modifies the saved authentication state.  Stop the
        // monitor first so it cannot access the same profile while reauthentication
        // is taking place.  The user can start the service again with the switch.
        this._serviceActionInProgress = true;
        this.menuItemOnOff.reactive = false;
        this.itemForceSync.reactive = false;
        this.itemReauth.reactive = false;

        this._runAsync(['systemctl', '--user', 'is-active', 'onedrive'], (_ok, stdout) => {
            if (this._destroyed)
                return;

            const active = stdout.trim() === 'active';
            if (!active) {
                this._serviceActionInProgress = false;
                this.menuItemOnOff.reactive = true;
                this.itemForceSync.reactive = true;
                this.itemReauth.reactive = true;
                this._launchReauthTerminal();
                return;
            }

            this._runAsync(['systemctl', '--user', 'stop', 'onedrive'], (ok, _stdout, stderr) => {
                if (this._destroyed)
                    return;

                this._serviceActionInProgress = false;
                this.menuItemOnOff.reactive = true;
                this.itemForceSync.reactive = true;
                this.itemReauth.reactive = true;

                if (!ok) {
                    Main.notify(`OneDrive: no se pudo detener el servicio antes de reautenticar${stderr ? `: ${stderr.trim()}` : ''}`);
                    this._refreshStatusAsync();
                    return;
                }

                this._setSwitchState(false);
                this.stateLabel.text = _('Estado: Detenido');
                this._launchReauthTerminal();
                this._refreshStatusAsync();
            });
        });
    }

    cleanup() {
        this._destroyed = true;
        if (this._refreshLoop) {
            GLib.source_remove(this._refreshLoop);
            this._refreshLoop = 0;
        }
    }
});

export default class OnedriveExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (!this._indicator)
            return;

        this._indicator.cleanup();
        this._indicator.destroy();
        this._indicator = null;
    }
}
