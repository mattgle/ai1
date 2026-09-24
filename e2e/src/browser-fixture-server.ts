import * as http from "node:http";
import { AddressInfo } from "node:net";

const page = (title: string, body = "", script = ""): string =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}<script>${script}</script></body></html>`;

// A local web server for the browser tests. Each page sets its title, so a
// test can read the result from the tab label: the tests cannot read inside
// a `<webview>` from the IDE page.
export class BrowserFixtureServer {
  private readonly server = http.createServer((request, response) => this.handle(request, response));
  url = "";

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/`;
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
      case "/button":
        html(page("Button", `<button id="go" onclick="document.title='Clicked'">Go</button>`));
        return;
      default:
        html(page("Start"));
    }
  }
}
