# Android and Windows display testing

Use the authenticated player at **`/player?kiosk=1`** on both platforms. In Screen control, choose **Open kiosk player**, create a pairing code, and enter it on the physical display. `FEATURE_PLAYER_CONTROL=true` and the existing player migrations must be enabled on the server. Each screen needs its own browser profile and pairing.

The app's kiosk mode requests a screen wake lock, offers **Enter fullscreen**, and hides its controls after six seconds of inactivity. Tap the top-right corner or tab to the settings button to reopen them. **Exit kiosk mode** returns to the ordinary player without disconnecting or clearing its cache. The kiosk query survives reloads, including when the service worker restores the cached `/player` shell offline.

Fullscreen needs a user gesture unless the browser/device was launched in fullscreen. Screen wake lock is best effort: the browser can release or deny it because of visibility, battery, or device policy. The player reacquires it when the page becomes visible, and **Retry wake lock** retries a denied request. Configure power and sleep on the device for unattended use. App fullscreen does not enforce OS lockdown or launch the browser after reboot.

## Windows: Chrome or Chromium with a persistent profile

Use the included PowerShell launcher, replacing the origin with your deployed HTTPS server:

```powershell
.\scripts\start-chromium-kiosk.ps1 -AppOrigin 'https://your-easyad-host.example'
```

For a Windows computer running the app locally:

```powershell
.\scripts\start-chromium-kiosk.ps1 -AppOrigin 'http://localhost:3001'
```

Supply `-BrowserPath 'C:\path\to\chrome.exe'` for another Chromium installation. The default profile lives at `%LOCALAPPDATA%\EasyAD\ChromiumKiosk`; supply `-ProfileDirectory` for each additional screen or environment. Pair inside that profile, close with Alt+F4, and run the same command to check that pairing and media survive restart. Do not use Incognito or clear site data. Chrome isolates this display from your personal browser profile; close an existing instance of the display profile before testing new startup flags.

The equivalent manual command, run in Command Prompt, is:

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --no-first-run --no-default-browser-check --user-data-dir="%LOCALAPPDATA%\EasyAD\ChromiumKiosk" "https://your-easyad-host.example/player?kiosk=1"
```

Keep the computer on AC power and configure display/sleep timeouts. For unattended deployment, configure a restricted Windows account and an approved startup/relaunch mechanism. The script only launches the browser; it does not install software or change Windows configuration.

Microsoft Edge is Chromium-based, but its native `--edge-kiosk-type=fullscreen` mode uses InPrivate navigation. Pairing cookies, offline media and unsent playback reports therefore do not persist across kiosk sessions. Prefer persistent Chrome/Chromium for this player. If your organization requires Edge/Assigned Access, qualify its storage lifecycle or design separate managed provisioning before relying on restart recovery. See [Microsoft's kiosk documentation](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode).

## Android: Chrome fullscreen and app pinning

1. Open the deployed **HTTPS** URL ending in `/player?kiosk=1` in current Chrome on the Android device.
2. Pair the display, then tap **Enter fullscreen**. Check the wake-lock status and hide the controls.
3. For a supervised test, enable **App pinning** in Android's security settings, then pin Chrome from Overview. Menu names vary by manufacturer. [Google's pinning guide](https://support.google.com/android/answer/9455138?hl=en) includes the unpin gestures.
4. Keep the device powered. Check both portrait and landscape, browser restart, power restart, and reconnect behavior.

Android Chrome does not expose the desktop `--kiosk` launch workflow. For unattended signage, use an Android Enterprise dedicated-device setup or a managed Chromium/WebView kiosk browser with persistent cookies, IndexedDB, Cache Storage, service workers, fullscreen, and startup after reboot. A wrapper needs qualification against the existing Web Locks and player APIs. [Android lock task mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode) requires device-policy management; app pinning is suitable for supervised testing.

### Testing a local server from Android

Opening `http://<your-computer-LAN-IP>:3001` is an insecure context and disables APIs used by the player. Use a trusted HTTPS development endpoint, or connect via USB with Android SDK Platform Tools and USB debugging:

```sh
adb reverse tcp:3001 tcp:3001
```

Open `http://localhost:3001/player?kiosk=1` in Android Chrome. Here `localhost` is the Android device, and ADB forwards it to the computer's port 3001. Repeat the reverse mapping after reconnecting/rebooting. Keep the server's `APP_ORIGIN` set to the same origin the browser uses. Windows loopback HTTP is also suitable when the server actually runs on that Windows computer.

## Physical-device acceptance checks

- Pair once; confirm the screen's applied revision and visible image, muted video, HTML creative, and emergency override.
- Check portrait/landscape layout and that fullscreen controls disappear and can be reopened by touch or keyboard.
- Leave the display idle on power; verify it stays lit. Test the configured restart/startup mechanism and that the same profile remains paired.
- Disconnect the network after media and the player shell are cached. Reload `/player?kiosk=1` and confirm eligible cached content plays. Reconnect and confirm content updates and queued playback reports synchronize.
- Check unpublishing, revocation, alert expiration and offline lease expiration. Offline cancellation remains bounded by the existing manifest lease; kiosk mode does not extend it.

Browser automation checks the kiosk controls, viewports and cached-shell recovery. It does not prove Android OS pinning, Windows startup, physical display visibility or a real 24-hour power/thermal soak. Record those on each device; see [player recovery qualification](PLAYER_RECOVERY_BASELINE.md).

## Local verification, 2026-10-06

On macOS ARM64 / Node 24, the production build and TypeScript check passed, along with 23 focused player/component tests and two Chromium kiosk browser scenarios (desktop viewport and emulated Android touch viewport). The browser scenarios cover pairing, mode changes without losing the credential, portrait/landscape fit, phone setup without overlapping controls, and decoded media after an offline kiosk reload. The separate mixed-media offline/restart scenario also passed.

Follow-up fixes restored the map mock's style APIs and retained the ordinary media snapshot during emergency overrides under its original revision and lease. The complete isolated suite now passes 322 tests across 68 files. Eight Chromium browser checks also pass, covering both kiosk viewports, mixed-media recovery, text/photo alert restart and expiry, normal updates/revocation, role boundaries, and French/keyboard setup. Actual Android/Windows devices and the PowerShell launcher have not been exercised here.
