#!/usr/bin/env node
/**
 * @fileoverview CLI entry point: argument parsing, Agent initialization, mounts the Ink App component
 * @module @my-agent/cli/src/index
 */
import React from 'react'
import meow from 'meow'
import { render } from 'ink'
import App from './app.js'

meow(
  `
  Usage
    $ mycode <input>

  Options
    --help     Show help
    --version  Show version
`,
  {
    importMeta: import.meta,
  },
)

render(React.createElement(App))


