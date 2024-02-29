# Httpolyglot-bun

> As of 29.02.2024 bun does not support `http2.createServer` This fork is only needed until bun supports this.

Track bun support of `http2.createServer` [here](https://github.com/oven-sh/bun/issues/8823)

A module for serving HTTP, HTTPS and ~~HTTP/2~~ connections, all over the same port.

## Documentation

Take a look at the orignal package [Readme.md](https://github.com/httptoolkit/httpolyglot)

## Install
============

    npm install @httptoolkit/httpolyglot


## Why this package?

Some packages like [mockttp](https://github.com/httptoolkit/mockttp) have httptoolkit and httppolyglot as a dependency. If you want to use these packages in bun today, you need to prevent the call to unsupported functions in bun.
