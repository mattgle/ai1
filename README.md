# AI1

AI1 means "All In 1". It is a personal desktop IDE for work with coding agents
across a meta-repo: one folder that contains many sibling git repositories.

The design is in `docs/superpowers/specs/`. The plans are in `docs/superpowers/plans/`.

## Requirements

- macOS on arm64
- Node 24 (`nvm use`)
- Xcode command line tools and Python 3

## Commands

| Command                            | Function                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| `npm install`                      | Installs all workspaces                                   |
| `npm run download:plugins`         | Downloads the bundled VS Code extensions from Open VSX    |
| `npm run build`                    | Builds the extensions and the app in development mode     |
| `npm start`                        | Starts the app                                            |
| `npm run lint`                     | Runs ESLint                                               |
| `npm run typecheck`                | Runs the TypeScript type check                            |
| `npm test`                         | Runs the unit tests                                       |
| `scripts/package-mac.sh --install` | Makes the packaged app and installs it in `/Applications` |

Native modules must build with the system compiler:

    export CC=/usr/bin/cc CXX=/usr/bin/c++
