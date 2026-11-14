# Shellcraft

A programming puzzle game, starting with the terminal workstation.

## Development

Use Node.js 24 LTS or newer and npm.

```sh
npm ci
npm run dev
```

`npm run build` checks TypeScript and builds to `dist/`.
`npm run typecheck` checks types without building.
`npm test` runs the tests; `npm run test:watch` keeps them running during development.

## Boundaries

- `src/ui/`: React components and workstation presentation.
- Game and shell logic will live outside React.
- Browser storage will sit behind an interface.

This is a local browser application. Node.js runs development tools; there is no application server.
