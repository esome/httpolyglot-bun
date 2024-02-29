import * as net from 'net';
import * as tls from 'tls';
import * as http from 'http';
import * as https from 'https';

import { EventEmitter } from 'events';

declare module 'net' {
  interface Socket {
    /**
     * Only preserved for types backward compat - always undefined in new releases.
     *
     * @deprecated
     */
    __httpPeekedData?: Buffer;
  }
}

function onError(err: any) {}

const TLS_HANDSHAKE_BYTE = 0x16; // SSLv3+ or TLS handshake

const NODE_MAJOR_VERSION = parseInt(process.version.slice(1).split('.')[0], 10);

export class Server extends net.Server {

  private _httpServer: http.Server;
  private _tlsServer: EventEmitter;

  /**
   * Create an Httpolyglot instance with just a request listener to support plain-text
   * HTTP & HTTP/2 on the same port, with incoming TLS connections being closed immediately.
   */
  constructor(requestListener: http.RequestListener);
  /**
   * Call with a full TLS configuration to create a TLS+HTTP+HTTP/2 server, which can
   * support all protocols on the same port.
   */
  constructor(config: https.ServerOptions, requestListener: http.RequestListener);
  /**
   * Pass an existing TLS server, instead of TLS configuration, to create a TLS+HTTP+HTTP/2
   * server. All incoming TLS requests will be emitted as 'connection' events on the given
   * TLS server, and all 'secureConnection' events coming from the TLS server will be
   * handled according to the connection type detected on that socket.
   */
  constructor(tlsServer: tls.Server, requestListener: http.RequestListener);
  constructor(
    configOrServerOrListener:
      | https.ServerOptions
      | tls.Server
      | http.RequestListener,
    listener?: http.RequestListener
  ) {
    // We just act as a plain TCP server, accepting and examing
    // each connection, then passing it to the right subserver.
    super((socket) => this.connectionListener(socket));

    let tlsConfig: https.ServerOptions | undefined;
    let tlsServer: tls.Server | undefined;
    let requestListener: http.RequestListener;

    if (typeof configOrServerOrListener === 'function') {
      requestListener = configOrServerOrListener;
      tlsConfig = undefined;
    } else if (configOrServerOrListener instanceof tls.Server) {
      tlsServer = configOrServerOrListener;
      requestListener = listener!;
    } else {
      tlsConfig = configOrServerOrListener;
      requestListener = listener!;
    }

    // We bind the request listener, so 'this' always refers to us, not each subserver.
    // This means 'this' is consistent (and this.close() works).
    const boundListener = requestListener.bind(this);

    // Create subservers for each supported protocol:
    this._httpServer = new http.Server(boundListener);

    if (tlsServer) {
      // If we've been given a preconfigured TLS server, we use that directly, and
      // subscribe to connections there
      this._tlsServer = tlsServer;
      this._tlsServer.on('secureConnection', this.tlsListener.bind(this));
    } else if (typeof tlsConfig === 'object') {
      // If we have TLS config, create a TLS server, which will pass sockets to
      // the relevant subserver once the TLS connection is set up.
      this._tlsServer = new tls.Server(tlsConfig, this.tlsListener.bind(this));
    } else {
      // Fake server that rejects all connections:
      this._tlsServer = new EventEmitter();
      this._tlsServer.on('connection', (socket) => socket.destroy());
    }

    const subServers = [this._httpServer, this._tlsServer];

    // Proxy all event listeners setup onto the subservers, so any
    // subscriptions on this server are fed from all the subservers
    this.on('newListener', function (eventName, listener) {
      subServers.forEach(function (subServer) {
        subServer.addListener(eventName, listener);
      })
    });

    this.on('removeListener', function (eventName, listener) {
      subServers.forEach(function (subServer) {
        subServer.removeListener(eventName, listener);
      })
    });
  }

  private connectionListener(socket: net.Socket) {
    const data = socket.read();

    if (data === null) {
      socket.removeListener('error', onError);
      socket.on('error', onError);

      socket.once('readable', () => {
        this.connectionListener(socket);
      });
    } else {
      socket.removeListener('error', onError);

      // Put the peeked data back into the socket
      const firstByte = data[0];
      socket.unshift(data);

      // Pass the socket to the correct subserver:
      if (firstByte === TLS_HANDSHAKE_BYTE) {
        // TLS sockets don't allow half open
        socket.allowHalfOpen = false;
        this._tlsServer.emit('connection', socket);
      } else {
        this._httpServer.emit('connection', socket);
      }
    }
  }

  private tlsListener(tlsSocket: tls.TLSSocket) {
    if (
      tlsSocket.alpnProtocol === false || // Old non-ALPN client
      tlsSocket.alpnProtocol === 'http/1.1' || // Modern HTTP/1.1 ALPN client
      tlsSocket.alpnProtocol === 'http 1.1' // Broken ALPN client (e.g. https-proxy-agent)
    ) {
      this._httpServer.emit('connection', tlsSocket);
    }
  }
}

/**
 * Create an Httpolyglot instance with just a request listener to support plain-text
 * HTTP & HTTP/2 on the same port, with incoming TLS connections being closed immediately.
 */
export function createServer(requestListener: http.RequestListener): Server;
/**
 * Create an instance with a full TLS configuration to create a TLS+HTTP+HTTP/2 server, which can
 * support all protocols on the same port.
 */
export function createServer(tlsConfig: https.ServerOptions, requestListener: http.RequestListener): Server;
/**
* Create an instance around an existing TLS server, instead of TLS configuration, to create a
* TLS+HTTP+HTTP/2 server with custom TLS handling. All incoming TLS requests will be emitted as
* 'connection' events on the given TLS server, and all 'secureConnection' events coming from the
* TLS server will be handled according to the connection type detected on that socket.
*/
export function createServer(tlsServer: tls.Server, requestListener: http.RequestListener): Server;
export function createServer(configOrServerOrListener:
  | https.ServerOptions
  | http.RequestListener
  | tls.Server,
  listener?: http.RequestListener
) {
  return new Server(configOrServerOrListener as any, listener as any);
};
