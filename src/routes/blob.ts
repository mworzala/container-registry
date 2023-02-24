import AnyRequest from '../util/request';
import AnyResponse, * as resp from '../util/response';
import { Env } from '../index';
import { hexToDigest } from '../util/digest';
import * as errors from '../util/errors';

const buildPath = (name: string, digest: string): string => {
	return `${name}/blobs/${digest}`;
};

// Check if a blob exists in the registry
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#checking-if-content-exists-in-the-registry
export const HeadBlob = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, digest } = req.params;
	const path = buildPath(name, digest);

	// Get object information from R2
	const res = await env.dataBucket.head(path)
	if (res == null) {
		return resp.ERR_BLOB_UNKNOWN
			.withDetail(`missing digest '${digest}' for ${name}`)
	}

	// Add the digest header if we have it.
	const digestHeader: Record<string, string> = {};
	if (res.checksums.sha256 != null) {
		digestHeader["Docker-Content-Digest"] = hexToDigest(res.checksums.sha256!);
	}

	return resp.OK
		.withHeaders({
			"Content-Length": res.size.toString(),
			...digestHeader,
		})
}

export const GetBlob = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, digest } = req.params;
	const path = buildPath(name, digest);

	// Get object information from R2
	const res = await env.dataBucket.get(path)
	if (res == null) {
		return resp.ERR_BLOB_UNKNOWN
			.withDetail(`missing digest '${digest}' for ${name}`)
	}

	// Add the digest header if we have it.
	const digestHeader: Record<string, string> = {};
	if (res.checksums.sha256 != null) {
		digestHeader["Docker-Content-Digest"] = hexToDigest(res.checksums.sha256!);
	}

	return resp.OK
		.withBody(res.body)
		.withHeaders({
			"Content-Length": res.size.toString(),
			...digestHeader,
		});
}


// POST /v2/<name>/blobs/uploads/
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#post-then-put
export const InitiateBlobUpload = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name } = req.params;
	const sessionId = crypto.randomUUID();

	const upload = await env.dataBucket.createMultipartUpload(sessionId)
	const state: UploadState = {uploadId: upload.uploadId, parts: []}
	console.log(`New upload session: ${sessionId} -> ${upload.uploadId}`)

	const headers = new Headers();
	headers.set("Docker-Upload-UUID", sessionId);
	const stateStr = encodeURIComponent(JSON.stringify(state))
	headers.set("Location", `/v2/${name}/blobs/uploads/${sessionId}?_state=${stateStr}`)
	headers.set("Content-Range", "0-0");
	headers.set("Range", "0-0");
	headers.set("Content-Length", "0");

	return resp.ACCEPTED.withHeaders(headers);
}

// PATCH /v2/<name>/blobs/uploads/<uuid>
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#pushing-a-blob-in-chunks
export const ChunkedBlobUpload = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, uuid: sessionId } = req.params;
	const state = JSON.parse(req.query._state as string) as UploadState; //todo validate me

	if (req.body == null) {
		//todo what error here?
		console.log("NO BODY")
		return errors.notImplemented();
	}

	const upload = await env.dataBucket.resumeMultipartUpload(sessionId, state.uploadId);


	const [body1, body2] = req.body.tee();

	const uploadTask = upload.uploadPart(state.parts.length + 1, body2);

	let bodySize = 0;
	const body1Reader = body1.getReader();
	while (true) {
		const { done, value } = await body1Reader.read();
		if (done) {
			break;
		}
		bodySize += value.length;
	}

	const res = await uploadTask;
	state.parts.push(res);
	console.log(`Uploaded part in ${sessionId}: ${res.partNumber} -> ${res.etag}`);

	const headers = new Headers();
	headers.set("Docker-Upload-UUID", sessionId);
	const stateStr = encodeURIComponent(JSON.stringify(state))
	headers.set("Location", `/v2/${name}/blobs/uploads/${sessionId}?_state=${stateStr}`)
	headers.set("Range", `0-${bodySize}`); //todo

	return resp.ACCEPTED.withHeaders(headers);
}

// PUT /v2/<name>/blobs/uploads/<uuid>
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#pushing-a-blob-in-chunks
export const CompleteBlobUpload = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, uuid: sessionId } = req.params;
	const { _state, digest } = req.query;
	const state = JSON.parse(_state as string) as UploadState; //todo validate me

	const upload = env.dataBucket.resumeMultipartUpload(sessionId, state.uploadId);
	await upload.complete(state.parts); //todo handle errors on all of these calls

	// Move the object to the correct location
	const path = buildPath(name, digest as string);
	const obj = (await env.dataBucket.get(sessionId))!;
	await env.dataBucket.put(path, obj!.body, {
		sha256: (digest as string).slice(7),
	})
	await env.dataBucket.delete(sessionId)
	console.log(`Completed upload ${sessionId}: ${path}`);

	return resp.CREATED
		.withHeaders({
			"Location": "/v2/" + path,
		});
}


interface UploadState {
	uploadId: string;
	parts: R2UploadedPart[];
}

