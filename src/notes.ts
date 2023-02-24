type SingleError = {
	code: string;
	message: string;
	detail: unknown;
}

type ErrorResponse = SingleError[];


// ENDPOINTS


// PULLING AN IMAGE

// GET /v2/<name>/manifests/<reference> - pulling an image manifest
// https://docs.docker.com/registry/spec/api/#pulling-an-image-manifest

// GET /v2/<name>/blobs/<digest> - pulling a layer
// https://docs.docker.com/registry/spec/api/#pulling-a-layer


// PUSHING AN IMAGE

// POST /v2/<name>/blobs/uploads/ - pushing a layer
// https://docs.docker.com/registry/spec/api/#pushing-a-layer

// HEAD /v2/<name>/blobs/<digest> - existing layers
// https://docs.docker.com/registry/spec/api/#existing-layers

// GET /v2/<name>/blobs/uploads/<uuid> - upload progress
// https://docs.docker.com/registry/spec/api/#upload-progress

// PUT /v2/<name>/blobs/uploads/<uuid>?digest=<digest> - monolithic upload
// https://docs.docker.com/registry/spec/api/#monolithic-upload

// PATCH /v2/<name>/blobs/uploads/<uuid> - chunked upload
// https://docs.docker.com/registry/spec/api/#chunked-upload

// PUT /v2/<name>/blobs/uploads/<uuid>?digest=<digest> - completed upload
// https://docs.docker.com/registry/spec/api/#completed-upload

// POST /v2/<name>/blobs/uploads/?mount=<digest>&from=<repository name> - cross repository blob mount
// https://docs.docker.com/registry/spec/api/#cross-repository-blob-mount

// DELETE /v2/<name>/blobs/<digest> - deleting a layer
// https://docs.docker.com/registry/spec/api/#deleting-a-layer

// PUT /v2/<name>/manifests/<reference> - pushing an image manifest
// https://docs.docker.com/registry/spec/api/#pushing-an-image-manifest

// GET /v2/_catalog - listing repositories
// https://docs.docker.com/registry/spec/api/#listing-repositories

// GET /v2/<name>/tags/list - listing tags
// https://docs.docker.com/registry/spec/api/#tags

// DELETE /v2/<name>/manifests/<reference> - deleting an image manifest
// https://docs.docker.com/registry/spec/api/#deleting-an-image-manifest


export {};
