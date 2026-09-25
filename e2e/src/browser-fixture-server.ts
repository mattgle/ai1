import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import { AddressInfo } from "node:net";
import * as path from "node:path";

const page = (title: string, body = "", script = ""): string =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}<script>${script}</script></body></html>`;

export interface LocalCertificate {
  key: Buffer;
  cert: Buffer;
}

// Makes a self-signed certificate for 127.0.0.1 in `folder`. No browser
// trusts it, so a page with it gets a certificate error.
export function makeLocalCertificate(folder: string): LocalCertificate {
  const keyPath = path.join(folder, "fixture-key.pem");
  const certPath = path.join(folder, "fixture-cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

// A local web server for the browser tests. Each page sets its title, so a
// test can read the result from the tab label: the tests cannot read inside
// a `<webview>` from the IDE page. With a certificate, it is an https server.
export class BrowserFixtureServer {
  private readonly server: http.Server;
  private readonly scheme: string;
  url = "";

  constructor(certificate?: LocalCertificate) {
    const handler = (request: http.IncomingMessage, response: http.ServerResponse): void =>
      this.handle(request, response);
    this.server = certificate ? https.createServer(certificate, handler) : http.createServer(handler);
    this.scheme = certificate ? "https" : "http";
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `${this.scheme}://127.0.0.1:${(this.server.address() as AddressInfo).port}/`;
    return this.url;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse): void {
    const html = (body: string, headers: http.OutgoingHttpHeaders = {}): void => {
      response.writeHead(200, { "content-type": "text/html", ...headers });
      response.end(body);
    };
    switch (request.url) {
      case "/form":
        html(
          page(
            "Form",
            `<form method="post" action="/login"><input name="user" value="ai1"></form>`,
            "document.forms[0].submit();",
          ),
        );
        return;
      case "/login":
        response.writeHead(302, { location: "/welcome" });
        response.end();
        return;
      case "/welcome":
        html(page(request.method === "GET" ? "Welcome" : "Wrong method"));
        return;
      case "/set-cookie":
        html(page("Cookie set"), { "set-cookie": "ai1test=1; Path=/" });
        return;
      case "/read-cookie":
        html(
          page(
            "Reading",
            "",
            "document.title = document.cookie ? 'cookie: ' + document.cookie : 'cookie: none';",
          ),
        );
        return;
      case "/popup-opener":
        html(page("Opener", "", "window.open('/popup', 'login', 'width=400,height=400');"));
        return;
      case "/popup":
        html(page("Popup", "", "window.opener.document.title = 'Popup done'; window.close();"));
        return;
      case "/secure":
        html(page("Secure page"));
        return;
      case "/fetch-file":
        html(
          page(
            "Fetching",
            "",
            "fetch('file:///etc/hosts').then((r) => r.text()).then((t) => { document.title = 'fetch: read ' + t.length; }, () => { document.title = 'fetch: failed'; });",
          ),
        );
        return;
      case "/popup-flood":
        html(page("Flood", "", "for (let i = 0; i < 8; i++) { window.open('/flood-tab?' + i); }"));
        return;
      case "/button":
        html(page("Button", `<button id="go" onclick="document.title='Clicked'">Go</button>`));
        return;
      case "/counter":
        html(
          page(
            "count 0",
            "",
            "var ai1Count = 0; setInterval(function () { ai1Count += 1; document.title = 'count ' + ai1Count; }, 200);",
          ),
        );
        return;
      default:
        html(page(request.url?.startsWith("/flood-tab") ? "Flood tab" : "Start"));
    }
  }
}
