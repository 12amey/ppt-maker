# Installer hardware page regression check

From this directory, compile with NSIS 3:

```powershell
& 'C:\Program Files (x86)\NSIS\makensis.exe' hardware-check-ui.nsi
& 'C:\Program Files (x86)\NSIS\makensis.exe' /DMIN_RAM_MB=2147483647 /DTEST_OUTPUT=hardware-check-low-memory-ui.exe hardware-check-ui.nsi
```

Run each generated executable. These harnesses include the same
`../hardware-check.nsh` used by the production installer. Their single section
only prints a message; it does not install the app or change the registry.

Check Welcome -> License -> Directory -> System requirements -> Components.
The hardware page must appear promptly and report RAM and the selected disk.
Go Back to Directory, then Next again to verify the page can be revisited.
In the low-memory variant, Next must show the warning; Cancel must keep the
hardware page open. Cancel the wizard after testing.

Production rebuild (from `installer/`):

```powershell
& 'C:\Program Files (x86)\NSIS\makensis.exe' /V3 installer.nsi
```

The existing `../electron/dist/win-unpacked` app payload is repackaged; no
Electron or server rebuild is necessary for this installer-only fix.

For a faster rebuild with a larger output, use
`/DSETUP_COMPRESSION=zlib`. To keep a separate output while another build is
running, also pass `/DSETUP_OUTPUT=dist\Presenton-1.0.0-Setup-fast.exe`.
