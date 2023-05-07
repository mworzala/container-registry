import AnyRequest from '../util/request';
import AnyResponse, * as resp from '../util/response';
import { Env } from '../index';
import { hexToDigest } from '../util/digest';
import * as errors from '../util/errors';

const buildPath = (name: string, digest: string): string => {
	return `${name}/blobs/${digest}`;
};

const parseContentRange = (req: AnyRequest): [number, number] => {
	const range = req.headers.get('content-range');
	if (range == null) return [0, 0];
	const [from, to] = range.split('-');
	return [parseInt(from), parseInt(to)];
};

// Check if a blob exists in the registry
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#checking-if-content-exists-in-the-registry
export const HeadBlob = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, digest } = req.params;
	const path = buildPath(name, digest);

	// Get object information from R2
	const res = await env.dataBucket.head(path);
	if (res == null) {
		return resp.ERR_BLOB_UNKNOWN
			.withDetail(`missing digest '${digest}' for ${name}`);
	}

	// Add the digest header if we have it.
	const digestHeader: Record<string, string> = {};
	if (res.checksums.sha256 != null) {
		console.log('MISSING DIGEST');
		digestHeader['Docker-Content-Digest'] = hexToDigest(res.checksums.sha256!);
	}

	return resp.OK
		.withHeaders({
			'Content-Length': res.size.toString(),
			...digestHeader,
		});
};

export const GetBlob = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, digest } = req.params;
	const path = buildPath(name, digest);

	// Get object information from R2
	const res = await env.dataBucket.get(path);
	if (res == null) {
		return resp.ERR_BLOB_UNKNOWN
			.withDetail(`missing digest '${digest}' for ${name}`);
	}

	// Add the digest header if we have it.
	const digestHeader: Record<string, string> = {};
	if (res.checksums.sha256 != null) {
		digestHeader['Docker-Content-Digest'] = hexToDigest(res.checksums.sha256!);
	}

	return resp.OK
		.withBody(res.body)
		.withHeaders({
			'Content-Length': res.size.toString(),
			...digestHeader,
		});
};


// POST /v2/<name>/blobs/uploads/
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#post-then-put
export const InitiateBlobUpload = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name } = req.params;
	const sessionId = crypto.randomUUID();

	console.log('BODYBODYBODY', req.body);

	const upload = await env.dataBucket.createMultipartUpload(sessionId);
	const state: UploadState = { uploadId: upload.uploadId, parts: [], range: 0 };
	console.log(`New upload session: ${sessionId} -> ${upload.uploadId}`);

    let [from, to] = [0, 0];

    if (req.body != null) {
        console.log("BODY IS PRESENT!!!!");

        const uploadedSize = await uploadPart(req, env, sessionId, state);
        to += uploadedSize;
    }

    console.log(`Initiate at ${from}-${to}`)

	const headers = new Headers();
	headers.set('Docker-Upload-UUID', sessionId);
	const stateStr = encodeURIComponent(JSON.stringify(state));
	headers.set('Location', `/v2/${name}/blobs/uploads/${sessionId}?_state=${stateStr}`);
    headers.set('Content-Range', `${from}-${to}`);
    headers.set('Range', `${from}-${to}`);
	headers.set('Content-Length', `${to}`);

	return resp.ACCEPTED.withHeaders(headers);
};

const uploadPart = async (req: AnyRequest, env: Env, sessionId: string, state: UploadState): Promise<number> => {
    const upload = await env.dataBucket.resumeMultipartUpload(sessionId, state.uploadId);

    const [body1, body2] = req.body!.tee();
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
    return bodySize;
}

// PATCH /v2/<name>/blobs/uploads/<uuid>
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#pushing-a-blob-in-chunks
export const ChunkedBlobUpload = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, uuid: sessionId } = req.params;
	const state = JSON.parse(req.query._state as string) as UploadState; //todo validate me

	let [from, to] = parseContentRange(req);
	if (from != 0 && from != state.range) {
		return resp.ERR_SIZE_INVALID;
	}

	if (req.body == null) {
		//todo what error here?
		console.log('NO BODY');
		return errors.notImplemented();
	}

    const uploadedSize = await uploadPart(req, env, sessionId, state);
    to += uploadedSize;

	const headers = new Headers();
	headers.set('Docker-Upload-UUID', sessionId);
	const stateStr = encodeURIComponent(JSON.stringify(state));
	headers.set('Location', `/v2/${name}/blobs/uploads/${sessionId}?_state=${stateStr}`);
	headers.set('Range', `${from}-${to}`);

	return resp.ACCEPTED.withHeaders(headers);
};

// PUT /v2/<name>/blobs/uploads/<uuid>
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#pushing-a-blob-in-chunks
export const CompleteBlobUpload = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, uuid: sessionId } = req.params;
	const { _state, digest } = req.query;
	const state = JSON.parse(_state as string) as UploadState; //todo validate me

    const path = buildPath(name, digest as string);
    let [from, to] = parseContentRange(req);

	const upload = env.dataBucket.resumeMultipartUpload(sessionId, state.uploadId);

    // Upload final part if present
    if (req.body != null) {
        if (to == 0) {
            // In this case we are have no prior upload parts, so upload the entire thing as a single part, ignoring the multipart start.
            await upload.abort();

            // Split the stream and compute the sha256
//            const [body1, body2] = req.body.tee();
//            const sha256 = new crypto.DigestStream('SHA-256');
//            await body1.pipeTo(sha256);

//            const digest = await sha256.digest;

            // Write the object into r2 both as the digest and the path
            await env.dataBucket.put(path, req.body, {
                sha256: (digest as string).slice(7),
            });

            return resp.CREATED
        		.withHeaders({
                    'Location': '/v2/' + path,
                    'Docker-Content-Digest': digest as string,
                });
        }

        // There is a prior upload part, use that.
        const uploadedSize = await uploadPart(req, env, sessionId, state);
        console.log("Added ending part with size: ", uploadedSize, from, to);
    } else if (to == 0) {
        // There has been zero prior upload, and there is no upload here (zero size)
        //todo better error
        await upload.abort();
        return resp.ERR_SIZE_INVALID;
    }


    // Done
	await upload.complete(state.parts); //todo handle errors on all of these calls

	let computedDigest: ArrayBuffer;
	{ // Compute the sha256 of the complete upload. todo need a better way to do this
		const obj = (await env.dataBucket.get(sessionId))!;
		const sha256 = new crypto.DigestStream('SHA-256');
		await obj.body.pipeTo(sha256);
		computedDigest = await sha256.digest;

		console.log(`Provided: ${digest}, Actual: ${hexToDigest(computedDigest)}`);
	}

	// Move the object to the correct location
	const obj = (await env.dataBucket.get(sessionId))!;
	await env.dataBucket.put(path, obj!.body, {
//		sha256: computedDigest,
        sha256: (digest as string).slice(7),
	});
	await env.dataBucket.delete(sessionId);
	console.log(`Completed upload ${sessionId}: ${path}`);

	return resp.CREATED
		.withHeaders({
            'Location': '/v2/' + path,
            'Docker-Content-Digest': digest as string,
		});
};

// DELETE /v2/<name>/blobs/<digest>
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#deleting-blobs
export const DeleteBlob = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, digest } = req.params;
	const path = buildPath(name, digest);

	// Delete the object from R2
	await env.dataBucket.delete(path);

	return resp.ACCEPTED;
};


interface UploadState {
	uploadId: string;
	range: number;
	parts: R2UploadedPart[];
}

