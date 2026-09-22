# Peek — Environment gate (Task 0)

Date: 2026-09-22 08:45:05 +03:00
Machine: Windows (see OS version below)

## Tool versions (exact output)

- `rustc --version` → `rustc 1.97.1 (8bab26f4f 2026-07-14)`
- `cargo --version` → `cargo 1.97.1 (c980f4866 2026-06-30)`
- `node --version` → `v24.19.0`
- `npm --version` → `11.17.0`
- rustup default toolchain: `stable-x86_64-pc-windows-msvc` (active, default); also installed: `stable-x86_64-pc-windows-gnu`, `1.98.0-x86_64-pc-windows-msvc`

## MSVC status

- `Get-Command cl.exe -ErrorAction SilentlyContinue` in a plain shell → no result (not on PATH — expected outside a Developer Prompt).
- MSVC IS installed: VS 2022 BuildTools, `VC\Tools\MSVC\14.44.35207`, `cl.exe` for x64 present:
  `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe`
- `cl.exe` version: `Microsoft (R) C/C++ Optimizing Compiler Version 19.44.35228 for x64`
- Windows SDK present: `C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0`
- Builds must run from a Developer Prompt (or after `VsDevCmd`/`vcvarsall`) so `cl.exe`/`link.exe` are on PATH.

## WebView2 status

- Installed: `Microsoft Edge WebView2 Runtime`, version `153.0.4234.48` (HKCU EdgeUpdate client record).

## Windows version

- `[System.Environment]::OSVersion` → Platform `Win32NT`, Version `10.0.26200.0`, VersionString `Microsoft Windows NT 10.0.26200.0`
