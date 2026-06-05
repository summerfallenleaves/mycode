#!/usr/bin/env node
/**
 * @fileoverview CLI entry point: argument parsing, Agent initialization, mounts the Ink App component
 * @module @my-agent/cli/src/index
 */
import React from 'react'
import meow from 'meow'
import { render } from 'ink'
import App from './app.js'

const cli = meow(
  `
  Usage
    $ mycode [options]

  Options
    --continue, -c <sessionId>  Resume a previous session
    --help                      Show help
    --version                   Show version
`,
  {
    importMeta: import.meta,
    flags: {
      continueSessionId: {
        type: 'string',
        shortFlag: 'c',
      },
    },
  },
)

render(React.createElement(App, { continueSessionId: cli.flags.continueSessionId }))


