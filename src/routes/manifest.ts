import AnyRequest from '../util/request';
import AnyResponse, * as resp from '../util/response';
import { Env } from '../index';
import { hexToDigest } from '../util/digest';

const buildPath = (name: string, ref: string): string => {
	return `${name}/manifests/${ref}`;
};

// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#listing-tags
export const ListTags = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name } = req.params;
	const path = buildPath(name, '');

    console.log(path)
	const result = await env.dataBucket.list({
		prefix: path,
	});

	return resp.OK.withBody(JSON.stringify({
		'name': name,
        'tags': result.objects
			.map(it => it.key.substring(it.key.lastIndexOf("/") + 1))
			.filter(it => !it.startsWith('sha256'))
            .sort(),
	}));
};

// Check if a manifest exists in the registry
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#checking-if-content-exists-in-the-registry
export const HeadManifest = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, ref } = req.params;
	const path = buildPath(name, ref);

	// Get object information from R2
	const res = await env.dataBucket.head(path);
	if (res == null) {
		return resp.ERR_BLOB_UNKNOWN
			.withDetail(`missing manifest ${name}:${ref}`);
	}

	// Add the digest header if we have it.
	const digestHeader: Record<string, string> = {};
	if (res.checksums.sha256 != null) {
		digestHeader['Docker-Content-Digest'] = hexToDigest(res.checksums.sha256!);
	}

	return resp.OK
		.withHeaders({
			'Content-Length': res.size.toString(),
			'Content-Type': res.httpMetadata!.contentType!,
			...digestHeader,
		});
};

// Get a manifest from the registry
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#pulling-manifests
export const GetManifest = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, ref } = req.params;
	const path = buildPath(name, ref);

	// Get object information from R2
	const res = await env.dataBucket.get(path);
	if (res == null) {
		return resp.ERR_BLOB_UNKNOWN
			.withDetail(`missing manifest ${name}:${ref}`);
	}

	// Add the digest header if we have it.
	const digestHeader: Record<string, string> = {};
	if (res.checksums.sha256 != null) {
		digestHeader['Docker-Content-Digest'] = hexToDigest(res.checksums.sha256!);
	}

	return resp.OK
		.withHeaders({
			'Content-Length': res.size.toString(),
			'Content-Type': res.httpMetadata!.contentType!,
			...digestHeader,
		})
		.withBody(res.body);
};


// Check if a manifest exists in the registry
// https://github.com/opencontainers/distribution-spec/blob/main/spec.md#pushing-manifests
export const PutManifest = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, ref } = req.params;
	const path = buildPath(name, ref);

	if (req.body == null) {
		return resp.ERR_MANIFEST_INVALID
			.withDetail(`missing body for ${name}:${ref}`);
	}

	//todo need to validate the manifest payload for a real use case.

	// Split the stream and compute the sha256
	const [body1, body2] = req.body.tee();
	const sha256 = new crypto.DigestStream('SHA-256');
	await body1.pipeTo(sha256);

	const digest = await sha256.digest;
	const digestStr = hexToDigest(digest);

	// Write the object into r2 both as the digest and the path
	const [body3, body4] = body2.tee();
	await env.dataBucket.put(path, body3, {
		sha256: digest,
		httpMetadata: {
			contentType: req.headers.get('Content-Type') ?? 'application/vnd.docker.distribution.manifest.v2+json',
		},
	});
	const obj = await env.dataBucket.put(`${name}/manifests/${digestStr}`, body4, {
		sha256: digest,
		httpMetadata: {
			contentType: req.headers.get('Content-Type') ?? 'application/vnd.docker.distribution.manifest.v2+json',
		},
	});

	//todo ensure the written size is equal to the content-length header

	return resp.CREATED
		.withHeaders({
			'Location': '/v2/' + path,
			'Docker-Content-Digest': hexToDigest(obj.checksums.sha256!),
		});
};

export const DeleteManifest = async (req: AnyRequest, env: Env): Promise<AnyResponse> => {
	const { name, ref } = req.params;
	const path = buildPath(name, ref);

	// Delete the object from
	await env.dataBucket.delete(path);

	return resp.ACCEPTED;
};
