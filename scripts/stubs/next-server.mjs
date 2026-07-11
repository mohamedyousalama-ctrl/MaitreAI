// Minimal `next/server` stub for ROUTE-LEVEL harness tests (WO-LIVE-3 §6). Provides
// just enough of NextResponse for a route handler to run under bare-node ESM: the
// static `.json()` used on every return path, and a constructor for `new NextResponse`.
// Never used by production code — only by the webhook-route test loader.
export class NextResponse {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new Map(Object.entries(init.headers ?? {}));
  }
  static json(obj, init = {}) {
    const r = new NextResponse(JSON.stringify(obj), init);
    r._json = obj;
    r.json = async () => obj;
    return r;
  }
}
// NextRequest is only ever imported as a type in the routes (erased by strip-types);
// expose a Request subclass in case a value reference sneaks in.
export class NextRequest extends Request {}
