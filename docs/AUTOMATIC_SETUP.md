# Automatic vault setup on Windows

The optional helper discovers vaults registered with Obsidian, installs the bundled md-to-kindle plugin and selects one shared email profile. It watches registry changes and also polls every two seconds. It starts at Windows sign-in in a hidden process. It does not scan unrelated drives for vaults or modify Obsidian's core application.

## Install

Requires Windows and Node.js 22+. Update the plugin in a vault with working email settings, reload it, and click **Share this setup on this computer** in its settings. Then extract the helper release and run:

```powershell
powershell -File .\scripts\install-helper.ps1
```

The source project uses the same command after `npm run release`. The installer copies a local Node executable into the helper folder, so moving the source repository later does not break the watcher. No administrator privileges are required. `-SkipStartup` avoids sign-in startup; `-SkipStart` installs without launching the process.

Vaults need to allow community plugins. When no `community-plugins.json` exists, the helper installs the files but waits for Obsidian to create that list; it does not change Restricted Mode. Already-open vaults may need one reload before the added plugin appears. The standard plugin remains available on macOS/Linux in vault-only mode.

## Local files

Files are stored in `%LOCALAPPDATA%\md-to-kindle`, outside vaults:

- `profile.json`: shared email settings and a Windows DPAPI-encrypted app password, protected for the current Windows account. Other programs running as that same user can access it; this is not a sandbox between plugins.
- `helper-config.json`: pause, exclusions and custom configuration directories.
- `state.json`: managed installations and deliberate disable/uninstall opt-outs.
- `status.json`: watcher status and per-vault results. It contains local vault paths but no note content or passwords.
- `helper/`: the bundled watcher, local Node runtime and plugin assets.

Sharing transfers the app password directly from the configured vault's Keychain into protected storage. No password appears in command-line arguments, environment variables, plaintext vault files or logs. The helper never reads/decrypts that password; the plugin unlocks it only for sends and connection tests. There is no plaintext fallback. Setting changes in shared mode apply across participating vaults. A preview keeps its reviewed sender/recipient settings for that send.

**Use vault-only settings** restores a vault's saved local setup. A new vault without a previous setup will need its own email configuration if switched to vault-only mode. To replace the shared app password, switch a configured vault to vault-only mode, link the new Keychain secret, then share again.

## Exclusions and custom configuration folders

Edit `helper-config.json`. The helper reads it on every pass:

```json
{
  "enabled": true,
  "excludedVaults": ["C:\\Notes\\ExcludedVault"],
  "configFolders": {"C:\\Notes\\CustomVault": ".obsidian-custom"}
}
```

Set `enabled` to `false` to pause installation. Exclusion stops future management and leaves existing files intact. Disabling or uninstalling the plugin after enrollment is respected; the helper will not silently undo it. Explicitly re-enabling an installed plugin resumes management. After uninstalling, either reinstall/enable it yourself or stop the helper and remove its entry from `state.json` before restarting. Invalid configurations, unavailable drives and linked plugin directories are skipped without blocking the remaining vaults.

If the helper starts before the shared profile exists, it installs assets but preserves working local settings and does not enable new installations yet. It automatically enrolls them after you share the profile once.

## Updates, status and stopping

The helper uses its bundled local assets; it does not fetch remote updates. After downloading/building an update, rerun `install-helper.ps1`. It stops the old watcher, updates the bundle and restarts it. Settings and passwords are preserved.

Check status from the source checkout using `npm run helper:status`, or:

```powershell
& "$env:LOCALAPPDATA\md-to-kindle\helper\bin\node.exe" "$env:LOCALAPPDATA\md-to-kindle\helper\helper.cjs" --status
```

Stop it and remove sign-in startup with:

```powershell
powershell -File .\scripts\stop-helper.ps1 -DisableStartup
```

The watcher exits within two seconds. The shared profile and installed plugins remain usable. Restart with the installer. Stopping without `-DisableStartup` lets it start again at the next sign-in. To remove all helper/profile files, stop it and remove startup first, switch participating vaults to vault-only settings, then delete the local helper directory yourself. Uninstall md-to-kindle normally through each vault's plugin manager as needed.

Amazon still requires the shared **sender email** on its **Approved Personal Document E-mail List**. Approving that account once applies to sends from all vaults using it; a connection test does not check Amazon approval.
