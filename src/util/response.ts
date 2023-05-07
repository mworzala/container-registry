// Errors

export class APIError {
	private readonly status: number;
	readonly code: string;
	readonly message: string;
	readonly detail?: any;

	constructor(status: number, code: string, message: string, detail?: any) {
		this.status = status;
		this.code = code;
		this.message = message;
		this.detail = detail;
	}

	withDetail(detail: any): APIError {
		return new APIError(this.status, this.code, this.message, detail);
	}

	toResponse(): Response {
		const status = this.status === -1 ? 400 : this.status;
		const headers = this.status === 401 ? new Headers({ 'WWW-Authenticate': 'Basic' }) : undefined;
		return new ResponseBuilder(status, undefined, headers, [this]).toResponse();
	}

}

export const ERR_BLOB_UNKNOWN = new APIError(404, 'BLOB_UNKNOWN', 'blob unknown to registry');
export const ERR_BLOB_UPLOAD_INVALID = new APIError(-1, 'BLOB_UPLOAD_INVALID', 'blob upload invalid');
export const ERR_BLOB_UPLOAD_UNKNOWN = new APIError(-1, 'BLOB_UPLOAD_UNKNOWN', 'blob upload unknown to registry');
export const ERR_DIGEST_INVALID = new APIError(-1, 'DIGEST_INVALID', 'provided digest did not match uploaded content');
export const ERR_MANIFEST_BLOB_UNKNOWN = new APIError(-1, 'MANIFEST_BLOB_UNKNOWN', 'manifest references a manifest or blob unknown to registry');
export const ERR_MANIFEST_INVALID = new APIError(400, 'MANIFEST_INVALID', 'manifest invalid');
export const ERR_MANIFEST_UNKNOWN = new APIError(-1, 'MANIFEST_UNKNOWN', 'manifest unknown to registry');
export const ERR_NAME_INVALID = new APIError(-1, 'NAME_INVALID', 'invalid repository name');
export const ERR_NAME_UNKNOWN = new APIError(-1, 'NAME_UNKNOWN', 'repository name not known to registry');
export const ERR_SIZE_INVALID = new APIError(416, 'SIZE_INVALID', 'provided length did not match content length');
export const ERR_UNAUTHORIZED = new APIError(401, 'UNAUTHORIZED', 'authentication required');
export const ERR_DENIED = new APIError(-1, 'DENIED', 'requested access to the resource is denied');
export const ERR_UNSUPPORTED = new APIError(-1, 'UNSUPPORTED', 'the operation is unsupported');
export const ERR_TOOMANYREQUESTS = new APIError(-1, 'TOOMANYREQUESTS', 'too many requests');


// Any other response

export class ResponseBuilder {
	constructor(
		private readonly status: number,
		private readonly body?: BodyInit,
		private readonly headers?: HeadersInit,
		private readonly errors?: APIError[],
	) {
	}

	withBody(body: BodyInit): ResponseBuilder {
		return new ResponseBuilder(this.status, body, this.headers, this.errors);
	}

	withHeaders(headers: HeadersInit): ResponseBuilder {
		const newHeaders = new Headers();
		for (let [key, value] of new Headers(this.headers))
			newHeaders.set(key, value);
		for (let [key, value] of new Headers(headers))
			newHeaders.set(key, value);
		return new ResponseBuilder(this.status, this.body, newHeaders, this.errors);
	}

	withError(error: APIError): ResponseBuilder {
		return new ResponseBuilder(this.status, this.body, this.headers, this.errors?.concat(error) ?? [error]);
	}

	toResponse(): Response {
		const headers = new Headers();
		headers.set('Docker-Distribution-API-Version', 'registry/2.0');
		if (this.headers != null) {
			for (const [key, value] of new Headers(this.headers)) {
				headers.set(key, value);
			}
		}

		let body: BodyInit | null = this.body ?? null;
		if (this.errors != null) {
			body = JSON.stringify({
				errors: this.errors.map((error) => ({
					code: error.code,
					message: error.message,
					detail: error.detail,
				})),
			});
			headers.set('Content-Type', 'application/json; charset=utf-8');
		}

		return new Response(body, {
			status: this.status,
			headers,
		});
	}
}

export const OK = new ResponseBuilder(200);
export const CREATED = new ResponseBuilder(201);
export const ACCEPTED = new ResponseBuilder(202);


type AnyResponse = Response | APIError | ResponseBuilder;
export default AnyResponse;
