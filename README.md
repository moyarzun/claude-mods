# claude-mods

Mods personales para Claude Code.

## pr-list

Agrega el comando `/prs`, que abre un panel con los pull requests del repositorio git actual: tarjetas con título, estado, checks, review y rama, un filtro por estado y el nombre del repo (`owner/repo`) con el ícono de su proveedor. Hacer click en un PR o en el nombre del repo lo abre en el navegador integrado de la app de escritorio de Claude (servidor `Claude_Browser`, herramienta `navigate`) si la sesión lo tiene, o en el navegador del sistema (`open` / `xdg-open`).

Si la sesión se inicia en un repositorio git con un remoto vinculado, el panel se abre solo, sin esperar a `/prs`. Mientras el panel está abierto se actualiza solo cada 15 segundos, así el estado y los checks de cada PR no quedan desactualizados.

Proveedores: GitHub (`gh`), GitLab (`glab`), Gitea (`tea`) y Bitbucket (API pública con `curl`, solo repos públicos). La CLI correspondiente debe estar instalada y con sesión iniciada.

### Instalación

En una sesión de terminal:

```
/plugin install pr-list --marketplace moyarzun/claude-mods
```

Desde la línea de comandos:

```
claude plugin install pr-list --marketplace moyarzun/claude-mods
```

En la app de escritorio: + junto al cuadro de texto, Plugins, Add marketplace con `moyarzun/claude-mods`, luego Add plugin.

## Licencia

[MIT](LICENSE): cualquier persona puede usar, copiar, modificar y redistribuir el mod.
