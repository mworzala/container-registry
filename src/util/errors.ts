
enum ErrorCode {
}



type ErrorSet = {
	code: string;
	message: string;
	detail?: unknown;
}[];

export function notImplemented(): Response {
	return makeResponse(405, [{
		code: "UNSUPPORTED",
		message: "The operation is not supported",
	}])
}

export function unauthorized(): Response {
	return makeResponse(401, [{
		code: "UNAUTHORIZED",
		message: "authentication required",
	}], {"WWW-Authenticate": "Basic"})
}

export function nameNotFound(): Response {
	return makeResponse(404, [{
		code: "NAME_UNKNOWN",
		message: "repository name is not known to registry",
	}])
}

export function blobNotFound(): Response {
	return makeResponse(404, [{
		code: "BLOB_UNKNOWN",
		message: "blob unknown to registry",
	}])
}

function makeResponse(code: number, errors: ErrorSet, headers?: Record<string, string>): Response {
	return new Response(
		JSON.stringify({"errors": errors}),
		{
		status: code,
		headers: {
			'Docker-Distribution-API-Version': 'registry/2.0',
			"Content-Type": "application/json; charset=utf-8",
			...headers,
		},
	})
}


