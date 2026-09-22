# Build Environment

| Tool | Version |
|---|---|
| rustc | 1.97.1 (stable-x86_64-pc-windows-msvc) |
| cargo | 1.97.1 |
| node | v24.19.0 |
| npm | 11.17.0 |
| MSVC | VS 2022 BuildTools 14.44 / cl.exe 19.44.35228 |
| WebView2 | 153.0.4234.48 |
| Windows | 10.0.26200.0 (Win11 compatible) |

> **Note for contributors:** `cl.exe` is not on the plain shell PATH on this machine.
> Load the VS Developer environment before running any `cargo` command:
> ```powershell
> & "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64
> ```
> See [README.md](README.md#getting-started) for full setup instructions.
