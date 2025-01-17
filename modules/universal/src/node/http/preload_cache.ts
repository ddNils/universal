import {
  provide,
  OpaqueToken,
  Injectable,
  Optional,
  Inject,
  EventEmitter,
  NgZone
} from 'angular2/core';

import {Observable} from 'rxjs';

import {
  Http,
  Connection,
  ConnectionBackend,
  // XHRConnection,
  XHRBackend,
  RequestOptions,
  ResponseType,
  ResponseOptions,
  ResponseOptionsArgs,
  RequestOptionsArgs,
  BaseResponseOptions,
  BaseRequestOptions,
  Request,
  Response,
  ReadyState,
  BrowserXhr,
  RequestMethod
} from 'angular2/http';
import {MockBackend} from 'angular2/src/http/backends/mock_backend';


import {isPresent, isBlank, CONST_EXPR} from 'angular2/src/facade/lang';

// CJS
import {XMLHttpRequest} from 'xhr2';
// import XMLHttpRequest = require('xhr2');


export const BASE_URL: OpaqueToken = CONST_EXPR(new OpaqueToken('baseUrl'));

export const PRIME_CACHE: OpaqueToken = CONST_EXPR(new OpaqueToken('primeCache'));

export function buildBaseUrl(url: string, existing?: boolean): any {
  let prop = existing ? 'useExisting' : 'useValue';
  return provide(BASE_URL, { [prop]: url });
}

export class NodeXhrConnection implements Connection {
  request: Request;
  /**
   * Response {@link EventEmitter} which emits a single {@link Response} value on load event of
   * `XMLHttpRequest`.
   */
  response: any;  // TODO: Make generic of <Response>;
  readyState: ReadyState;
  constructor(req: Request, browserXHR: BrowserXhr, baseResponseOptions?: ResponseOptions) {
    this.request = req;
    this.response = new Observable(responseObserver => {
      let _xhr: any = browserXHR.build();
      _xhr.open(RequestMethod[req.method].toUpperCase(), req.url);
      // load event handler
      let onLoad = () => {
        // responseText is the old-school way of retrieving response (supported by IE8 & 9)
        // response/responseType properties were introduced in XHR Level2 spec (supported by
        // IE10)
        let response = ('response' in _xhr) ? _xhr.response : _xhr.responseText;

        // normalize IE9 bug (http://bugs.jquery.com/ticket/1450)
        let status = _xhr.status === 1223 ? 204 : _xhr.status;

        // fix status code when it is 0 (0 status is undocumented).
        // Occurs when accessing file resources or on Android 4.1 stock browser
        // while retrieving files from application cache.
        if (status === 0) {
          status = response ? 200 : 0;
        }
        var responseOptions = new ResponseOptions({body: response, status: status});
        if (isPresent(baseResponseOptions)) {
          responseOptions = baseResponseOptions.merge(responseOptions);
        }
        responseObserver.next(new Response(responseOptions));
        // TODO(gdi2290): defer complete if array buffer until done
        responseObserver.complete();
      };
      // error event handler
      let onError = (err) => {
        var responseOptions = new ResponseOptions({body: err, type: ResponseType.Error});
        if (isPresent(baseResponseOptions)) {
          responseOptions = baseResponseOptions.merge(responseOptions);
        }
        responseObserver.error(new Response(responseOptions));
      };

      if (isPresent(req.headers)) {
        req.headers.forEach((values, name) => _xhr.setRequestHeader(name, values.join(',')));
      }

      _xhr.addEventListener('load', onLoad);
      _xhr.addEventListener('error', onError);

      _xhr.send(this.request.text());

      return () => {
        _xhr.removeEventListener('load', onLoad);
        _xhr.removeEventListener('error', onError);
        _xhr.abort();
      };
    });
  }
}


@Injectable()
export class NodeXhr {
  _baseUrl: string;
  constructor(@Optional() @Inject(BASE_URL) baseUrl?: string) {

    if (isBlank(baseUrl)) {
      throw new Error('No base url set. Please provide a BASE_URL bindings.');
    }

    this._baseUrl = baseUrl;

  }
  build(): XMLHttpRequest {
    let xhr = new XMLHttpRequest();
    xhr.nodejsSet({ baseUrl: this._baseUrl });
    return xhr;
  }
}

@Injectable()
export class NodeXhrBackend {
  constructor(private _browserXHR: BrowserXhr, private _baseResponseOptions: ResponseOptions) {
  }
  createConnection(request: any): Connection {
    return new NodeXhrConnection(request, this._browserXHR, this._baseResponseOptions);
  }
}

@Injectable()
export class NgPreloadCacheHttp extends Http {
  _async: number = 0;
  _callId: number = 0;
  _rootNode;
  _activeNode;
  constructor(
    protected _backend: ConnectionBackend,
    protected _defaultOptions: RequestOptions,
    @Inject(NgZone) protected _ngZone: NgZone,
    @Optional() @Inject(PRIME_CACHE) protected prime?: boolean) {

    super(_backend, _defaultOptions);

    var _rootNode = { children: [], res: null };
    this._rootNode = _rootNode;
    this._activeNode = _rootNode;


  }

  preload(factory) {

    var obs = new EventEmitter(true);

    var currentNode = null;

    if (isPresent(this._activeNode)) {
      currentNode = { children: [], res: null };
      this._activeNode.children.push(currentNode);
    }

    // We need this to ensure all ajax calls are done before rendering the app
    this._async += 1;
    var request = factory();

    request.subscribe({
        next: (response) => {
          let headers = {};
          response.headers.forEach((value, name) => {
            headers[name] = value;
          });

          let res = (<any>Object).assign({}, response, { headers });

          if (isPresent(currentNode)) {
            currentNode.res = res;
          }
          obs.next(response);
        },
        error: (e) => {
          this._async -= 1;
          obs.error(e);
        },
        complete: () => {
          this._activeNode = currentNode;
          this._async -= 1;
          this._activeNode = null;
          obs.complete();
        }
    });

    return request;
  }

  request(url: string | Request, options?: RequestOptionsArgs): Observable<Response> {
    return isBlank(this.prime) ? super.request(url, options) : this.preload(() => super.request(url, options));
  }

  get(url: string, options?: RequestOptionsArgs): Observable<Response> {
    return isBlank(this.prime) ? super.get(url, options) : this.preload(() => super.get(url, options));

  }

  post(url: string, body: string, options?: RequestOptionsArgs): Observable<Response> {
    return isBlank(this.prime) ? super.post(url, body, options) : this.preload(() => super.post(url, body, options));
  }

  put(url: string, body: string, options?: RequestOptionsArgs): Observable<Response> {
    return isBlank(this.prime) ? super.put(url, body, options) : this.preload(() => super.put(url, body, options));
  }

  delete(url: string, options?: RequestOptionsArgs): Observable<Response> {
    return isBlank(this.prime) ? super.delete(url, options) : this.preload(() => super.delete(url, options));

  }

  patch(url: string, body: string, options?: RequestOptionsArgs): Observable<Response> {
    return isBlank(this.prime) ? super.patch(url, body, options) : this.preload(() => super.patch(url, body, options));
  }

  head(url: string, options?: RequestOptionsArgs): Observable<Response> {
    return isBlank(this.prime) ? super.head(url, options) : this.preload(() => super.head(url, options));
  }


}
