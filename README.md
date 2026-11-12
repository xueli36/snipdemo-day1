# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener. Requires Node.js 20 or newer.

## Usage

```sh
node cli.js help
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
```

Set `SNIP_API` to point at another Snip server; it defaults to `http://localhost:3000`.

The `snip`, `snip.cmd`, and `snip.ps1` wrappers launch `cli.js` on macOS/Linux, Windows Command Prompt, and PowerShell respectively. You can also install the package globally with `npm install -g .` to use the `snip` command.
