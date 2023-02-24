// @ts-nocheck
import { Router } from 'itty-router';

import AuthMiddleware from '../middleware/auth';
import { HeadManifest, GetManifest, PutManifest } from './manifest';
import { GetBlob, HeadBlob, InitiateBlobUpload, ChunkedBlobUpload, CompleteBlobUpload } from './blob';

import {CheckVersion} from './meta';


const router = Router();

// Middlewares
router.all("*", AuthMiddleware)

// Meta
router
	.get("/v2", CheckVersion);

// Manifests
router
	// Pull
	.head("/v2/:name+/manifests/:ref", HeadManifest)
	.get("/v2/:name+/manifests/:ref", GetManifest)
	// Push
	.put("/v2/:name+/manifests/:ref", PutManifest);

// Blobs
router
	// Pull
	.head('/v2/:name+/blobs/:digest', HeadBlob)
	.get('/v2/:name+/blobs/:digest', GetBlob)
	// Push
	.post('/v2/:name+/blobs/uploads', InitiateBlobUpload)
	.patch('/v2/:name+/blobs/uploads/:uuid', ChunkedBlobUpload)
	.put('/v2/:name+/blobs/uploads/:uuid', CompleteBlobUpload);

// Other
router.all("*", () => {
	return new Response("", { status: 404 });
});

export {router};
