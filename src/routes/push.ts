import { IRequest } from 'itty-router';
import { Env } from '../index';
import { checkAuth } from '../util/auth';
import * as errors from '../util/errors';


// POST /v2/<name>/blobs/uploads/
// https://docs.docker.com/registry/spec/api/#initiate-blob-upload
export async function initiateBlobUpload(req: IRequest, env: Env): Promise<Response> {
	if (!checkAuth(req)) {
		return errors.unauthorized();
	}

	const sessionId = crypto.randomUUID();
	const upload = await env.dataBucket.createMultipartUpload(sessionId, {
		customMetadata: {
			'a': 'b',
		},
	});
	console.log(`New session: ${sessionId} (uploadId=${upload.uploadId})`);

	return new Response('', {
		status: 202,
		headers: {
			'Docker-Distribution-API-Version': 'registry/2.0',
			'Location': `/v2/${req.params.name}/blobs/uploads/${sessionId}?_state=${encodeURIComponent(upload.uploadId)}`,
			'Docker-Upload-UUID': sessionId,
			'Range': '0-0',
		},
	});
}

export async function chunkedBlobUpload(req: IRequest, env: Env): Promise<Response> {
	if (!checkAuth(req))
		return errors.unauthorized();


	// console.log("PARAMS: " + JSON.stringify(req.params));
	// console.log("QUERY: " + JSON.stringify(req.query));
	// console.log("BODY LEN: " + req.body.length);
	// r.headers.forEach((v, k) => {
	// 	console.log(`${k}: ${v}`);
	// })
	// console.log("BODY: '" + (await r.blob()).size + "'");

	// const range = req.headers.get('Content-Range');
	// if (!range) {
	// 	console.log(req.headers);
	// 	return errors.notImplemented();
	// }
	// const [start, end] = range.split('-');

	const r = req as unknown as Request;
	const sessionId = req.params.uuid;
	const uploadId = req.query._state as string;

	console.log(`Chunked upload: ${sessionId} (uploadId=${uploadId})`);
	const upload = await env.dataBucket.resumeMultipartUpload(sessionId, uploadId);

	if (!r.body) {
		console.log('NO BODY');
		return errors.notImplemented();
	}

	// const [body1, body2] = r.body.tee();

	const res = await upload.uploadPart(1, r.body);
	console.log(`Uploaded part: ${JSON.stringify(res)}`);

	const size = parseInt(r.headers.get('Content-Length')!);

	// await upload.abort();
	// console.log("Aborted upload");

	return new Response(null, {
		status: 202,
		headers: {
			'Docker-Distribution-API-Version': 'registry/2.0',
			// 'Content-Type': 'application/json; charset=utf-8',
			'Location': `/v2/${req.params.name}/blobs/uploads/${sessionId}?_state=${encodeURIComponent(uploadId)}&part=${encodeURIComponent(JSON.stringify(res))}`,
			'Docker-Upload-UUID': req.params.uuid,
			'Range': `0-${size}`,
			'Content-Length': '0',
			'X-Content-Type-Options': 'nosniff',
			// 'Range': `0-${end}`,
		},
	});
}

export async function completedUpload(req: IRequest, env: Env): Promise<Response> {
	if (!checkAuth(req))
		return errors.unauthorized();

	const r = req as unknown as Request;
	const sessionId = req.params.uuid;
	const uploadId = req.query._state as string;
	const part = JSON.parse(req.query.part as string);
	console.log('Part info: ' + JSON.stringify(part));

	const upload = env.dataBucket.resumeMultipartUpload(sessionId, uploadId);
	console.log('Upload object: ' + JSON.stringify(upload));
	const res = await upload.complete([part]); //todo handle errors on all of these calls

	console.log(`Completed upload: ${JSON.stringify(res)}`);

	const digest = req.query.digest as string;
	console.log('UPLOAD DIGEST: ' + digest);

	const obj = await env.dataBucket.get(sessionId);
	const realObj = await env.dataBucket.put(digest, obj!.body, {
		sha256: digest.slice(7),
	});
	await env.dataBucket.delete(sessionId);
	console.log(`REAL upload: ${JSON.stringify(realObj)}, ${realObj.checksums.sha256}`);


	// const obj = await env.dataBucket.head(sessionId);
	// console.log(`HEAD: ${JSON.stringify(obj)}`);

	return new Response('', {
		status: 201,
	});
}

export async function pushManifest(req: IRequest, env: Env): Promise<Response> {
	if (!checkAuth(req))
		return errors.unauthorized();

	const r = req as unknown as Request;
	const name = req.params.name;
	const ref = req.params.ref as string;

	//todo ensure body not null

	const [body1, body2] = r.body!.tee();
	const sha256 = new crypto.DigestStream('SHA-256');
	await body2.pipeTo(sha256);

	const obj = await env.dataBucket.put(`${name}/${ref}`, body1, {
		sha256: await sha256.digest,
	});
	const hexString = [...new Uint8Array(obj.checksums.sha256!)]
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
	console.log(`PUT manifest: ${JSON.stringify(obj)}`);

	return new Response('', {
		status: 201,
		headers: {
			'Location': `/v2/${name}/manifests/${ref}`,
			'Docker-Content-Digest': `sha256:${hexString}`,
		},
	});
}


export {};
